# Tech Archive

Tech Archive publishes standalone technical HTML explainers as a searchable, filterable GitHub Pages catalog. Drop an HTML file into `site/articles/`; the build script discovers it and regenerates `site/data/articles.json` for the home page.

## Quick start

Node.js 24 is recommended. The project uses only Node.js built-ins, so no dependency installation is required.

```bash
corepack enable
pnpm dev
```

The development server opens at `http://127.0.0.1:4173`; set `PORT` to override the port.

Useful commands:

```bash
pnpm dev    # build the article index, then serve and watch the site
pnpm build  # regenerate site/data/articles.json
pnpm test   # run the Node.js test suite
pnpm check  # run tests, then build the production index
```

## Add an article

1. Add a standalone file anywhere under `site/articles/`; `YYYY-MM-DD-readable-slug.html` is the recommended filename.
2. Add the metadata below when possible. It improves catalog labels, search results, and calendar filtering, but fallback extraction keeps metadata optional.
3. Run `pnpm check`, then commit and push to `main`. The Pages workflow rebuilds the index and deploys the entire `site/` directory.

No registry file needs to be edited by hand. Non-HTML files are ignored by article discovery.

### Recommended metadata

| Tag | Purpose | Example |
| --- | --- | --- |
| `description` | Catalog excerpt and search summary | `A visual explanation of source-map recovery.` |
| `archive:title` | Display title | `Why the debugger lost the stack` |
| `archive:published` | Calendar date, preferably ISO `YYYY-MM-DD` | `2026-07-22` |
| `archive:category` | Category; repeat the tag for multiple categories | `Debugging` |
| `archive:type` | Content format | `Explain Diff` |
| `archive:source` | Repository, PR, paper, or other origin | `vercel/next.js · #95945` |
| `archive:reading-minutes` | Positive whole-number estimate | `10` |
| `archive:quiz-count` | Non-negative whole-number quiz count | `5` |
| `archive:code` | Short code preview shown in the catalog | `getOriginalStackFrames(error)` |

Complete example:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      name="description"
      content="How fake stack frames lost source-map coverage and how the contract became testable."
    />
    <meta name="archive:title" content="Why the debugger lost the stack" />
    <meta name="archive:published" content="2026-07-22" />
    <meta name="archive:category" content="Debugging" />
    <meta name="archive:category" content="Next.js" />
    <meta name="archive:type" content="Explain Diff" />
    <meta name="archive:source" content="vercel/next.js · #95945" />
    <meta name="archive:reading-minutes" content="10" />
    <meta name="archive:quiz-count" content="5" />
    <meta
      name="archive:code"
      content="getOriginalStackFrames(error) → null"
    />
    <title>Why the debugger lost the stack</title>
  </head>
  <body>
    <main>
      <article>
        <h1>Why the debugger lost the stack</h1>
        <p class="lede">A visual explanation of the missing source-map contract.</p>
        <!-- Article content -->
      </article>
    </main>
  </body>
</html>
```

### Fallback rules

- **Title:** `archive:title` → `<title>` → first `<h1>` → filename slug.
- **Description:** `description` → `.lede` → first `<p>` → an empty string.
- **Published date:** valid `archive:published` normalized to ISO → leading `YYYY-MM-DD` in the filename → `null`.
- **Categories:** repeated `archive:category` tags; comma-separated values are also split and duplicates removed → `Uncategorized`.
- **Type, source, and code:** `archive:type` → `Article`; `archive:source` and `archive:code` → empty strings.
- **Reading time:** positive `archive:reading-minutes` → text in `<article>` (or `<body>`) calculated at 200 words per minute, rounded up with a one-minute minimum.
- **Quiz count:** non-negative `archive:quiz-count` → detected `data-quiz` / `data-quiz-question` markers or `.quiz-card` / `.quiz-question` elements → `0`.

The generated article `href` is relative to the `site/` root, and its stable `id` is that path without the `.html` extension.

## Independent article HTML

Each article opens as its own document; the catalog does not inject article markup into the home page. Self-contained HTML with inline CSS and JavaScript is the most portable option. Shared assets also work, but reference them with paths relative to the article file so the site continues to work under a repository Pages URL such as `/tech-archive/`. Avoid root-relative URLs such as `/assets/example.png`.

## GitHub Pages setup

1. Push the repository to GitHub with `main` as the default branch.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main`, or run **Deploy Tech Archive to GitHub Pages** manually from the **Actions** tab.
5. Follow the deployment URL shown in the workflow summary. GitHub creates the `github-pages` environment automatically; add environment protection rules if the repository needs an approval gate.

The workflow uses Node.js 24, generates the manifest without installing dependencies, preserves `site/.nojekyll`, and grants each job only the GitHub token permissions it needs.

## Repository structure

```text
.
├── .github/workflows/pages.yml     # build and GitHub Pages deployment
├── scripts/
│   ├── build-article-index.mjs      # HTML discovery and metadata extraction
│   └── dev-server.mjs               # local static server and file watcher
├── site/
│   ├── index.html                   # archive home page
│   ├── styles.css                   # editorial archive design
│   ├── app.js                       # search, categories, calendar, pagination
│   ├── articles/                    # standalone HTML documents
│   ├── data/articles.json           # generated manifest
│   └── .nojekyll                    # serve files without Jekyll processing
├── test/                            # Node.js behavior tests
└── package.json
```

Treat `site/data/articles.json` as generated output: change article HTML, then run the build instead of editing the manifest directly.
