# Laststance Tech Archive Design System

## Direction

Archive Ledger is a restrained editorial index for standalone technical HTML explainers. It should feel like a maintained research ledger: precise, durable, readable, and intentionally unlike a generic product dashboard.

## Color tokens

| Token | Light | Dark | Purpose |
| --- | --- | --- | --- |
| `--ivory` | `#f3efe3` | `#18231f` | Page canvas |
| `--paper` | `#faf7ee` | `#202e28` | Header and field surfaces |
| `--forest` | `#173d32` | `#edf0df` | Primary text and borders |
| `--forest-soft` | `#315b4f` | `#b8c8bd` | Secondary text |
| `--rust` | `#a84729` | `#a84729` | Selection and publication marks |
| `--ink` | `#1f2b27` | `#e7e4d8` | Body text |
| `--muted` | `#6e746d` | `#a3aaa2` | Supporting metadata |
| `--rule` | `#c9c2af` | `#45554d` | Quiet dividers |
| `--rule-dark` | `#928b79` | `#718178` | Structural dividers |

## Typography

- Display and article headlines: `Newsreader`, weights 500–700.
- Editorial supporting copy: `Fraunces`, weights 500–650.
- Controls, labels, and metadata: `DM Sans`, weights 400–700.
- Code slips: `ui-monospace`, `SFMono-Regular`, `Menlo`, monospace.
- Headlines use tight tracking and compact line-height; control labels use uppercase text with generous tracking.

## Spacing

Use a 4px base scale: `4`, `8`, `12`, `16`, `24`, `32`, and `48px`. Large editorial bands may use fluid `clamp()` values up to `72px`. Keep content aligned to a responsive page gutter of `16px` on compact screens, `20–64px` on larger screens.

## Layout

- Desktop: 220px category rail, flexible catalog, 270px calendar rail.
- 1024px and below: category rail plus catalog; calendar moves beneath both.
- 768px and below: one column; categories become a horizontal scroll rail.
- 375px: compact gutters, stacked summary, and reduced calendar cells.
- 1440px and above: preserve a centered 1440px editorial measure through expanded outer gutters.

## Components

- Persistent archive header with document counts and hosting format.
- Editorial introduction with one display headline and short archive purpose.
- Subject rail with counts and pressed-state filtering.
- Title-only search field and one clear-all action.
- Ledger rows with folio, source kicker, title, excerpt, metadata, tags, and optional code slip.
- Numbered pagination with previous and next controls.
- Month register with publication dots and selectable quiet days.
- Explicit empty state and compact provenance footer.

## Interaction and accessibility

- Preserve semantic landmarks, heading order, a skip link, visible focus rings, `aria-live` result summaries, and truthful pressed/current states.
- Use square fields, hairline borders, and rust underlines; avoid rounded card stacks and decorative shadows.
- Support system dark mode and reduced motion.
- Headline layout must remeasure after fonts load and container resize.
