# Design system specification

**CONFIRMED:** clean restrained commercial UI, coherent tokens/components, BM/English, light default, accessibility/responsiveness. **PROPOSED:** token and interaction baseline; no CSS/components implemented.

## Tokens

- Typography: bundled system-compatible sans-serif or approved locally packaged font; proposed scale 12/14/16/20/24/30 px with readable line heights, 14–16 px core controls/body. No remote font service; allow user text zoom and long BM labels.
- Spacing: 4 px base with 4/8/12/16/24/32 px rhythm; compact desktop explorer rows and comfortable touch targets. Minimum target rules follow chosen WCAG criterion, with proposed 44 px preferred touch area on tablet/mobile where practical.
- Semantic color: neutral surfaces/text/borders plus restrained brand accent; success/warning/danger/info mapped consistently. Choose exact palette after contrast/design review (D-14); status also has text/icon, never color alone.
- Radius/borders: subtle consistent radii and structural separators; no excessive gradients, decorative charts, inconsistent card walls or large ornamental shadows.
- Elevation/layers: explicit overlay/popover/dialog z-order, focus outlines and visible boundaries; overlays must not trap users behind invisible backdrops.
- Density: standard default, optional compact explorer mode only after accessibility review; no reduced hit targets solely to fit more files.

Use semantic tokens rather than hardcoded colors/sizes scattered across features. Dark mode, if later enabled, uses complete tested semantic tokens, not ad hoc inversion. Files/icons/content keep consistent readable contrast.

## Component inventory

Shell/sidebar/breadcrumbs/global search; buttons/icon buttons/menus; labeled input/select/multi-select/date/number/checkbox; form field/error summary; dialog/drawer/tabs; status badge/alert/progress/skeleton; data list/grid/table/tree/selection toolbar; filter chips/saved-query control; upload queue; document icon/thumbnail; viewer toolbar; details panel; audit/timeline; task decision form; wizard; pagination/cursor navigation.

Choose one maintained accessible primitive/component approach after a focused compatibility/license assessment. Existing React patterns remain; do not introduce a second UI framework/design library for each screen. Virtualized tree/list implementations must retain keyboard/ARIA semantics and meaningful focus when rows unmount.

## Interaction rules

- Primary action distinct; destructive action styled/labeled explicitly, not icon-only. Read-only reasons are discoverable with keyboard, not tooltip-only.
- One predictable focus order; menu/dialog keyboard support, escape behavior and focus return. Avoid nested modal workflows.
- Labels/hints/error text are associated with controls. Required state and validation are announced; errors preserve entered safe values, never echo secrets.
- Busy/progress controls expose accessible status; network transfer and server processing use separate labels.
- Toasts supplement durable inline/status messages. Loading skeletons do not suggest fake content/progress.
- Multi-select shows actual selection scope/count and clears or confirms across filters according to documented rules. Context menu and toolbar actions share one capability model.
- Unsaved metadata and concurrent edits provide cancel/reload/compare; no silent data loss.
- Motion is restrained, respects reduced-motion settings, and never delays critical actions.

## Localization, responsive layout, and content

Translations include accessible names, action reasons, status/error codes, pluralization, empty states, notifications and dialogs. Use sentence-case/plain-language labels; technical mount/database terms belong in operator screens. Dates distinguish discovery/modified/last verified; history distinguishes observed versus controlled changes.

Desktop explorer uses resizable/lazy tree and optional details panel; tablet collapses secondary regions; mobile essentials use drawer/navigation and touch-accessible preview/tasks. Do not hide required security warnings at smaller widths. Layout tolerates long filenames/BM labels and uses accessible truncated-text reveal.

## Quality gate

Document component variants/states and approve reference screens for Explorer, Viewer, Search, Upload, Storage wizard, Indexing dashboard and Task decision before implementing many pages. Test WCAG contrast/reflow/keyboard/screen-reader behavior and BM/English layout with synthetic content; measure usability as well as visual consistency. No mock implementation or claimed user test exists yet.
