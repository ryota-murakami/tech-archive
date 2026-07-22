import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildArticleIndex } from "../scripts/build-article-index.mjs";
import {
  classifyWatchEvent,
  injectLiveReload,
} from "../scripts/dev-server.mjs";

/** Creates an isolated archive whenever a build behavior is tested; called by each node:test case. @param {import("node:test").TestContext} testContext @returns {Promise<{root:string,siteRoot:string}>} @example await createTestSite(testContext) */
async function createTestSite(testContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tech-archive-test-"));
  const siteRoot = path.join(root, "site");
  await mkdir(path.join(siteRoot, "articles"), { recursive: true });

  /** Removes one test archive after assertions finish; called by node:test cleanup. @returns {Promise<void>} @example await removeTestSite() */
  async function removeTestSite() {
    await rm(root, { recursive: true, force: true });
  }

  testContext.after(removeTestSite);
  return { root, siteRoot };
}

/** Writes one hand-authored article when a build test arranges content; called by each node:test case. @param {string} siteRoot @param {string} relativePath @param {string} html @returns {Promise<string>} @example await writeArticle(siteRoot, "nested/note.html", "<h1>Note</h1>") */
async function writeArticle(siteRoot, relativePath, html) {
  const filePath = path.join(siteRoot, "articles", relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, html, "utf8");
  return filePath;
}

/** Verifies rich metadata and nested paths when the build command scans HTML; called by node:test. @param {import("node:test").TestContext} testContext @returns {Promise<void>} @example await buildIncludesNestedMetadata(testContext) */
async function buildIncludesNestedMetadata(testContext) {
  // Arrange
  const { siteRoot } = await createTestSite(testContext);
  await writeArticle(
    siteRoot,
    "frameworks/2026-07-22-next react-日本語.html",
    `<!doctype html>
      <html>
        <head>
          <meta content="Next.js &amp; React" name="archive:title">
          <meta name="archive:category" content="React, Source Maps">
          <meta name="archive:category" content="Debugging">
          <meta name="archive:category" content="react">
          <meta name="archive:published" content="2026-07-20T09:00:00Z">
          <meta name="archive:type" content="Explain Diff">
          <meta name="archive:source" content="vercel/next.js">
          <meta name="archive:reading-minutes" content="9">
          <meta name="archive:quiz-count" content="5">
          <meta name="archive:code" content="#95945">
          <meta name="description" content="Browser &amp; debugger behavior.">
          <title>Ignored title</title>
        </head>
        <body><article><p>Ignored body fallback.</p></article></body>
      </html>`,
  );

  // Act
  const firstManifest = await buildArticleIndex({ siteRoot });
  const firstJson = await readFile(
    path.join(siteRoot, "data/articles.json"),
    "utf8",
  );
  await buildArticleIndex({ siteRoot });
  const secondJson = await readFile(
    path.join(siteRoot, "data/articles.json"),
    "utf8",
  );

  // Assert
  assert.deepEqual(firstManifest, {
    articles: [
      {
        id: "articles/frameworks/2026-07-22-next react-日本語",
        title: "Next.js & React",
        description: "Browser & debugger behavior.",
        published: "2026-07-20",
        categories: ["React", "Source Maps", "Debugging"],
        type: "Explain Diff",
        source: "vercel/next.js",
        readingMinutes: 9,
        quizCount: 5,
        code: "#95945",
        href: "articles/frameworks/2026-07-22-next%20react-%E6%97%A5%E6%9C%AC%E8%AA%9E.html",
      },
    ],
    stats: {
      articleCount: 1,
      monthCount: 1,
    },
  });
  assert.equal(secondJson, firstJson);
  assert.equal(firstJson.endsWith("\n"), true);
}

test(
  "build includes recursively nested articles with decoded repeated archive metadata",
  buildIncludesNestedMetadata,
);

/** Verifies readable defaults when archive-specific metadata is absent; called by node:test. @param {import("node:test").TestContext} testContext @returns {Promise<void>} @example await buildDerivesFallbackMetadata(testContext) */
async function buildDerivesFallbackMetadata(testContext) {
  // Arrange
  const { siteRoot } = await createTestSite(testContext);
  await writeArticle(
    siteRoot,
    "2026-06-02-title-fallback.html",
    `<html>
      <head><title>Title &amp; fallback</title></head>
      <body>
        <h1>Ignored heading</h1>
        <p class="lede feature">Editorial <strong>lede</strong>.</p>
        <article>
          <p>${"word ".repeat(201)}</p>
          <div class="quiz-card" data-quiz="1"></div>
          <div class="quiz-question"></div>
        </article>
      </body>
    </html>`,
  );
  await writeArticle(
    siteRoot,
    "2026-06-02-heading-fallback.html",
    `<html><body><h1>Heading fallback</h1><p>First paragraph.</p></body></html>`,
  );
  await writeArticle(
    siteRoot,
    "2026-06-02-filename-only.html",
    `<html><body><main>No semantic fallback.</main></body></html>`,
  );

  // Act
  const manifest = await buildArticleIndex({ siteRoot });
  const recordsById = new Map();

  for (const article of manifest.articles) {
    recordsById.set(article.id, article);
  }

  // Assert
  assert.deepEqual(recordsById.get("articles/2026-06-02-title-fallback"), {
    id: "articles/2026-06-02-title-fallback",
    title: "Title & fallback",
    description: "Editorial lede.",
    published: "2026-06-02",
    categories: ["Uncategorized"],
    type: "Article",
    source: "",
    readingMinutes: 2,
    quizCount: 2,
    code: "",
    href: "articles/2026-06-02-title-fallback.html",
  });
  assert.equal(
    recordsById.get("articles/2026-06-02-heading-fallback")?.title,
    "Heading fallback",
  );
  assert.equal(
    recordsById.get("articles/2026-06-02-heading-fallback")?.description,
    "First paragraph.",
  );
  assert.equal(
    recordsById.get("articles/2026-06-02-filename-only")?.title,
    "Filename only",
  );
  assert.equal(
    recordsById.get("articles/2026-06-02-filename-only")?.description,
    "",
  );
}

test(
  "build derives title, description, calendar, category, reading-time, and quiz fallbacks",
  buildDerivesFallbackMetadata,
);

/** Verifies chronology and month totals when dated and undated articles coexist; called by node:test. @param {import("node:test").TestContext} testContext @returns {Promise<void>} @example await buildOrdersChronologically(testContext) */
async function buildOrdersChronologically(testContext) {
  // Arrange
  const { siteRoot } = await createTestSite(testContext);
  await writeArticle(
    siteRoot,
    "2026-07-22-zulu.html",
    `<meta name="archive:title" content="Zulu"><p>Newest B.</p>`,
  );
  await writeArticle(
    siteRoot,
    "nested/2026-07-22-alpha.html",
    `<meta name="archive:title" content="Alpha"><p>Newest A.</p>`,
  );
  await writeArticle(
    siteRoot,
    "2026-06-01-older.html",
    `<meta name="archive:title" content="Older"><p>Older.</p>`,
  );
  await writeArticle(
    siteRoot,
    "undated.html",
    `<meta name="archive:title" content="Undated"><p>No date.</p>`,
  );

  // Act
  const manifest = await buildArticleIndex({ siteRoot });
  const orderedIds = [];

  for (const article of manifest.articles) {
    orderedIds.push(article.id);
  }

  // Assert
  assert.deepEqual(orderedIds, [
    "articles/nested/2026-07-22-alpha",
    "articles/2026-07-22-zulu",
    "articles/2026-06-01-older",
    "articles/undated",
  ]);
  assert.deepEqual(manifest.stats, {
    articleCount: 4,
    monthCount: 2,
  });
  assert.equal(manifest.articles[3].published, null);
}

test(
  "build orders newest articles first, uses title ties, leaves undated last, and reports calendar stats",
  buildOrdersChronologically,
);

/** Verifies code samples cannot impersonate archive markup when HTML is indexed; called by node:test. @param {import("node:test").TestContext} testContext @returns {Promise<void>} @example await buildIgnoresFakeMarkup(testContext) */
async function buildIgnoresFakeMarkup(testContext) {
  // Arrange
  const { siteRoot } = await createTestSite(testContext);
  await writeArticle(
    siteRoot,
    "2026-05-03-outer-structure.html",
    `<!doctype html>
      <!-- <meta name="archive:title" content="Fake comment title"> -->
      <!-- <div class="quiz-card" data-quiz="comment"></div> -->
      <html>
        <head>
          <script>
            globalThis.fakeMeta = '<meta name="archive:title" content="Fake script title">';
            globalThis.fakeQuiz = '<div data-quiz="script"></div>';
          </script>
          <style>.example::after { content: '<meta name="archive:category" content="Fake style">'; }</style>
          <template>
            <meta name="archive:title" content="Fake template title">
            <div class="quiz-card" data-quiz="template"></div>
          </template>
          <meta name="archive:title" content="Real x > y title">
          <meta name="description" content="Description x > y.">
        </head>
        <body>
          <svg><metadata data-quiz="svg">Fake SVG quiz</metadata></svg>
          <main><p>Real prose.</p><div data-quiz="1" title="x > y"></div></main>
        </body>
      </html>`,
  );

  // Act
  const manifest = await buildArticleIndex({ siteRoot });

  // Assert
  assert.deepEqual(manifest.articles[0], {
    id: "articles/2026-05-03-outer-structure",
    title: "Real x > y title",
    description: "Description x > y.",
    published: "2026-05-03",
    categories: ["Uncategorized"],
    type: "Article",
    source: "",
    readingMinutes: 1,
    quizCount: 1,
    code: "",
    href: "articles/2026-05-03-outer-structure.html",
  });
}

test(
  "build ignores fake meta and quiz tags in comments or raw-text blocks and preserves quoted greater-than signs",
  buildIgnoresFakeMarkup,
);

/** Verifies development injection uses the document boundary instead of JavaScript text; called by node:test. @returns {void} @example injectsReloadAtFinalBody() */
function injectsReloadAtFinalBody() {
  // Arrange
  const source = Buffer.from(
    `<html><body><script>globalThis.sample="</body>";</script></BODY></html>`,
    "utf8",
  );

  // Act
  const result = injectLiveReload(source).toString("utf8");

  // Assert
  assert.equal(
    result,
    `<html><body><script>globalThis.sample="</body>";</script><script data-tech-archive-dev-reload>
(() => {
  const events = new EventSource("/_dev/events");
  events.addEventListener("reload", () => window.location.reload());
})();
</script></BODY></html>`,
  );
}

test(
  "development reload client is injected before the final case-insensitive body boundary",
  injectsReloadAtFinalBody,
);

/** Verifies watcher scopes separate unknown article edits from unknown root events; called by node:test. @returns {void} @example watcherScopesPreventManifestBuildLoops() */
function watcherScopesPreventManifestBuildLoops() {
  // Arrange
  const unknownFilename = null;

  // Act
  const unknownArticleEvent = classifyWatchEvent("articles", unknownFilename);
  const unknownRootEvent = classifyWatchEvent("root", unknownFilename);
  const generatedManifestEvent = classifyWatchEvent(
    "root",
    "data/articles.json",
  );
  const nestedArticleEvent = classifyWatchEvent(
    "articles",
    Buffer.from("nested/new-note.html"),
  );

  // Assert
  assert.deepEqual(unknownArticleEvent, {
    rebuildIndex: true,
    reload: true,
  });
  assert.deepEqual(unknownRootEvent, {
    rebuildIndex: false,
    reload: true,
  });
  assert.deepEqual(generatedManifestEvent, {
    rebuildIndex: false,
    reload: false,
  });
  assert.deepEqual(nestedArticleEvent, {
    rebuildIndex: true,
    reload: true,
  });
}

test(
  "watcher scopes rebuild unknown article changes without rebuilding unknown or generated root events",
  watcherScopesPreventManifestBuildLoops,
);
