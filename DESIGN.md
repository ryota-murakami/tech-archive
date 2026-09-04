---
name: Laststance Archive
description: A ruled field-notebook index for rediscovering standalone technical explainers.
colors:
  canvas: "#f1f0e9"
  sheet: "#f8f7f1"
  ink: "#202521"
  quiet: "#5f665f"
  faint: "#d8dbd4"
  rule: "#aeb5ae"
  rule-strong: "#747d75"
  mineral-blue: "#315c8a"
  mineral-blue-soft: "#e1e9f1"
  mineral-blue-ink: "#244a73"
  danger: "#9a382e"
  dark-canvas: "#171b18"
  dark-sheet: "#1e231f"
  dark-ink: "#eef1eb"
  dark-quiet: "#abb2ab"
  dark-faint: "#323a34"
  dark-rule: "#4d5850"
  dark-rule-strong: "#778279"
  dark-mineral-blue: "#86add1"
  dark-mineral-blue-soft: "#26394b"
  dark-mineral-blue-ink: "#a9c9e6"
  dark-danger: "#ef9e95"
typography:
  display:
    fontFamily: '"Source Sans 3", "Helvetica Neue", sans-serif'
    fontSize: "clamp(2.35rem, 4.8vw, 4.75rem)"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: '"Source Sans 3", "Helvetica Neue", sans-serif'
    fontSize: "clamp(1.45rem, 2.4vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  body:
    fontFamily: '"Source Sans 3", "Helvetica Neue", sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: '"Source Sans 3", "Helvetica Neue", sans-serif'
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.55
    letterSpacing: "0.08em"
rounded:
  square: "0"
spacing:
  xs: "6px"
  sm: "12px"
  md: "18px"
  lg: "28px"
  xl: "42px"
components:
  button-clear:
    backgroundColor: "transparent"
    textColor: "{colors.mineral-blue-ink}"
    rounded: "{rounded.square}"
    height: "44px"
    padding: "0 2px"
  input-search:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    height: "52px"
    padding: "0 38px 4px 0"
  article-code:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.mineral-blue-ink}"
    rounded: "{rounded.square}"
    padding: "5px 8px"
---

# Design System: Laststance Archive

## Overview

**Creative North Star: "The Open Field Notebook"**

Laststance Archive feels like an open working notebook whose pages have been carefully indexed. The interface is quiet, compact, and practical: the owner should recognize a remembered phrase, subject, or date before any surrounding interface competes for attention.

The visual system uses graphite ink, mineral blue, ruled paper, and square editorial controls. It deliberately avoids rounded dashboard cards, decorative shadows, and ornamental labels so the committed article titles and metadata remain the primary material.

**Key Characteristics:**

- Search-first retrieval on one open ruled sheet.
- Mineral blue reserved for indexing and interactive states.
- Square controls and hairline rules instead of floating cards.
- One compact sans-serif hierarchy, with monospace reserved for code.
- Date and publication cues remain secondary to article recognition.

## Colors

The palette pairs warm paper neutrals with cool mineral blue so the archive feels maintained and technical without becoming clinical.

### Primary

- **Mineral Blue** (`#315c8a`): Index marks, focus rings, active controls, selection, publication marks, and the search cursor rule.
- **Deep Mineral Ink** (`#244a73`): Linked text and active labels where the main blue needs stronger light-mode contrast.
- **Washed Mineral Blue** (`#e1e9f1`): Quiet hover and calendar surfaces, always paired with dark text.

### Neutral

- **Ruled Canvas** (`#f1f0e9`): The page background beneath the fixed 32px notebook ruling.
- **Open Sheet** (`#f8f7f1`): Code slips and inverse text against darker states.
- **Graphite Ink** (`#202521`): Primary copy, headings, and the strongest structural rule.
- **Pencil Note** (`#5f665f`): Supporting copy, placeholders, counts, and metadata.
- **Faint Rule** (`#d8dbd4`), **Notebook Rule** (`#aeb5ae`), and **Strong Rule** (`#747d75`): A three-step divider hierarchy from row detail to page structure.
- **Correction Red** (`#9a382e`): Error feedback only.

Dark mode preserves the same roles with `#171b18` canvas, `#1e231f` sheet, `#eef1eb` ink, `#abb2ab` quiet text, and `#86add1` mineral blue. Supporting dark values are `#323a34`, `#4d5850`, `#778279`, `#26394b`, `#a9c9e6`, and `#ef9e95`.

### Named Rules

**The Mineral Signal Rule.** Mineral blue marks indexing, navigation, selection, focus, or publication; it does not fill passive decoration.

**The Paper Before Panels Rule.** Preserve one continuous ruled canvas and separate regions with lines and spacing instead of card backgrounds.

## Typography

**Display Font:** Source Sans 3 (with Helvetica Neue and sans-serif fallbacks)

**Body Font:** Source Sans 3 (with Helvetica Neue and sans-serif fallbacks)

**Code Font:** `ui-monospace`, `SFMono-Regular`, Menlo, monospace

**Character:** A single workhorse sans family keeps the archive fast to scan. Weight, scale, alignment, and tabular figures create hierarchy without introducing an editorial display face.

### Hierarchy

- **Display** (600, `clamp(2.35rem, 4.8vw, 4.75rem)`, 0.98): The single page question; compact screens use `clamp(2.45rem, 12vw, 4rem)` and settle at `2.65rem` below 430px.
- **Headline** (600, `clamp(1.45rem, 2.4vw, 2.25rem)`, 1.08): Article titles, balanced to roughly 24–28 characters per line.
- **Body** (400, `16px`, 1.55): Interface explanation and general reading copy; excerpts use 15px at 1.6 and a 70ch maximum.
- **Label** (700, `12px`, 0.08em tracking): Subjects, rail headings, counts, and compact controls; structural labels may use uppercase.
- **Metadata** (400–600, `12px`): Dates, type, source, reading time, tags, and counts use tabular figures when numeric.

### Named Rules

**The One Working Voice Rule.** Use Source Sans 3 for every interface role and reserve monospace for literal code snippets.

## Layout

The archive sits inside a `1320px` maximum measure with a fluid `18–64px` page gutter. The first region pairs the page question with a full-width search rule, followed by a result summary and the article workspace.

Above 1080px, the workspace uses a `174px / minmax(0, 1fr) / 308px` grid for subjects, articles, and date tools. At 1080px, it becomes a `160px / minmax(0, 1fr)` grid and moves the calendar below both columns. At 760px, all regions stack; subjects become a horizontally scrollable rail with a fading right edge. At 430px, the masthead, search, summary, metadata gaps, and pagination labels tighten without reducing the 44px control target. Below 345px, the 308px calendar bleeds into the page gutter so every day remains 44px square without causing viewport overflow. At 1440px and wider, the outer gutter settles at 48px.

Spacing follows a compact working rhythm built from 6px, 12px, 18px, 28px, and 42px intervals. Article rows use 27–29px vertical padding on larger screens and 23–25px on compact screens.

## Elevation & Depth

The system uses no shadows. Depth comes from the warm canvas, the repeating ruled-paper line, three divider strengths, and restrained state fills that remain visually attached to the sheet.

### Named Rules

**The Attached Surface Rule.** Every control and result belongs to the notebook page; use borders, ruling, and tonal state changes instead of floating elevation.

## Shapes

Corners stay square with a `0` radius. Controls use underline or hairline geometry, article links end in a small CSS-drawn north-east index tick, and publication days use a short rectangular blue mark. Borders are one pixel except for the two-pixel archive divider, active subject underline, focus ring, and search cursor rule.

## Components

### Search Field

- **Shape:** Transparent, square, and bottom-ruled; the input is at least 52px high.
- **State:** Focus expands a two-pixel mineral-blue rule from 8% to full width over 320ms.
- **Placeholder:** Uses Pencil Note at full opacity so it remains readable in both themes.

### Clear and Pagination Buttons

- **Shape:** Clear is an underlined text action; pagination uses connected 44px square cells with 82px end controls.
- **State:** Active and hover pagination cells invert to mineral blue with Open Sheet text; disabled controls remain visible at reduced opacity.
- **Focus:** A two-pixel mineral-blue outline sits three pixels outside every interactive control.

### Subject Rail

- **Shape:** Full-width line items on larger screens and auto-width 44px tabs on compact screens.
- **State:** Hover and pressed states draw a two-pixel mineral-blue underline; pressed text uses Deep Mineral Ink and weight 700.

### Article Index

- **Shape:** Each row uses a narrow folio column and a flexible article column, separated from the next record by one Notebook Rule.
- **State:** Hover or focus changes the divider to mineral blue and adds a translucent Washed Mineral Blue field.
- **Target:** Title links keep a 44px minimum height, and uninterrupted technical identifiers wrap within the article column.
- **Content order:** Folio, title, excerpt, metadata, type/source context, tags, then an optional code slip.

### Date Calendar

- **Shape:** A compact seven-column register with 44px-square days and plain 44px-high Prev and Next controls.
- **State:** Publication days carry a blue mark; a selected day fills mineral blue and inverts its text and mark.

### Code Slip

- **Shape:** An inline square paper fragment with a one-pixel rule and `5px 8px` padding.
- **Type:** Monospace at 12px, horizontally scrollable when the literal code exceeds its measure.

## Do's and Don'ts

### Do:

- **Do** lead with search and real article titles when the job is rediscovery.
- **Do** use mineral blue for index markers and active, linked, focused, selected, or published meaning.
- **Do** preserve 44px minimum interactive targets and visible two-pixel focus outlines.
- **Do** keep the subjects rail horizontally scrollable with a visible continuation cue on compact screens.
- **Do** preserve the light and dark semantic color roles and reduced-motion override.

### Don't:

- **Don't** turn archive regions or article rows into rounded cards.
- **Don't** add shadows, decorative gradient fills, ornamental kickers, or decorative badges.
- **Don't** introduce a second interface typeface; use monospace only for code.
- **Don't** make the calendar visually stronger than search, subjects, or article titles.
- **Don't** use icon glyphs where plain text or CSS geometry communicates the control more clearly.
