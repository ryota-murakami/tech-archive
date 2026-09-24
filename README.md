# Tech Archive

Tech Archive publishes standalone technical HTML explainers as a searchable, filterable private catalog, served by Cloudflare Workers behind Cloudflare Access. Drop an HTML file into `site/articles/`; the build script discovers it and regenerates `site/data/articles.json` for the home page.

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
3. Run `pnpm check`, then commit and push to `main`. The deploy workflow rebuilds the index and uploads the entire `site/` directory to Cloudflare.

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

Each article opens as its own document; the catalog does not inject article markup into the home page. Self-contained HTML with inline CSS and JavaScript is the most portable option. Shared assets also work, but reference them with paths relative to the article file so the site keeps working wherever it is served. Avoid root-relative URLs such as `/assets/example.png`.

In production, Cloudflare answers `articles/example.html` with a redirect to `articles/example`; relative asset paths still resolve because the directory does not change.

## Cloudflare deployment

The site is an assets-only Cloudflare Worker configured in `wrangler.jsonc`. Its `workers.dev` hostname is the only entry point (preview URLs are disabled), and Cloudflare Access requires sign-in before any page, article, or `data/articles.json` is served.

One-time setup:

1. Create a Cloudflare API token from the **Edit Cloudflare Workers** template.
2. Add the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` under **Settings → Secrets and variables → Actions**.
3. Push to `main`, or run **Deploy Tech Archive to Cloudflare Workers** from the **Actions** tab. The first run creates the `tech-archive` Worker.
4. In the Cloudflare dashboard, open **Workers & Pages → tech-archive → Settings → Domains & Routes**, select **Enable Cloudflare Access** for `workers.dev`, and choose the **Cloudflare account** policy. Finish the Zero Trust onboarding (team name, Free plan) if the dashboard asks for it. Do not use an **Email domain** policy with a public mail domain such as `gmail.com`; it admits every account on that domain.
5. Confirm the gate: `curl -sI https://tech-archive.<subdomain>.workers.dev/` must return `302` with a `cloudflareaccess.com` location.

Keep this GitHub repository private too. Access guards only the deployed site, not the article sources in `site/articles/`.

The workflow uses Node.js 24, generates the manifest without installing project dependencies, runs a pinned Wrangler through `npx`, and grants the job read-only repository access. Run `npx wrangler@4.137.0 dev` to preview Cloudflare's asset routing locally.

## Repository structure

```text
.
├── .github/workflows/deploy.yml    # build and Cloudflare Workers deployment
├── scripts/
│   ├── build-article-index.mjs      # HTML discovery and metadata extraction
│   └── dev-server.mjs               # local static server and file watcher
├── site/
│   ├── index.html                   # archive home page
│   ├── styles.css                   # editorial archive design
│   ├── app.js                       # search, categories, calendar, pagination
│   ├── articles/                    # standalone HTML documents
│   └── data/articles.json           # generated manifest
├── test/                            # Node.js behavior tests
├── wrangler.jsonc                   # Cloudflare Worker static-assets config
└── package.json
```

Treat `site/data/articles.json` as generated output: change article HTML, then run the build instead of editing the manifest directly.
