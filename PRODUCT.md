# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the archive owner returning to previously written technical explainers and trying to rediscover the right article quickly. The public archive also serves engineers who open and read those standalone pages.

## Product Purpose

Laststance Archive turns committed standalone HTML explainers into a searchable, browsable index. Success means the owner can recognize the right entry and reach its original page with minimal effort.

## Positioning

The committed HTML document is both the durable source and the published artifact: adding an article file automatically places it in the generated archive without a separate CMS record.

## Operating Context

Articles are written as independently readable HTML documents, committed under `site/articles/`, indexed during build or deployment, and published on GitHub Pages. Visitors can find entries by title, subject, date, and pagination before opening the original document.

## Capabilities and Constraints

- Preserve title search, subject filtering, date filtering, pagination, URL-owned filter state, and direct links to standalone article pages.
- Keep the site compatible with static GitHub Pages hosting under the `/tech-archive/` repository path.
- Treat `site/data/articles.json` as generated output; article files remain the content source.
- Keep the archive usable across compact mobile and wide desktop viewports, system dark mode, reduced motion, keyboard navigation, and assistive technology.

## Brand Commitments

Use the product name “Laststance Archive.” Keep outward-facing copy concise, factual, and technically literate. Do not invent claims, publication volume, or audience proof.

## Evidence on Hand

The repository contains real standalone explainers under `site/articles/`, the generated-index pipeline in `scripts/build-article-index.mjs`, and the working archive interface in `site/index.html`, `site/styles.css`, and `site/app.js`.

## Product Principles

- Optimize every archive decision for fast article rediscovery.
- Let real article titles and metadata carry the interface.
- Keep publishing file-based, static, and durable.
- Preserve direct access to each original explainer.
- Make every filter state understandable and recoverable.
