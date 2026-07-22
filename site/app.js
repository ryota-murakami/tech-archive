const ALL_CATEGORIES = "All";
const PAGE_SIZE = 5;
const MANIFEST_URL = "./data/articles.json";
const PRETEXT_URL = "https://esm.sh/@chenglou/pretext@0.0.8";

const state = {
  articles: [],
  categories: [ALL_CATEGORIES],
  query: "",
  category: ALL_CATEGORIES,
  selectedDate: "",
  calendarDate: new Date(),
  defaultCalendarDate: new Date(),
  page: 1,
  pageSize: PAGE_SIZE,
  status: "loading",
};

const elements = {
  archiveStatus: document.querySelector("#archive-status"),
  articleList: document.querySelector("#article-list"),
  calendarGrid: document.querySelector("#calendar-grid"),
  catalog: document.querySelector("#catalog"),
  categoryList: document.querySelector("#category-list"),
  categoryTotal: document.querySelector("#category-total"),
  clearButton: document.querySelector("#clear-button"),
  monthLabel: document.querySelector("#month-label"),
  nextMonthButton: document.querySelector("#next-month"),
  pagination: document.querySelector("#pagination"),
  previousMonthButton: document.querySelector("#previous-month"),
  resultSummary: document.querySelector("#result-summary"),
  searchInput: document.querySelector("#search-input"),
};

const preparedText = new Map();
let pretextApi = null;
let pretextFrame = 0;
let pretextResizeObserver = null;

/** Escapes manifest text before any renderer inserts it into HTML; called by every string renderer. @param {unknown} value Untrusted manifest value. @returns {string} HTML-safe text. @example escapeHtml("<script>") */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Trims string-like manifest values when records are normalized; called by normalizeArticle and URL hydration. @param {unknown} value Candidate text. @returns {string} Trimmed text or an empty string. @example normalizeText(" React ") */
function normalizeText(value) {
  // Non-string metadata is discarded instead of becoming confusing interface copy.
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

/** Validates a real calendar day before a manifest or URL value can filter results; called by normalization and hydration. @param {unknown} value Candidate YYYY-MM-DD value. @returns {boolean} Whether the value is a real ISO date. @example isIsoDate("2026-07-22") */
function isIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));

  // A fixed shape prevents ambiguous browser date parsing.
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Parses a YYYY-MM month into a local first-of-month date for calendar navigation; called by URL hydration. @param {unknown} value Candidate month key. @returns {Date|null} Valid month or null. @example parseMonthKey("2026-07") */
function parseMonthKey(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value));

  // Invalid month query parameters fall back to the newest archive month.
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  // JavaScript would otherwise roll month 13 into the next year.
  if (month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1);
}

/** Converts a calendar date to the compact query-string month key; called by URL synchronization. @param {Date} date First day of the displayed month. @returns {string} YYYY-MM month. @example getMonthKey(new Date(2026, 6, 1)) */
function getMonthKey(date) {
  return (
    String(date.getFullYear()).padStart(4, "0") +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0")
  );
}

/** Allows only generated relative article HTML paths before links reach the DOM; called by normalizeArticle. @param {unknown} value Candidate manifest href. @returns {string} Safe relative href or an empty string. @example getSafeArticleHref("articles/note.html") */
function getSafeArticleHref(value) {
  const rawHref = normalizeText(value);

  // Empty or absolute URLs never become clickable archive entries.
  if (!rawHref || rawHref.startsWith("/") || rawHref.startsWith("//")) {
    return "";
  }

  const normalizedHref = rawHref.startsWith("./") ? rawHref.slice(2) : rawHref;
  const pathOnly = normalizedHref.split("#", 1)[0];
  const pathSegments = pathOnly.split("/");

  // Backslashes and parent segments could escape the repository's articles directory.
  if (
    normalizedHref.includes("\\") ||
    pathSegments.includes("..") ||
    !normalizedHref.startsWith("articles/")
  ) {
    return "";
  }

  // The generator emits encoded repository paths ending in .html, with an optional local fragment.
  if (
    !/^articles\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+\.html(?:#[A-Za-z0-9._~!$&'()*+,;=:@%/?-]+)?$/.test(
      normalizedHref,
    )
  ) {
    return "";
  }

  return "./" + normalizedHref;
}

/** Deduplicates category labels while preserving manifest order for one record; called by normalizeArticle. @param {unknown} value Candidate category array. @returns {string[]} Clean category labels. @example normalizeCategories(["React", "React"]) */
function normalizeCategories(value) {
  const categories = [];
  const seen = new Set();

  // Non-array metadata becomes Uncategorized so every entry remains filterable.
  if (!Array.isArray(value)) {
    return ["Uncategorized"];
  }

  // Labels are compared case-insensitively to avoid duplicate sidebar controls.
  for (const candidate of value) {
    const category = normalizeText(candidate);
    const key = category.toLocaleLowerCase("en-US");

    // Blank, repeated, and reserved All labels add no useful filter.
    if (
      !category ||
      key === ALL_CATEGORIES.toLocaleLowerCase("en-US") ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    categories.push(category);
  }

  return categories.length > 0 ? categories : ["Uncategorized"];
}

/** Converts one generated manifest record into safe predictable UI data; called by normalizeManifest. @param {unknown} value Candidate record. @param {number} index Stable archive position. @returns {object} Normalized article. @example normalizeArticle({ title: "Note" }, 0) */
function normalizeArticle(value, index) {
  const record =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const published = isIsoDate(record.published) ? String(record.published) : null;
  const readingMinutes = Number(record.readingMinutes);
  const quizCount = Number(record.quizCount);

  return {
    id: normalizeText(record.id) || "article-" + String(index + 1),
    title: normalizeText(record.title) || "Untitled document",
    description:
      normalizeText(record.description) ||
      "Open the standalone HTML document to read the complete technical note.",
    published,
    categories: normalizeCategories(record.categories),
    type: normalizeText(record.type) || "Article",
    source: normalizeText(record.source),
    readingMinutes:
      Number.isFinite(readingMinutes) && readingMinutes >= 0
        ? Math.round(readingMinutes)
        : 0,
    quizCount:
      Number.isFinite(quizCount) && quizCount >= 0 ? Math.round(quizCount) : 0,
    code: normalizeText(record.code),
    href: getSafeArticleHref(record.href),
    sequence: index + 1,
  };
}

/** Rejects malformed manifests and normalizes each record after a successful fetch; called by loadManifest. @param {unknown} value Parsed JSON payload. @returns {object[]} Safe article records. @example normalizeManifest({ articles: [] }) */
function normalizeManifest(value) {
  // A missing articles array means the deploy artifact is incomplete, so the UI shows a retryable error.
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray(value.articles)
  ) {
    throw new TypeError("Article manifest must contain an articles array.");
  }

  const articles = [];

  // Stable manifest order becomes the visible ledger folio order.
  for (let index = 0; index < value.articles.length; index += 1) {
    articles.push(normalizeArticle(value.articles[index], index));
  }

  return articles;
}

/** Compares human labels consistently before the global subject list is rendered; called by Array.sort in getCategories. @param {string} left First label. @param {string} right Second label. @returns {number} Locale comparison result. @example compareLabels("React", "TypeScript") */
function compareLabels(left, right) {
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

/** Collects every distinct subject after a manifest load so filters match real content; called by loadManifest. @param {object[]} articles Normalized records. @returns {string[]} All plus sorted subjects. @example getCategories([{ categories: ["React"] }]) */
function getCategories(articles) {
  const labelsByKey = new Map();

  // Every article may contribute more than one visible subject.
  for (const article of articles) {
    for (const category of article.categories) {
      const key = category.toLocaleLowerCase("en-US");

      // The first editorial capitalization wins when labels differ only by case.
      if (
        key !== ALL_CATEGORIES.toLocaleLowerCase("en-US") &&
        !labelsByKey.has(key)
      ) {
        labelsByKey.set(key, category);
      }
    }
  }

  const categories = Array.from(labelsByKey.values());
  categories.sort(compareLabels);
  categories.unshift(ALL_CATEGORIES);
  return categories;
}

/** Finds the newest published month so a fresh archive opens on useful calendar dots; called after each manifest load and reset. @param {object[]} articles Normalized records. @returns {Date} Latest month or the current month. @example getDefaultCalendarDate([]) */
function getDefaultCalendarDate(articles) {
  let latestPublished = "";

  // ISO dates sort chronologically, so a string comparison avoids timezone drift.
  for (const article of articles) {
    if (article.published && article.published > latestPublished) {
      latestPublished = article.published;
    }
  }

  // An empty archive still presents a usable current-month calendar.
  if (!latestPublished) {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }

  return new Date(
    Number(latestPublished.slice(0, 4)),
    Number(latestPublished.slice(5, 7)) - 1,
    1,
  );
}

/** Restores filters and calendar state from the current URL after load or browser navigation; called by loadManifest and popstate. @returns {void} @example hydrateStateFromUrl() */
function hydrateStateFromUrl() {
  const parameters = new URLSearchParams(window.location.search);
  const requestedCategory = normalizeText(parameters.get("category"));
  const requestedDate = normalizeText(parameters.get("date"));
  const requestedPage = Number.parseInt(parameters.get("page") || "1", 10);
  const requestedMonth = parseMonthKey(parameters.get("month"));

  state.query = normalizeText(parameters.get("q"));
  state.category = state.categories.includes(requestedCategory)
    ? requestedCategory
    : ALL_CATEGORIES;
  state.selectedDate = isIsoDate(requestedDate) ? requestedDate : "";
  state.page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  // A selected day implies its month unless the URL explicitly preserves another view.
  if (requestedMonth) {
    state.calendarDate = requestedMonth;
  } else if (state.selectedDate) {
    state.calendarDate = new Date(
      Number(state.selectedDate.slice(0, 4)),
      Number(state.selectedDate.slice(5, 7)) - 1,
      1,
    );
  } else {
    state.calendarDate = new Date(state.defaultCalendarDate);
  }

  elements.searchInput.value = state.query;
}

/** Mirrors every active control into a subpath-safe query string after user changes; called by renderAll and month navigation. @returns {void} @example syncUrl() */
function syncUrl() {
  const parameters = new URLSearchParams();

  // Defaults stay out of the URL so a clear archive remains easy to share.
  if (state.query) {
    parameters.set("q", state.query);
  }

  if (state.category !== ALL_CATEGORIES) {
    parameters.set("category", state.category);
  }

  if (state.selectedDate) {
    parameters.set("date", state.selectedDate);
  }

  if (state.page > 1) {
    parameters.set("page", String(state.page));
  }

  // Month navigation is independently shareable even without choosing a day.
  if (getMonthKey(state.calendarDate) !== getMonthKey(state.defaultCalendarDate)) {
    parameters.set("month", getMonthKey(state.calendarDate));
  }

  const url = new URL(window.location.href);
  url.search = parameters.toString();
  window.history.replaceState(null, "", url);
}

/** Formats one ISO publication date for visible metadata and accessible calendar labels; called by article and calendar renderers. @param {string} date YYYY-MM-DD date. @returns {string} English date. @example formatDate("2026-07-22") */
function formatDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date + "T12:00:00"));
}

/** Formats the displayed calendar month whenever navigation changes; called by renderCalendar. @param {Date} date First day of a month. @returns {string} English month and year. @example formatMonth(new Date(2026, 6, 1)) */
function formatMonth(date) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Matches one subject case-insensitively so editorial capitalization cannot split counts or results; called by filtering and counting. @param {object} article Normalized article. @param {string} category Selected subject. @returns {boolean} Whether the article carries that subject. @example articleHasCategory(article, "React") */
function articleHasCategory(article, category) {
  const expected = category.toLocaleLowerCase("en-US");

  // Every record may expose multiple category labels.
  for (const articleCategory of article.categories) {
    if (articleCategory.toLocaleLowerCase("en-US") === expected) {
      return true;
    }
  }

  return false;
}

/** Applies title-only search, subject, and exact-day filters for each archive render; called by renderAll. @returns {object[]} Matching records in manifest order. @example getFilteredArticles() */
function getFilteredArticles() {
  const query = state.query.toLocaleLowerCase("en-US");
  const filtered = [];

  // Each condition maps directly to one visible control, keeping combined filters predictable.
  for (const article of state.articles) {
    const matchesQuery =
      !query || article.title.toLocaleLowerCase("en-US").includes(query);
    const matchesCategory =
      state.category === ALL_CATEGORIES ||
      articleHasCategory(article, state.category);
    const matchesDate =
      !state.selectedDate || article.published === state.selectedDate;

    if (matchesQuery && matchesCategory && matchesDate) {
      filtered.push(article);
    }
  }

  return filtered;
}

/** Counts articles per subject for the category rail after manifest changes; called by renderCategories. @returns {Map<string, number>} Subject counts including All. @example getCategoryCounts() */
function getCategoryCounts() {
  const counts = new Map();
  counts.set(ALL_CATEGORIES, state.articles.length);

  // Canonical sidebar labels count case-insensitive matches across all records.
  for (const category of state.categories) {
    if (category === ALL_CATEGORIES) {
      continue;
    }

    let count = 0;

    for (const article of state.articles) {
      if (articleHasCategory(article, category)) {
        count += 1;
      }
    }

    counts.set(category, count);
  }

  return counts;
}

/** Updates global article and month totals after the real manifest is available; called by renderAll. @returns {void} @example renderArchiveStatus() */
function renderArchiveStatus() {
  const months = new Set();

  // Undated documents remain indexed but do not inflate the month count.
  for (const article of state.articles) {
    if (article.published) {
      months.add(article.published.slice(0, 7));
    }
  }

  elements.archiveStatus.innerHTML =
    "<span><strong>" +
    String(state.articles.length).padStart(3, "0") +
    "</strong> articles</span>" +
    "<span><strong>" +
    String(months.size).padStart(3, "0") +
    "</strong> months indexed</span>" +
    "<span>GitHub Pages · HTML</span>";
  elements.categoryTotal.textContent = String(
    Math.max(0, state.categories.length - 1),
  ).padStart(2, "0");
}

/** Repaints safe subject buttons so selection and counts stay accessible; called by renderAll. @returns {void} @example renderCategories() */
function renderCategories() {
  const counts = getCategoryCounts();
  let markup = "";

  // Dynamic labels are escaped in both text and data attributes before insertion.
  for (const category of state.categories) {
    markup +=
      '<button class="category-button" type="button" data-category="' +
      escapeHtml(category) +
      '" aria-controls="article-list" aria-pressed="' +
      String(state.category === category) +
      '"><span>' +
      escapeHtml(category) +
      '</span><span class="category-count">' +
      String(counts.get(category) || 0).padStart(2, "0") +
      "</span></button>";
  }

  elements.categoryList.innerHTML = markup;
}

/** Describes the current result count and active constraints after every filter change; called by renderAll. @param {number} resultCount Number of matching articles. @returns {void} @example renderResultSummary(3) */
function renderResultSummary(resultCount) {
  const filters = [];

  // Only active constraints appear in the compact ledger summary.
  if (state.query) {
    filters.push("Title: “" + state.query + "”");
  }

  if (state.category !== ALL_CATEGORIES) {
    filters.push(state.category);
  }

  if (state.selectedDate) {
    filters.push(formatDate(state.selectedDate));
  }

  const filterLabel =
    filters.length > 0 ? filters.join(" · ") : "All subjects · All dates";

  elements.resultSummary.innerHTML =
    "<span><strong>" +
    String(resultCount).padStart(2, "0") +
    " </strong>entries found</span><span>" +
    escapeHtml(filterLabel) +
    "</span>";
}

/** Produces escaped article metadata for one visible ledger row; called by renderArticle. @param {object} article Normalized article. @returns {string} Safe metadata markup. @example renderArticleMeta(article) */
function renderArticleMeta(article) {
  let markup = "";

  // Undated documents are explicit rather than silently receiving today's date.
  if (article.published) {
    markup +=
      '<time datetime="' +
      escapeHtml(article.published) +
      '">' +
      escapeHtml(formatDate(article.published)) +
      "</time>";
  } else {
    markup += "<span>Undated</span>";
  }

  if (article.readingMinutes > 0) {
    markup += "<span>" + String(article.readingMinutes) + " min read</span>";
  }

  // Every category remains visible even when a row was reached through another subject.
  for (const category of article.categories) {
    markup += '<span class="tag">' + escapeHtml(category) + "</span>";
  }

  if (article.quizCount > 0) {
    markup += "<span>Quiz " + String(article.quizCount) + "</span>";
  }

  return markup;
}

/** Builds one fully escaped ledger row from a normalized manifest record; called by renderArticles. @param {object} article Normalized article. @param {boolean} isFeatured Whether this is the page's lead row. @returns {string} Safe article markup. @example renderArticle(article, true) */
function renderArticle(article, isFeatured) {
  const kickerParts = [article.type];

  // Source is optional because many personal notes have no external repository.
  if (article.source) {
    kickerParts.push(article.source);
  }

  const safeTitle = escapeHtml(article.title);
  const titleMarkup = article.href
    ? '<a class="article-title" data-pretext href="' +
      escapeHtml(article.href) +
      '">' +
      safeTitle +
      "</a>"
    : '<span class="article-title article-title-unlinked" data-pretext>' +
      safeTitle +
      "</span>";
  const codeMarkup = article.code
    ? '<code class="code-slip">' + escapeHtml(article.code) + "</code>"
    : "";

  return (
    '<article class="article-row' +
    (isFeatured ? " featured" : "") +
    '">' +
    '<div class="folio" aria-hidden="true">' +
    String(article.sequence).padStart(2, "0") +
    "</div>" +
    '<div class="article-body">' +
    '<p class="article-kicker">' +
    escapeHtml(kickerParts.join(" · ")) +
    "</p>" +
    '<h3 class="article-heading">' +
    titleMarkup +
    "</h3>" +
    '<p class="article-excerpt" data-pretext>' +
    escapeHtml(article.description) +
    "</p>" +
    '<div class="article-meta">' +
    renderArticleMeta(article) +
    "</div>" +
    codeMarkup +
    "</div>" +
    "</article>"
  );
}

/** Draws the current page or an explanatory empty state after filtering; called by renderAll. @param {object[]} filtered Matching articles. @returns {void} @example renderArticles(filtered) */
function renderArticles(filtered) {
  const start = (state.page - 1) * state.pageSize;
  const visible = filtered.slice(start, start + state.pageSize);

  // Quiet dates and unmatched titles explain how to recover the full ledger.
  if (visible.length === 0) {
    elements.articleList.innerHTML =
      '<div class="empty-state"><strong>No ledger entry.</strong><p>Try another day, subject, or title. Clear all restores the complete archive.</p></div>';
    return;
  }

  let markup = "";

  // The first visible row receives the larger editorial lead treatment.
  for (let index = 0; index < visible.length; index += 1) {
    markup += renderArticle(visible[index], index === 0);
  }

  elements.articleList.innerHTML = markup;

  // Newly inserted titles are registered only after the browser can measure their real widths.
  if (pretextApi) {
    registerPretextElements(elements.articleList);
  }
}

/** Creates numbered navigation after filtering and disables impossible directions; called by renderAll. @param {number} pageCount Total number of result pages. @returns {void} @example renderPagination(4) */
function renderPagination(pageCount) {
  // Empty result sets need no page controls.
  if (pageCount < 1) {
    elements.pagination.innerHTML = "";
    return;
  }

  let markup =
    '<button class="page-button" type="button" data-page="' +
    String(state.page - 1) +
    '" aria-label="Previous page"' +
    (state.page === 1 ? " disabled" : "") +
    ">←</button>";

  // Every page remains directly reachable; flex wrapping keeps long archives usable.
  for (let page = 1; page <= pageCount; page += 1) {
    markup +=
      '<button class="page-button" type="button" data-page="' +
      String(page) +
      '"' +
      (page === state.page ? ' aria-current="page"' : "") +
      ' aria-label="Page ' +
      String(page) +
      '">' +
      String(page) +
      "</button>";
  }

  markup +=
    '<button class="page-button" type="button" data-page="' +
    String(state.page + 1) +
    '" aria-label="Next page"' +
    (state.page === pageCount ? " disabled" : "") +
    ">→</button>";
  elements.pagination.innerHTML = markup;
}

/** Rebuilds the selected month and publication dots after navigation or filtering; called by renderAll and month handlers. @returns {void} @example renderCalendar() */
function renderCalendar() {
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const publishedDates = new Set();
  let markup = "";

  // Only dated records create rust publication dots.
  for (const article of state.articles) {
    if (article.published) {
      publishedDates.add(article.published);
    }
  }

  elements.monthLabel.textContent = formatMonth(state.calendarDate);

  // Leading blanks align day one beneath its real weekday.
  for (let blank = 0; blank < firstDay; blank += 1) {
    markup += '<span class="calendar-blank" aria-hidden="true"></span>';
  }

  // Every day stays selectable, including dates with no published record.
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date =
      String(year).padStart(4, "0") +
      "-" +
      String(month + 1).padStart(2, "0") +
      "-" +
      String(day).padStart(2, "0");
    const hasEntry = publishedDates.has(date);
    markup +=
      '<button type="button" data-date="' +
      date +
      '" class="' +
      (hasEntry ? "has-entry" : "") +
      '" aria-controls="article-list" aria-label="Filter by ' +
      escapeHtml(formatDate(date)) +
      (hasEntry ? ", article published" : ", no article") +
      '" aria-pressed="' +
      String(state.selectedDate === date) +
      '">' +
      String(day) +
      "</button>";
  }

  elements.calendarGrid.innerHTML = markup;
}

/** Reports whether Clear all has any filter or calendar view to restore; called after archive and month renders. @returns {boolean} Whether reset changes visible state. @example hasActiveArchiveState() */
function hasActiveArchiveState() {
  return (
    Boolean(state.query) ||
    state.category !== ALL_CATEGORIES ||
    Boolean(state.selectedDate) ||
    getMonthKey(state.calendarDate) !== getMonthKey(state.defaultCalendarDate)
  );
}

/** Restores a replaced control after innerHTML rendering without moving the viewport; called by renderAll for category, calendar, and pagination actions. @param {object|null} request Control kind and selected data value. @returns {void} @example restoreFocusAfterRender({ kind: "page", value: 2 }) */
function restoreFocusAfterRender(request) {
  // Initial loads and input-only renders leave existing focus untouched.
  if (!request) {
    return;
  }

  let container = null;
  let dataKey = "";

  // Each replaced control family exposes a stable data attribute after rendering.
  if (request.kind === "category") {
    container = elements.categoryList;
    dataKey = "category";
  } else if (request.kind === "date") {
    container = elements.calendarGrid;
    dataKey = "date";
  } else if (request.kind === "page") {
    container = elements.pagination;
    dataKey = "page";
  }

  // Data values are compared through dataset instead of interpolated into a CSS selector.
  if (container && dataKey) {
    const controls = container.querySelectorAll("[data-" + dataKey + "]");

    for (const control of controls) {
      if (
        control instanceof HTMLButtonElement &&
        control.dataset[dataKey] === String(request.value)
      ) {
        control.focus({ preventScroll: true });
        return;
      }
    }
  }

  const catalogHeading = document.querySelector("#catalog-title");

  // A temporary programmatic target provides a predictable fallback when the requested page disappeared.
  if (catalogHeading instanceof HTMLElement) {
    const previousTabIndex = catalogHeading.getAttribute("tabindex");
    catalogHeading.setAttribute("tabindex", "-1");
    catalogHeading.focus({ preventScroll: true });

    // Restoring the original attribute keeps the heading out of normal Tab order.
    if (previousTabIndex === null) {
      catalogHeading.removeAttribute("tabindex");
    } else {
      catalogHeading.setAttribute("tabindex", previousTabIndex);
    }
  }
}

/** Repaints all data-driven controls, restores replaced focus, and optionally canonicalizes the URL; called by event handlers and loadManifest. @param {boolean} shouldSyncUrl Whether to replace the current query string. @param {object|null} focusRequest Replaced control to refocus. @returns {void} @example renderAll(true, { kind: "category", value: "React" }) */
function renderAll(shouldSyncUrl, focusRequest = null) {
  const filtered = getFilteredArticles();
  const pageCount = filtered.length === 0
    ? 0
    : Math.ceil(filtered.length / state.pageSize);

  // Narrower filters can invalidate a previously selected later page.
  if (pageCount > 0 && state.page > pageCount) {
    state.page = pageCount;
  }

  if (pageCount === 0) {
    state.page = 1;
  }

  renderArchiveStatus();
  renderCategories();
  renderResultSummary(filtered.length);
  renderArticles(filtered);
  renderPagination(pageCount);
  renderCalendar();
  elements.catalog.setAttribute("aria-busy", "false");
  elements.clearButton.disabled = !hasActiveArchiveState();
  restoreFocusAfterRender(focusRequest);

  // replaceState canonicalizes invalid and unknown query parameters without adding history entries.
  if (shouldSyncUrl) {
    syncUrl();
  }
}

/** Restores the full archive and newest calendar month when Clear all is pressed; called by handleClearClick. @returns {void} @example resetArchive() */
function resetArchive() {
  state.query = "";
  state.category = ALL_CATEGORIES;
  state.selectedDate = "";
  state.calendarDate = new Date(state.defaultCalendarDate);
  state.page = 1;
  elements.searchInput.value = "";
  renderAll(true);
}

/** Shows a stable loading state while the generated JSON index is fetched; called by loadManifest. @returns {void} @example renderLoadingState() */
function renderLoadingState() {
  state.status = "loading";
  elements.catalog.setAttribute("aria-busy", "true");
  elements.resultSummary.innerHTML =
    "<span><strong>—</strong> loading entries</span><span>Committed HTML documents</span>";
  elements.articleList.innerHTML =
    '<div class="loading-state" role="status"><span class="loading-rule" aria-hidden="true"></span><strong>Opening the ledger…</strong><p>Reading the generated article index.</p></div>';
  elements.pagination.innerHTML = "";
  elements.clearButton.disabled = true;
}

/** Shows a retryable, non-technical failure message when manifest loading fails; called by loadManifest. @returns {void} @example renderErrorState() */
function renderErrorState() {
  state.status = "error";
  elements.catalog.setAttribute("aria-busy", "false");
  elements.resultSummary.innerHTML =
    "<span><strong>00</strong> entries available</span><span>Index unavailable</span>";
  elements.articleList.innerHTML =
    '<div class="error-state" role="alert"><strong>The ledger could not open.</strong><p>The generated article index is unavailable. Try loading it again.</p><button class="retry-button" id="retry-button" type="button">Try again</button></div>';
  elements.pagination.innerHTML = "";
  elements.clearButton.disabled = true;
}

/** Fetches and validates the deploy-time article manifest on startup or retry; called by initialize and handleArticleListClick. @returns {Promise<void>} Resolves after success or error UI renders. @example await loadManifest() */
async function loadManifest() {
  renderLoadingState();

  try {
    const response = await fetch(MANIFEST_URL, { cache: "no-cache" });

    // HTTP failures must not be mistaken for a valid empty archive.
    if (!response.ok) {
      throw new Error("Manifest request failed with status " + response.status);
    }

    const manifest = await response.json();
    state.articles = normalizeManifest(manifest);
    state.categories = getCategories(state.articles);
    state.defaultCalendarDate = getDefaultCalendarDate(state.articles);
    hydrateStateFromUrl();
    state.status = "ready";
    renderAll(true);
  } catch (error) {
    // A concise console note helps maintainers while the page keeps technical details away from readers.
    console.info("Archive manifest unavailable.", error);
    renderErrorState();
  }
}

/** Converts computed line-height into pixels so Pretext mirrors browser typography; called by relayoutPretext. @param {CSSStyleDeclaration} styles Computed text styles. @returns {number} Pixel line height. @example getLineHeight(getComputedStyle(element)) */
function getLineHeight(styles) {
  const parsedLineHeight = Number.parseFloat(styles.lineHeight);

  // The fallback matches normal serif leading when CSS reports the keyword normal.
  if (!Number.isFinite(parsedLineHeight)) {
    return Number.parseFloat(styles.fontSize) * 1.2;
  }

  return parsedLineHeight;
}

/** Extracts the Pretext options that affect glyph measurement from computed CSS; called by preparePretextElement and getTextSignature. @param {CSSStyleDeclaration} styles Computed text styles. @returns {object} Pretext prepare options. @example getPretextOptions(getComputedStyle(element)) */
function getPretextOptions(styles) {
  const letterSpacing = Number.parseFloat(styles.letterSpacing);

  return {
    letterSpacing: Number.isFinite(letterSpacing) ? letterSpacing : 0,
    whiteSpace: styles.whiteSpace === "pre-wrap" ? "pre-wrap" : "normal",
    wordBreak: styles.wordBreak === "keep-all" ? "keep-all" : "normal",
  };
}

/** Captures text and fluid font inputs so viewport changes trigger a fresh prepare pass; called by preparePretextElement and relayoutPretext. @param {HTMLElement} element Measured element. @param {CSSStyleDeclaration} styles Computed text styles. @param {object} options Pretext options. @returns {string} Measurement signature. @example getTextSignature(element, styles, options) */
function getTextSignature(element, styles, options) {
  return [
    element.textContent || "",
    styles.font,
    options.letterSpacing,
    options.whiteSpace,
    options.wordBreak,
  ].join("|");
}

/** Prepares one visible heading after fonts or its fluid signature changes; called by registerPretextElements and relayoutPretext. @param {HTMLElement} element Text element marked with data-pretext. @returns {void} @example preparePretextElement(document.querySelector("h1")) */
function preparePretextElement(element) {
  // Native layout remains the complete fallback until the CDN module is ready.
  if (!pretextApi || !element.textContent) {
    return;
  }

  const styles = getComputedStyle(element);
  const options = getPretextOptions(styles);

  preparedText.set(element, {
    handle: pretextApi.prepare(element.textContent.trim(), styles.font, options),
    signature: getTextSignature(element, styles, options),
  });
}

/** Recomputes exact text heights after a resize without re-measuring unchanged glyphs; called by requestAnimationFrame. @returns {void} @example relayoutPretext() */
function relayoutPretext() {
  pretextFrame = 0;

  // Detached result rows are removed before measuring the current page.
  for (const [element, initialMeasurement] of preparedText) {
    if (!element.isConnected) {
      if (pretextResizeObserver) {
        pretextResizeObserver.unobserve(element);
      }

      preparedText.delete(element);
      continue;
    }

    const styles = getComputedStyle(element);
    const width = element.getBoundingClientRect().width;

    // Hidden elements have no meaningful line-break width.
    if (width <= 0) {
      continue;
    }

    const options = getPretextOptions(styles);
    const signature = getTextSignature(element, styles, options);
    let measurement = initialMeasurement;

    // Fluid clamp typography changes size across breakpoints and needs new glyph measurement.
    if (measurement.signature !== signature) {
      preparePretextElement(element);
      measurement = preparedText.get(element);
    }

    if (!measurement) {
      continue;
    }

    const result = pretextApi.layout(
      measurement.handle,
      width,
      getLineHeight(styles),
    );

    // A finite result protects native layout if a future CDN response is incompatible.
    if (Number.isFinite(result.height)) {
      const nextHeight = String(Math.ceil(result.height) + 1) + "px";

      if (element.style.height !== nextHeight) {
        element.style.height = nextHeight;
      }
    }
  }
}

/** Coalesces resize notifications so one animation frame performs one Pretext pass; called by ResizeObserver and render registration. @returns {void} @example schedulePretextLayout() */
function schedulePretextLayout() {
  // The CDN fallback or an already queued frame requires no work.
  if (!pretextApi || pretextFrame) {
    return;
  }

  pretextFrame = window.requestAnimationFrame(relayoutPretext);
}

/** Registers current data-pretext nodes after startup and dynamic article renders; called by initializePretext and renderArticles. @param {ParentNode} root Document or article subtree. @returns {void} @example registerPretextElements(document) */
function registerPretextElements(root) {
  const candidates = root.querySelectorAll("[data-pretext]");

  // Each current text node is prepared once for its latest copy and font signature.
  for (const candidate of candidates) {
    preparePretextElement(candidate);

    if (pretextResizeObserver) {
      pretextResizeObserver.observe(candidate);
    }
  }

  schedulePretextLayout();
}

/** Loads optional Pretext only after web fonts settle so a CDN failure never blocks archive controls; called once by initialize. @returns {Promise<void>} Resolves after registration or fallback. @example await initializePretext() */
async function initializePretext() {
  try {
    await document.fonts.ready;
    pretextApi = await import(PRETEXT_URL);

    // Older browsers without ResizeObserver retain correct native text wrapping.
    if (typeof ResizeObserver === "function") {
      pretextResizeObserver = new ResizeObserver(schedulePretextLayout);
    }

    registerPretextElements(document);
  } catch (error) {
    // Pretext is a progressive enhancement; filtering and native text layout remain complete.
    console.info("Pretext enhancement unavailable; native text layout is active.", error);
  }
}

/** Applies a clicked subject and resets pagination before repainting the archive; called by category-list click events. @param {MouseEvent} event Delegated click. @returns {void} @example handleCategoryClick(event) */
function handleCategoryClick(event) {
  const target = event.target;

  // Only element targets can participate in delegated closest lookups.
  if (!(target instanceof Element)) {
    return;
  }

  const button = target.closest("[data-category]");

  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  state.category = button.dataset.category || ALL_CATEGORIES;
  state.page = 1;
  renderAll(true, { kind: "category", value: state.category });
}

/** Applies title-only search as readers type and returns them to page one; called by search input events. @param {InputEvent} event Search input event. @returns {void} @example handleSearchInput(event) */
function handleSearchInput(event) {
  const target = event.target;

  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  state.query = target.value;
  state.page = 1;
  renderAll(true);
}

/** Selects or toggles one calendar day before repainting exact-date results; called by calendar-grid click events. @param {MouseEvent} event Delegated click. @returns {void} @example handleCalendarClick(event) */
function handleCalendarClick(event) {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const button = target.closest("[data-date]");

  if (!(button instanceof HTMLButtonElement) || !button.dataset.date) {
    return;
  }

  // Clicking the selected day again removes only the date filter.
  state.selectedDate =
    state.selectedDate === button.dataset.date ? "" : button.dataset.date;
  state.page = 1;
  renderAll(true, { kind: "date", value: button.dataset.date });
}

/** Switches to a clicked numbered page and returns focus context to the catalog; called by pagination click events. @param {MouseEvent} event Delegated click. @returns {void} @example handlePaginationClick(event) */
function handlePaginationClick(event) {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const button = target.closest("[data-page]");

  if (!(button instanceof HTMLButtonElement) || button.disabled) {
    return;
  }

  const page = Number.parseInt(button.dataset.page || "", 10);

  if (!Number.isSafeInteger(page) || page < 1) {
    return;
  }

  state.page = page;
  renderAll(true, { kind: "page", value: state.page });
}

/** Moves the calendar by a whole month while preserving current article filters; called by previous and next month handlers. @param {number} offset Signed month offset. @returns {void} @example shiftCalendarMonth(1) */
function shiftCalendarMonth(offset) {
  state.calendarDate = new Date(
    state.calendarDate.getFullYear(),
    state.calendarDate.getMonth() + offset,
    1,
  );
  renderCalendar();
  elements.clearButton.disabled = !hasActiveArchiveState();
  syncUrl();
}

/** Moves the register backward one month when the left arrow is pressed; called by its click listener. @returns {void} @example handlePreviousMonthClick() */
function handlePreviousMonthClick() {
  shiftCalendarMonth(-1);
}

/** Moves the register forward one month when the right arrow is pressed; called by its click listener. @returns {void} @example handleNextMonthClick() */
function handleNextMonthClick() {
  shiftCalendarMonth(1);
}

/** Clears all archive constraints when the primary reset button is pressed; called by its click listener. @returns {void} @example handleClearClick() */
function handleClearClick() {
  resetArchive();
}

/** Retries manifest loading from the inline error button without a page refresh; called by article-list click events. @param {MouseEvent} event Delegated click. @returns {void} @example handleArticleListClick(event) */
function handleArticleListClick(event) {
  const target = event.target;

  if (!(target instanceof Element) || !target.closest("#retry-button")) {
    return;
  }

  void loadManifest();
}

/** Restores shareable filters when browser history changes after the manifest is ready; called by window popstate. @returns {void} @example handlePopState() */
function handlePopState() {
  // Loading and error states have no complete category set for safe restoration.
  if (state.status !== "ready") {
    return;
  }

  hydrateStateFromUrl();
  renderAll(true);
}

/** Wires the static shell and begins data plus optional typography startup; called once at module evaluation. @returns {void} @example initialize() */
function initialize() {
  elements.categoryList.addEventListener("click", handleCategoryClick);
  elements.searchInput.addEventListener("input", handleSearchInput);
  elements.calendarGrid.addEventListener("click", handleCalendarClick);
  elements.pagination.addEventListener("click", handlePaginationClick);
  elements.previousMonthButton.addEventListener(
    "click",
    handlePreviousMonthClick,
  );
  elements.nextMonthButton.addEventListener("click", handleNextMonthClick);
  elements.clearButton.addEventListener("click", handleClearClick);
  elements.articleList.addEventListener("click", handleArticleListClick);
  window.addEventListener("popstate", handlePopState);

  void loadManifest();
  void initializePretext();
}

initialize();
