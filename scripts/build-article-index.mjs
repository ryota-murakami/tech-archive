import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_PATH = fileURLToPath(import.meta.url);
const DEFAULT_SITE_ROOT = path.resolve(path.dirname(MODULE_PATH), "../site");
const WORDS_PER_MINUTE = 200;
const RAW_TEXT_TAGS = new Set(["script", "style", "template", "svg"]);
const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["bull", "•"],
  ["copy", "©"],
  ["emsp", " "],
  ["ensp", " "],
  ["gt", ">"],
  ["hellip", "…"],
  ["laquo", "«"],
  ["ldquo", "“"],
  ["lsquo", "‘"],
  ["lt", "<"],
  ["mdash", "—"],
  ["middot", "·"],
  ["nbsp", " "],
  ["ndash", "–"],
  ["quot", '"'],
  ["raquo", "»"],
  ["rdquo", "”"],
  ["reg", "®"],
  ["rsquo", "’"],
  ["trade", "™"],
]);

/** Decodes one safe HTML reference whenever archive text is normalized; called by decodeHtmlEntities. @param {string} match @param {string} reference @returns {string} @example decodeEntityReference("&amp;", "amp") */
function decodeEntityReference(match, reference) {
  if (reference.startsWith("#")) {
    const hexadecimal = reference[1]?.toLowerCase() === "x";
    const digits = hexadecimal ? reference.slice(2) : reference.slice(1);
    const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);

    // Invalid Unicode values stay literal so malformed source HTML cannot crash a build.
    if (
      !Number.isInteger(codePoint) ||
      codePoint <= 0 ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return match;
    }

    return String.fromCodePoint(codePoint);
  }

  return NAMED_ENTITIES.get(reference.toLowerCase()) ?? match;
}

/** Decodes common named and numeric entities whenever metadata or body text is read; called by stripHtml and parseAttributes. @param {string} value @returns {string} @example decodeHtmlEntities("Next.js &amp; React") */
export function decodeHtmlEntities(value) {
  return String(value).replace(
    /&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/gi,
    decodeEntityReference,
  );
}

/** Converts an HTML fragment to searchable plain text during fallback extraction; called by extractArticleMetadata. @param {string} value @returns {string} @example stripHtml("<p>Hello <strong>world</strong></p>") */
export function stripHtml(value) {
  const withoutHiddenContent = String(value)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      " ",
    );

  return decodeHtmlEntities(withoutHiddenContent.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/** Parses one opening tag when metadata or quiz markers are inspected; called by collectMetaEntries and countQuizQuestions. @param {string} source @returns {Map<string, string>} @example parseAttributes('name="description" content="Hello"') */
function parseAttributes(source) {
  const attributes = new Map();
  const attributePattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  // Attribute order and quote style do not matter, which keeps hand-authored HTML easy to add.
  for (const match of String(source).matchAll(attributePattern)) {
    const [, rawName, doubleQuoted, singleQuoted, unquoted] = match;
    const value = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
    attributes.set(rawName.toLowerCase(), decodeHtmlEntities(value).trim());
  }

  return attributes;
}

/** Finds a quote-aware closing bracket whenever the outer HTML scanner enters a tag; called by scanOpeningTags. @param {string} source @param {number} start @returns {number} @example findTagEnd('<meta content="x > y">', 1) */
function findTagEnd(source, start) {
  let quote = "";

  // A greater-than sign closes a tag only when it is outside quoted attribute values.
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (character === quote) {
        quote = "";
      }

      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === ">") {
      return index;
    }
  }

  return -1;
}

/** Locates an HTML raw-text terminator so fake tags inside code are skipped; called by scanOpeningTags. @param {string} lowerSource @param {string} tagName @param {number} start @returns {number} @example findRawTextClosingTag('</script>', 'script', 0) */
function findRawTextClosingTag(lowerSource, tagName, start) {
  const needle = `</${tagName}`;
  let candidate = lowerSource.indexOf(needle, start);

  // Tag-name boundaries prevent strings such as </scripted> from ending a raw-text block.
  while (candidate !== -1) {
    const boundary = lowerSource[candidate + needle.length] ?? "";

    if (!boundary || /[\s/>]/.test(boundary)) {
      return candidate;
    }

    candidate = lowerSource.indexOf(needle, candidate + needle.length);
  }

  return -1;
}

/** Scans genuine outer opening tags while ignoring comments and raw-text blocks; called by metadata and quiz extraction. @param {string} html @returns {{name:string,attributes:Map<string,string>}[]} @example scanOpeningTags('<meta content="x > y">') */
export function scanOpeningTags(html) {
  const source = String(html);
  const lowerSource = source.toLowerCase();
  const tags = [];
  let cursor = 0;

  // The scanner advances monotonically, so fake markup can never be revisited after exclusion.
  while (cursor < source.length) {
    const openingBracket = source.indexOf("<", cursor);

    if (openingBracket === -1) {
      break;
    }

    if (source.startsWith("<!--", openingBracket)) {
      const commentEnd = source.indexOf("-->", openingBracket + 4);
      cursor = commentEnd === -1 ? source.length : commentEnd + 3;
      continue;
    }

    const tagEnd = findTagEnd(source, openingBracket + 1);

    if (tagEnd === -1) {
      break;
    }

    const inner = source.slice(openingBracket + 1, tagEnd).trim();

    // Closing tags, doctypes, and processing instructions cannot provide archive metadata.
    if (!inner || inner.startsWith("/") || inner.startsWith("!") || inner.startsWith("?")) {
      cursor = tagEnd + 1;
      continue;
    }

    const nameMatch = /^([a-z][\w:-]*)\b/i.exec(inner);

    if (!nameMatch) {
      cursor = tagEnd + 1;
      continue;
    }

    const name = nameMatch[1].toLowerCase();
    const rawAttributes = inner.slice(nameMatch[0].length);
    const selfClosing = /\/\s*$/.test(rawAttributes);

    if (!RAW_TEXT_TAGS.has(name)) {
      tags.push({ name, attributes: parseAttributes(rawAttributes) });
      cursor = tagEnd + 1;
      continue;
    }

    // script/style/template/svg contents are intentionally opaque to archive extraction.
    if (selfClosing) {
      cursor = tagEnd + 1;
      continue;
    }

    const closingStart = findRawTextClosingTag(lowerSource, name, tagEnd + 1);

    if (closingStart === -1) {
      break;
    }

    const closingEnd = findTagEnd(source, closingStart + 2 + name.length);
    cursor = closingEnd === -1 ? source.length : closingEnd + 1;
  }

  return tags;
}

/** Collects meta tags once per article during a build; called by extractArticleMetadata. @param {{name:string,attributes:Map<string,string>}[]} tags @returns {Map<string, string>[]} @example collectMetaEntries(scanOpeningTags('<meta name="archive:type" content="Explainer">')) */
function collectMetaEntries(tags) {
  const entries = [];

  // Only quote-aware scanner output can become metadata, excluding embedded code examples.
  for (const tag of tags) {
    if (tag.name === "meta") {
      entries.push(tag.attributes);
    }
  }

  return entries;
}

/** Finds every value for one meta name so repeated categories remain supported; called by extractArticleMetadata. @param {Map<string, string>[]} entries @param {string} name @returns {string[]} @example getMetaValues(entries, "archive:category") */
function getMetaValues(entries, name) {
  const expectedName = name.toLowerCase();

  return entries
    .filter(
      (entry) =>
        (entry.get("name") ?? entry.get("property") ?? "").toLowerCase() ===
        expectedName,
    )
    .map((entry) => entry.get("content") ?? "")
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Extracts the first named element when semantic title/body fallbacks run; called by extractArticleMetadata and extractReadableRegion. @param {string} html @param {string} tagName @returns {string} @example extractFirstElementText("<h1>Hello</h1>", "h1") */
function extractFirstElementText(html, tagName) {
  const pattern = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}\\s*>`,
    "i",
  );
  return pattern.exec(html)?.[1] ?? "";
}

/** Extracts the first element carrying a class when editorial lede fallback runs; called by extractArticleMetadata. @param {string} html @param {string} className @returns {string} @example extractFirstClassText('<p class="lede">Intro</p>', "lede") */
function extractFirstClassText(html, className) {
  const openingTagPattern = /<([a-z][\w:-]*)\b([^>]*)>/gi;

  // Opening tags are checked individually so class order and additional classes stay irrelevant.
  for (const match of String(html).matchAll(openingTagPattern)) {
    const [, tagName, rawAttributes] = match;
    const classes = (parseAttributes(rawAttributes).get("class") ?? "").split(
      /\s+/,
    );

    if (!classes.includes(className)) {
      continue;
    }

    const contentStart = (match.index ?? 0) + match[0].length;
    const closingTagPattern = new RegExp(`<\\/${tagName}\\s*>`, "gi");
    closingTagPattern.lastIndex = contentStart;
    const closingTag = closingTagPattern.exec(html);
    return closingTag ? html.slice(contentStart, closingTag.index) : "";
  }

  return "";
}

/** Produces a readable title when an article omits title markup; called by extractArticleMetadata. @param {string} filePath @returns {string} @example titleFromFilename("2026-07-22-source-maps.html") */
function titleFromFilename(filePath) {
  const stem = path
    .basename(filePath, path.extname(filePath))
    .replace(/^\d{4}-\d{2}-\d{2}[-_ ]*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const readable = decodeHtmlEntities(stem || "Untitled article");
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

/** Normalizes ISO-like dates for calendar filtering whenever metadata or filenames provide one; called by extractArticleMetadata. @param {string} value @returns {string|null} @example normalizePublished("2026-07-22T09:00:00Z") */
function normalizePublished(value) {
  const candidate = String(value).match(/^(\d{4}-\d{2}-\d{2})/)?.[1];

  if (!candidate) {
    return null;
  }

  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== candidate
    ? null
    : candidate;
}

/** Accepts only explicit non-negative integers before numeric metadata is trusted; called by extractArticleMetadata. @param {string} value @param {number} minimum @returns {number|null} @example normalizeInteger("5", 0) */
function normalizeInteger(value, minimum) {
  const normalized = String(value).trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
}

/** Removes repeated non-empty labels while preserving editorial order; called by extractArticleMetadata. @param {string[]} values @returns {string[]} @example uniqueStrings(["React", "React"]) */
function uniqueStrings(values) {
  const seen = new Set();
  const unique = [];

  // Case-insensitive keys prevent visually duplicated category filters.
  for (const value of values) {
    const normalized = stripHtml(value).trim();
    const key = normalized.toLocaleLowerCase("en-US");

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}

/** Counts human-language words when reading time has no override; called by extractArticleMetadata. @param {string} value @returns {number} @example countWords("A short technical note") */
function countWords(value) {
  const segmenter = new Intl.Segmenter("en", { granularity: "word" });
  let count = 0;

  // Intl.Segmenter handles Latin and CJK prose without shipping a tokenizer dependency.
  for (const segment of segmenter.segment(String(value))) {
    if (segment.isWordLike) {
      count += 1;
    }
  }

  return count;
}

/** Counts quiz cards when explicit metadata is absent; called by extractArticleMetadata. @param {{name:string,attributes:Map<string,string>}[]} tags @returns {number} @example countQuizQuestions(scanOpeningTags('<div class="quiz-card" data-quiz="1"></div>')) */
function countQuizQuestions(tags) {
  let count = 0;

  // Each opening tag counts once even when it carries both a class and a data marker.
  for (const tag of tags) {
    const attributes = tag.attributes;
    const classes = (attributes.get("class") ?? "").split(/\s+/);
    const hasDataMarker =
      attributes.has("data-quiz") || attributes.has("data-quiz-question");
    const hasClassMarker =
      classes.includes("quiz-card") || classes.includes("quiz-question");

    if (hasDataMarker || hasClassMarker) {
      count += 1;
    }
  }

  return count;
}

/** Selects article/body prose before automatic reading-time calculation; called by extractArticleMetadata. @param {string} html @returns {string} @example extractReadableRegion("<body><article>Text</article></body>") */
function extractReadableRegion(html) {
  return (
    extractFirstElementText(html, "article") ||
    extractFirstElementText(html, "body") ||
    html
  );
}

/** Builds one manifest record whenever the index scans an HTML file; called by createArticleManifest and tests. @param {string} html @param {string} filePath @param {string} siteRoot @returns {object} @example extractArticleMetadata("<title>Note</title>", "/site/articles/note.html", "/site") */
export function extractArticleMetadata(html, filePath, siteRoot) {
  const openingTags = scanOpeningTags(html);
  const metaEntries = collectMetaEntries(openingTags);
  const firstMeta = (name) => getMetaValues(metaEntries, name)[0] ?? "";
  const filenameDate = path.basename(filePath).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
  const title =
    stripHtml(firstMeta("archive:title")) ||
    stripHtml(extractFirstElementText(html, "title")) ||
    stripHtml(extractFirstElementText(html, "h1")) ||
    titleFromFilename(filePath);
  const description =
    stripHtml(firstMeta("description")) ||
    stripHtml(extractFirstClassText(html, "lede")) ||
    stripHtml(extractFirstElementText(html, "p"));
  const categories = uniqueStrings(
    getMetaValues(metaEntries, "archive:category").flatMap((value) =>
      value.split(","),
    ),
  );
  const readableText = stripHtml(extractReadableRegion(html));
  const explicitReadingMinutes = normalizeInteger(
    firstMeta("archive:reading-minutes"),
    1,
  );
  const explicitQuizCount = normalizeInteger(firstMeta("archive:quiz-count"), 0);
  const relativeHref = path.relative(path.resolve(siteRoot), path.resolve(filePath)).split(path.sep).join("/");

  // Each path segment is encoded so spaces and non-Latin filenames remain valid GitHub Pages links.
  const href = relativeHref.split("/").map(encodeURIComponent).join("/");

  return {
    id: relativeHref.replace(/\.html$/i, ""),
    title,
    description,
    published:
      normalizePublished(firstMeta("archive:published")) ??
      normalizePublished(filenameDate),
    categories: categories.length > 0 ? categories : ["Uncategorized"],
    type: stripHtml(firstMeta("archive:type")) || "Article",
    source: stripHtml(firstMeta("archive:source")),
    readingMinutes:
      explicitReadingMinutes ??
      Math.max(1, Math.ceil(countWords(readableText) / WORDS_PER_MINUTE)),
    quizCount: explicitQuizCount ?? countQuizQuestions(openingTags),
    code: stripHtml(firstMeta("archive:code")),
    href,
  };
}

/** Recursively finds HTML articles in stable path order during each build; called by createArticleManifest. @param {string} directory @returns {Promise<string[]>} @example collectHtmlFiles("/site/articles") */
export async function collectHtmlFiles(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    // A fresh archive is valid before its first article is added.
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const files = [];

  // Directory entries are sorted before recursion so filesystem order never leaks into output.
  for (const entry of entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectHtmlFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".html") {
      files.push(entryPath);
    }
  }

  return files;
}

/** Applies archive chronology and deterministic tie-breaks before JSON is written; called by createArticleManifest. @param {object} left @param {object} right @returns {number} @example compareArticles({published:"2026-07-22"}, {published:null}) */
function compareArticles(left, right) {
  if (left.published && right.published && left.published !== right.published) {
    return left.published > right.published ? -1 : 1;
  }

  // Undated notes are deliberately placed after every dated archive entry.
  if (left.published !== right.published) {
    return left.published ? -1 : 1;
  }

  const leftTitle = left.title.toLocaleLowerCase("en-US");
  const rightTitle = right.title.toLocaleLowerCase("en-US");

  if (leftTitle !== rightTitle) {
    return leftTitle < rightTitle ? -1 : 1;
  }

  return left.href < right.href ? -1 : left.href > right.href ? 1 : 0;
}

/** Creates the in-memory index so tests and production builds share one path; called by buildArticleIndex. @param {{siteRoot:string, articlesDirectory:string}} options @returns {Promise<object>} @example createArticleManifest({siteRoot:"/site", articlesDirectory:"/site/articles"}) */
export async function createArticleManifest({ siteRoot, articlesDirectory }) {
  const files = await collectHtmlFiles(articlesDirectory);
  const articles = await Promise.all(
    files.map(async (filePath) =>
      extractArticleMetadata(
        await readFile(filePath, "utf8"),
        filePath,
        siteRoot,
      ),
    ),
  );
  articles.sort(compareArticles);
  const months = new Set(
    articles
      .map((article) => article.published?.slice(0, 7) ?? "")
      .filter(Boolean),
  );

  return {
    articles,
    stats: {
      articleCount: articles.length,
      monthCount: months.size,
    },
  };
}

/** Writes the deterministic article manifest when CI, dev startup, or tests request a build; called by the CLI and dev server. @param {{siteRoot?:string, articlesDirectory?:string, outputPath?:string}} [options] @returns {Promise<object>} @example await buildArticleIndex({siteRoot:"./site"}) */
export async function buildArticleIndex(options = {}) {
  const siteRoot = path.resolve(options.siteRoot ?? DEFAULT_SITE_ROOT);
  const articlesDirectory = path.resolve(
    options.articlesDirectory ?? path.join(siteRoot, "articles"),
  );
  const outputPath = path.resolve(
    options.outputPath ?? path.join(siteRoot, "data/articles.json"),
  );
  const manifest = await createArticleManifest({ siteRoot, articlesDirectory });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_PATH) {
  try {
    const manifest = await buildArticleIndex();
    console.log(
      `Indexed ${manifest.stats.articleCount} article${manifest.stats.articleCount === 1 ? "" : "s"}.`,
    );
  } catch (error) {
    console.error("Failed to build the article index.", error);
    process.exitCode = 1;
  }
}
