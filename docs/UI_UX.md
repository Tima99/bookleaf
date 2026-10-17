# UI / UX

## Branding

- Reference: the BookLeaf Publishing website (bookleafpub.in). Colours were sampled from
  its landing page: the logo / "Publish My Book" pink **`#FF4975`**, the light pink hero wash
  (`#FFE8ED` → `#FFD4DA`, waves `#FFB4BD`), body text `#5E5E5E` and heading ink `#272729`.
- The app uses the **lightest pink** as its canvas (`#FFF7F9` page background, white cards
  with soft pink borders), BookLeaf pink for primary actions, a light pink-tinted admin
  sidebar with pill-shaped selection, and a pink hero panel on the login page echoing the
  site's "Publishing Made Easy" section.
- Buttons are pill-shaped like the site's "Publish My Book" button.
- Typography: **Lato** (bold/black) for headings — close to the site's rounded sans — and
  **Inter** for UI text.
- The header mark is a drawn approximation of the BookLeaf logo (pink square, white slash);
  swap in the official asset for production. All colours live in one place
  (`apps/web/src/styles/tokens.ts`, mirrored in `globals.css` `@theme`).
- **Contrast:** white on `#FF4975` is 3.2:1, fine for the semibold button labels and large
  headings but not for small text. Text-level pink (links, selected menu/tab items, small
  labels) therefore uses the deeper `brand-700` `#D6295A` (4.9:1 on white, WCAG AA).

## Design tokens

| Token                      | Value                             | Use                                                         |
| -------------------------- | --------------------------------- | ----------------------------------------------------------- |
| brand-500                  | `#FF4975`                         | primary buttons, logo mark, avatars, accents, progress      |
| brand-700                  | `#D6295A`                         | links, selected nav/tab text, small pink text (AA contrast) |
| brand-50 / 100 / 200       | `#FFF5F7` / `#FFE8ED` / `#FFD4DA` | hover rows, selected nav pill, hero wash, team bubbles      |
| accent-500                 | `#4342B9`                         | secondary accent (author avatar, info) — the site's indigo  |
| page / surface             | `#FFF7F9` / `#FFFFFF`             | lightest-pink canvas, cards                                 |
| line / divider             | `#F3DEE3` / `#F8EBEF`             | soft pink borders                                           |
| ink / muted / subtle       | `#272729` / `#5E5E5E` / `#8E8A8C` | text hierarchy (from the site)                              |
| success / warning / danger | `#2E7D4F` / `#B7791F` / `#C62828` | status semantics (kept distinct from brand pink)            |
| note / note-border         | `#FFF8E6` / `#F2D59B`             | internal notes (visibly different from public messages)     |
| radius                     | 6 / 8 / 14 px, pill buttons       | controls / default / cards                                  |

The same tokens are mapped onto Ant Design (`styles/theme.ts`): primary/hover/active pinks,
link colours, text, border and background colours, radii, fonts, and component tokens (light
sidebar menu with pink pill selection, pill buttons, table header and row hover, tab ink bar).

## Responsibilities

- **Ant Design 6**: tables + pagination, forms controls, selects, date range, drawers,
  modals/confirmations, notifications, tags, steps, timeline, tabs.
- **Tailwind 4**: page layout and grids, spacing, typography, custom surfaces (`surface-card`),
  responsive behaviour.
- **Framer Motion**: page entrance (fade + 6px), tab-panel transitions, the sliding active-tab
  indicator, new message entrance in conversations. `MotionConfig reducedMotion="user"`
  plus a CSS `prefers-reduced-motion` rule disable motion for users who ask for it.
  Data tables are never animated.
- **Buttons**: 120–160 ms colour transitions, a 1.5% press scale, visible focus ring,
  loading spinners on every async action, disabled states while submitting.

## Author portal

- **Dashboard**: 8 stat cards computed by the API, royalty calendar (concrete payout dates,
  ₹1,000 threshold notice), recent tickets, book status list.
- **My Books**: search, stage filter, server-side pagination, horizontal scroll on small
  screens, click a row for a drawer with all fields. Null values in production books show
  "Available once published" instead of ₹0.
- **Raise a query**: book select (incl. "General / Account level"), subject/description
  with counters and inline Zod errors, contextual tip based on what's typed, production
  stage notice, attachment drop-zone that clearly says files are **not** uploaded yet,
  double-submit prevention (button state + server duplicate check).
- **My Tickets / ticket page**: status filter + search (subject or BL-number), "Team replied"
  marker, chronological conversation with the original query first, progress steps,
  reply box (re-opens resolved tickets), live indicator.

## Admin workspace

```
┌───────────────┬──────────────────────────────────────────────┐
│ [/] BookLeaf  │ Dashboard | Ticket queue | BL-1004 · Ananya ●×│  ← tab bar (sticky)
│  (click logo  ├──────────────────────────────────────────────┤
│   = collapse) │                                              │
│ Dashboard     │  active tab content                          │
│ Ticket queue  │  (other tabs kept mounted, layout cached)    │
│ Authors …     │                                              │
│───────────────│                                              │
│ ● Live        │                                              │
│ (A) Aditi Rao │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

- No top header: the content starts with the tab strip. Clicking the **logo** collapses /
  expands the sidebar (76 px icon rail ↔ 248 px); the **profile** (avatar, name, email →
  sign-out menu) and the live-update status sit at the bottom of the sidebar.
- Switching is instant and flicker-free: a tab or sidebar click activates the tab in the
  store and updates the URL with the native History API (`history.pushState`, which Next.js
  syncs with `usePathname`). There is no route fetch and no `<head>` re-render, so the
  browser tab's title and favicon never flicker (verified: 0 head mutations over 18
  switches). The URL stays the source of truth — Back/Forward, refresh and deep links
  activate the matching tab (`tabFromPath`). The underline is a per-tab CSS transform;
  hidden tabs use `content-visibility: hidden` (rendering cached, `inert` for focus/a11y)
  and are memoised, so returning to a large table doesn't re-layout or re-render it.
- Sidebar items and queue rows **open tabs**; opening an already-open ticket activates its
  tab (stable ids like `ticket:<id>` — never duplicates).
- Inactive tabs stay mounted (hidden), so a half-written reply, scroll position and queue
  filters survive switching.
- Close with × or middle-click; closing the active tab selects the right-hand neighbour,
  then the left, then the dashboard. The dashboard tab is pinned.
- An amber dot marks tabs with unsaved text; closing such a tab asks for confirmation, and
  the browser warns before unloading the page.
- URL ↔ tab sync: each tab has an `href`; refresh restores open tabs, the active tab and
  queue filters from `sessionStorage` (navigation state only — no ticket content or drafts).
- Chrome-style tab strip: each tab is sized to its own label (max 220px). When space runs
  out, tabs shrink in proportion to their width, but each tab's minimum comes from its
  content — measured with the real font — so short labels (≤ 8 characters) never truncate
  and longer ones always keep their first 8 characters ("Priya Sh…"). The active tab keeps
  its full label. Full titles show in a tooltip; thin separators divide inactive tabs; every closable tab
  reserves a slot for its × (shown on hover for inactive tabs), so the × never covers the
  title and hovering never resizes a tab.
  Only when every tab is at its own minimum does the strip scroll — with the scrollbar
  hidden, a soft shadow/fade on the left/right edge whenever more tabs exist in that
  direction, mouse-wheel horizontal scrolling, and the active tab always kept in view
  (also when its title loads later). Up to 20 tabs; beyond that the oldest clean tab is
  evicted.
- On small screens the sidebar becomes a drawer (opened from a menu button at the start of
  the tab strip) and the tab strip scrolls horizontally.

### Ticket workspace

Left: conversation → reply composer (AI draft pre-filled only while untouched, model /
strategy / KB sources shown, verification checklist, "Restore draft", "Regenerate",
"Send" / "Send & resolve" with confirmation that warns about unedited AI drafts and
unchecked items) → internal notes (amber, lock icon, "never shown to the author").
Right: AI triage (category/priority override selects with AI/Rules/Admin provenance badges,
confidence, rationale, applied policy rules, model + strategy version, failure banner,
re-run), author card (opens author tab), book facts, activity timeline.

### Column chooser

Every data table (ticket queue, My Books, authors, AI strategies, run log) has a
**Columns** dropdown to show or hide columns. The primary column (Ticket / Title / Author /
Strategy) is locked; "Show all" and "Reset" restore defaults. The queue offers extra
Author, Book and Created columns (hidden by default because the Ticket cell already
summarises them). Choices are a per-viewer preference stored in `localStorage` per table
(guarded so a blocked storage just falls back to defaults) — nothing is sent to the server.

### Queue

Server-side filters (search, status, priority, category, assignee, date range), sort
(urgency default: unresolved, most urgent, oldest first), reset, page size. Critical/high
rows carry a red/amber edge; tickets unresolved for over 48h show their age in red; a blue
dot marks tickets awaiting a team reply. Filters persist across tab switches and refreshes.

## Accessibility

- Semantic landmarks, `role="tablist"/"tab"/"tabpanel"`, `aria-selected`, labelled icon
  buttons and form controls, keyboard-openable table rows (Enter), visible focus rings.
- Colour is never the only signal (tags have text, overdue age has an icon).
- Body text ≥ 13–14 px, WCAG-friendly contrast for ink colours on white.
