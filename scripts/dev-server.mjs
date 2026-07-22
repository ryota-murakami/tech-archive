import { watch } from "node:fs";
import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildArticleIndex } from "./build-article-index.mjs";

const MODULE_PATH = fileURLToPath(import.meta.url);
const DEFAULT_SITE_ROOT = path.resolve(path.dirname(MODULE_PATH), "../site");
const HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const LIVE_RELOAD_PATH = "/_dev/events";
const LIVE_RELOAD_SNIPPET = `<script data-tech-archive-dev-reload>
(() => {
  const events = new EventSource("${LIVE_RELOAD_PATH}");
  events.addEventListener("reload", () => window.location.reload());
})();
</script>`;
const CONTENT_TYPES = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
]);

/** Validates PORT overrides before the local server binds; called by startDevServer. @param {string|number|undefined} value @returns {number} @example parsePort("4173") */
function parsePort(value) {
  if (value === undefined || value === "") {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError(`PORT must be an integer from 1 to 65535; received ${value}.`);
  }

  return port;
}

/** Selects a safe browser content type whenever a site file is served; called by serveRequest. @param {string} filePath @returns {string} @example contentTypeFor("index.html") */
function contentTypeFor(filePath) {
  return (
    CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) ??
    "application/octet-stream"
  );
}

/** Sends small diagnostic responses for rejected or missing requests; called by serveRequest. @param {import("node:http").ServerResponse} response @param {number} statusCode @param {string} message @returns {void} @example sendTextResponse(response, 404, "Not found") */
function sendTextResponse(response, statusCode, message) {
  const body = `${message}\n`;
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(body);
}

/** Adds the development EventSource client when an HTML page is served; called by serveRequest. @param {Buffer} content @returns {Buffer} @example injectLiveReload(Buffer.from("<body></body>")) */
export function injectLiveReload(content) {
  const html = content.toString("utf8");
  let closingBody;

  // The last closing body tag is the document boundary; earlier matches may be JavaScript strings.
  for (const match of html.matchAll(/<\/body\s*>/gi)) {
    closingBody = match;
  }

  const injected = closingBody
    ? `${html.slice(0, closingBody.index)}${LIVE_RELOAD_SNIPPET}${html.slice(closingBody.index)}`
    : `${html}${LIVE_RELOAD_SNIPPET}`;
  return Buffer.from(injected, "utf8");
}

/** Resolves one URL to a real regular file inside site/ for every static request; called by serveRequest. @param {string} siteRoot @param {string} pathname @returns {Promise<string|null>} @example await resolveRequestFile("/repo/site", "/index.html") */
async function resolveRequestFile(siteRoot, pathname) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  // Backslashes and null bytes are rejected so alternate path syntax cannot escape site/.
  if (decodedPath.includes("\\") || decodedPath.includes("\0")) {
    return null;
  }

  const root = path.resolve(siteRoot);
  const relativePath = decodedPath.replace(/^\/+/, "") || "index.html";
  let candidate = path.resolve(root, relativePath);

  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  try {
    const initialStats = await stat(candidate);

    if (initialStats.isDirectory()) {
      candidate = path.join(candidate, "index.html");
    }

    const [realRoot, realCandidate] = await Promise.all([
      realpath(root),
      realpath(candidate),
    ]);

    // realpath closes the symlink escape that a lexical prefix check cannot detect.
    if (
      realCandidate !== realRoot &&
      !realCandidate.startsWith(`${realRoot}${path.sep}`)
    ) {
      return null;
    }

    return (await stat(realCandidate)).isFile() ? realCandidate : null;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return null;
    }

    throw error;
  }
}

/** Keeps one browser connected for live-reload events during local development; called by serveRequest. @param {import("node:http").IncomingMessage} request @param {import("node:http").ServerResponse} response @param {Set<import("node:http").ServerResponse>} clients @returns {void} @example openEventStream(request, response, clients) */
function openEventStream(request, response, clients) {
  response.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no",
  });
  response.write("event: ready\ndata: connected\n\n");
  clients.add(response);

  // Disconnected tabs are removed immediately so reload broadcasts stay bounded.
  request.once("close", () => {
    clients.delete(response);
  });
}

/** Serves one HTTP request while preventing access beyond site/; called by the Node HTTP server. @param {import("node:http").IncomingMessage} request @param {import("node:http").ServerResponse} response @param {{siteRoot:string,clients:Set<import("node:http").ServerResponse>}} context @returns {Promise<void>} @example await serveRequest(request, response, context) */
async function serveRequest(request, response, { siteRoot, clients }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendTextResponse(response, 405, "Method not allowed");
    return;
  }

  const requestUrl = new URL(request.url ?? "/", `http://${HOST}`);

  if (requestUrl.pathname === LIVE_RELOAD_PATH) {
    if (request.method === "HEAD") {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end();
      return;
    }

    openEventStream(request, response, clients);
    return;
  }

  const filePath = await resolveRequestFile(siteRoot, requestUrl.pathname);

  if (!filePath) {
    sendTextResponse(response, 404, "Not found");
    return;
  }

  const contentType = contentTypeFor(filePath);
  const originalContent = await readFile(filePath);
  const content = contentType.startsWith("text/html")
    ? injectLiveReload(originalContent)
    : originalContent;
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Length": content.length,
    "Content-Type": contentType,
  });

  // HEAD mirrors GET headers while intentionally omitting the response body.
  response.end(request.method === "HEAD" ? undefined : content);
}

/** Adapts async request handling to Node's callback server API; called by startDevServer. @param {{siteRoot:string,clients:Set<import("node:http").ServerResponse>}} context @returns {import("node:http").RequestListener} @example createRequestHandler({siteRoot:"/site",clients:new Set()}) */
function createRequestHandler(context) {
  return (request, response) => {
    void serveRequest(request, response, context).catch((error) => {
      console.error("Request failed.", error);

      if (!response.headersSent) {
        sendTextResponse(response, 500, "Internal server error");
        return;
      }

      response.destroy();
    });
  };
}

/** Notifies every connected page after source or manifest changes; called by watchSite and the heartbeat timer. @param {Set<import("node:http").ServerResponse>} clients @param {string} event @param {string} data @returns {void} @example broadcastEvent(clients, "reload", "changed") */
function broadcastEvent(clients, event, data) {
  const payload = `event: ${event}\ndata: ${data}\n\n`;

  // Broken connections are discarded while healthy tabs receive the same event.
  for (const client of clients) {
    if (client.destroyed || client.writableEnded) {
      clients.delete(client);
      continue;
    }

    client.write(payload);
  }
}

/** Classifies scoped watcher events so unknown article changes build while unknown asset events never self-build; called by watchSite and tests. @param {"articles"|"root"} scope @param {string|Buffer|null|undefined} filename @returns {{rebuildIndex:boolean,reload:boolean}} @example classifyWatchEvent("articles", null) */
export function classifyWatchEvent(scope, filename) {
  const relativePath = filename
    ? filename.toString().split(path.sep).join("/")
    : "";

  if (scope === "articles") {
    return {
      rebuildIndex: !relativePath || /\.html$/i.test(relativePath),
      reload: true,
    };
  }

  if (scope !== "root") {
    throw new TypeError(`Unknown watch scope: ${scope}.`);
  }

  // The article watcher owns this subtree, while a known manifest write is entirely internal.
  if (
    relativePath === "articles" ||
    relativePath.startsWith("articles/") ||
    relativePath === "data/articles.json"
  ) {
    return { rebuildIndex: false, reload: false };
  }

  return { rebuildIndex: false, reload: true };
}

/** Watches articles and root assets separately so generated manifests cannot retrigger builds; called by startDevServer. @param {{siteRoot:string,clients:Set<import("node:http").ServerResponse>}} context @returns {{close:()=>void}} @example watchSite({siteRoot:"/site",clients:new Set()}) */
function watchSite({ siteRoot, clients }) {
  let timer;
  let pendingIndexBuild = false;
  let pendingReload = false;
  let rebuildQueue = Promise.resolve();

  /** Runs the debounced rebuild/reload batch after filesystem events settle; called by scheduleChange. @returns {void} @example flushChanges() */
  function flushChanges() {
    const rebuildIndex = pendingIndexBuild;
    const reload = pendingReload;
    pendingIndexBuild = false;
    pendingReload = false;

    // The queue prevents rapid saves from writing the same manifest concurrently.
    rebuildQueue = rebuildQueue
      .then(async () => {
        if (rebuildIndex) {
          await buildArticleIndex({ siteRoot });
        }

        if (reload) {
          broadcastEvent(clients, "reload", "changed");
        }
      })
      .catch((error) => {
        console.error("Live-reload build failed.", error);
      });
  }

  /** Coalesces scoped filesystem notifications while preserving safe rebuild intent; called by watcher adapters. @param {"articles"|"root"} scope @param {string|Buffer|null} filename @returns {void} @example scheduleChange("articles", "note.html") */
  function scheduleChange(scope, filename) {
    const action = classifyWatchEvent(scope, filename);

    if (!action.reload) {
      return;
    }

    pendingIndexBuild ||= action.rebuildIndex;
    pendingReload = true;
    clearTimeout(timer);
    timer = setTimeout(flushChanges, 80);
  }

  /** Routes recursive article notifications, including filename=null, to index rebuilds; called by fs.watch. @param {string} _eventType @param {string|Buffer|null} filename @returns {void} @example scheduleArticleChange("change", null) */
  function scheduleArticleChange(_eventType, filename) {
    scheduleChange("articles", filename);
  }

  /** Routes non-recursive root asset notifications to reload-only work; called by fs.watch. @param {string} _eventType @param {string|Buffer|null} filename @returns {void} @example scheduleRootChange("change", null) */
  function scheduleRootChange(_eventType, filename) {
    scheduleChange("root", filename);
  }

  const articleWatcher = watch(path.join(siteRoot, "articles"), {
    recursive: true,
  }, scheduleArticleChange);
  const rootAssetWatcher = watch(siteRoot, scheduleRootChange);

  /** Stops pending callbacks when the development server closes; called by startDevServer.close. @returns {void} @example close() */
  function close() {
    clearTimeout(timer);
    articleWatcher.close();
    rootAssetWatcher.close();
  }

  return { close };
}

/** Awaits the HTTP listening event so startup errors reject cleanly; called by startDevServer. @param {import("node:http").Server} server @param {number} port @returns {Promise<void>} @example await listen(server, 4173) */
function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

/** Awaits HTTP shutdown so callers know every connection has stopped; called by startDevServer.close. @param {import("node:http").Server} server @returns {Promise<void>} @example await closeHttpServer(server) */
function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/** Builds the archive then starts its safe local preview when pnpm dev or tests request it; called by the CLI. @param {{siteRoot?:string,port?:string|number}} [options] @returns {Promise<{host:string,port:number,server:import("node:http").Server,close:()=>Promise<void>}>} @example await startDevServer({port:4173}) */
export async function startDevServer(options = {}) {
  const siteRoot = path.resolve(options.siteRoot ?? DEFAULT_SITE_ROOT);
  const port = parsePort(options.port ?? process.env.PORT);
  const clients = new Set();

  await mkdir(path.join(siteRoot, "articles"), { recursive: true });
  await buildArticleIndex({ siteRoot });
  const server = createServer(createRequestHandler({ siteRoot, clients }));
  await listen(server, port);
  const watcher = watchSite({ siteRoot, clients });
  const heartbeat = setInterval(
    () => broadcastEvent(clients, "ping", Date.now().toString()),
    25_000,
  );

  /** Releases watchers, browser streams, and the HTTP socket for CLI shutdown; called by signal handlers and consumers. @returns {Promise<void>} @example await close() */
  async function close() {
    watcher.close();
    clearInterval(heartbeat);

    // Open SSE responses must end before server.close can finish.
    for (const client of clients) {
      client.end();
    }

    clients.clear();
    await closeHttpServer(server);
  }

  return { host: HOST, port, server, close };
}

/** Registers graceful CLI shutdown only for direct execution; called after startDevServer. @param {{close:()=>Promise<void>}} devServer @returns {void} @example registerShutdownHandlers(devServer) */
function registerShutdownHandlers(devServer) {
  let closing = false;

  /** Closes the direct-run server once when an operating-system signal arrives; called by SIGINT and SIGTERM. @returns {Promise<void>} @example await shutdown() */
  async function shutdown() {
    if (closing) {
      return;
    }

    closing = true;
    await devServer.close();
  }

  process.once("SIGINT", () => {
    void shutdown().catch((error) => {
      console.error("Failed to stop the development server.", error);
      process.exitCode = 1;
    });
  });
  process.once("SIGTERM", () => {
    void shutdown().catch((error) => {
      console.error("Failed to stop the development server.", error);
      process.exitCode = 1;
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_PATH) {
  try {
    const devServer = await startDevServer();
    registerShutdownHandlers(devServer);
    console.log(`Tech Archive: http://${devServer.host}:${devServer.port}`);
  } catch (error) {
    console.error("Failed to start the development server.", error);
    process.exitCode = 1;
  }
}
