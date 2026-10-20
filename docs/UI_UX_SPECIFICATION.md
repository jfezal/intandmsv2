# UI/UX, navigation, and screen flows

**CONFIRMED:** commercial-grade file-management experience, BM/English, accessible responsive UI, desktop primary/tablet practical/mobile essentials. **PROPOSED:** screen composition and interaction defaults below; no frontend implemented.

## Experience principles

The Document Explorer is the product center, not a generic CRUD dashboard. Use familiar file interactions, restrained light-default styling, clear ownership/type/status, plain-language feedback, and progressive disclosure for technical administration. Dark mode is an enhancement, not a foundation blocker.

Every action is gated by backend capabilities and current permission; unsafe/unsupported actions are unavailable with a useful reason. Indexed “read-only” limits physical mutation, not tags/virtual organization. Explain “Move file” versus “Add to virtual folder”; never imply a logical delete removed NAS bytes.

## Navigation

Proposed primary destinations: Dashboard, Documents, My Documents, Recent, Favorites, Search, My Tasks, Workflows, Reports, Administration. “My Documents” is DMS custodian/contributor context, not an assumed NAS personal home directory. Collapse irrelevant destinations by permissions, with stable layout and no forbidden-route data flash.

Administration: Repositories, Storage Connections, Users, Roles & Permissions, Metadata Configuration, Indexing & Processing, Audit Logs, System Health, Settings. Role-based visibility is usability only; APIs reauthorize. Workflows/Reports may expose a restricted user view separate from administrative configuration.

Shell: compact sidebar, global search, breadcrumbs/content heading, contextual toolbar, locale/user controls, and in-app task/notification access. Local offline operation must not be shown as an error merely because the Internet is absent; use “Storage temporarily unavailable” for dependency degradation, distinct from browser-to-server disconnect.

## Dashboard

Useful role-scoped widgets: authorized indexed-document totals/status, recent additions/activity, pending tasks, repository availability, processing failures/indexing progress and storage headroom where permitted. No decorative analytics or global unauthorized counts. Admin sees operational views; viewer sees accessible documents/tasks. Each widget names its scope/time basis and links to an actionable detail.

## Document Explorer

- Left: separately labeled Physical folders and Virtual folders/categories; repository switcher with Managed/Indexed badge and health/read-only indication.
- Center: breadcrumbs, folder-scoped search, sort/filter, list/grid toggle, lazy expanded tree and paginated/virtualized content. Never fetch million-file trees/lists into the browser.
- List columns: filename/type, relevant date/size/type/tags/processing status as configured; grid offers safe thumbnails/status and identical actions. Selection persists only under documented view rules; no silent action on hidden selections.
- Right optional panel: details/metadata/classification/tags/related documents and quick preview; keyboard-accessible collapse/focus behavior.
- Familiar keyboard navigation, focus-visible rows, selection with modifiers and accessible checkboxes, contextual menus reachable without right-click, and bounded multi-select/bulk toolbar.
- Managed drag/drop can upload/move after permission and destination validation; Indexed physical drop shows read-only explanation. Virtual drop assigns membership without NAS relocation.
- “Select all matching” means an explicitly authorized server-side selection manifest/generation, not client loading of all results. Show per-item outcomes and partial failure; bulk actions are asynchronous beyond a safe bound.

Empty folders offer permitted next actions; unavailable NAS shows retry/last verification without pretending empty. Physical path labels are display-relative within approved root; never expose credentials or unrelated host paths.

## Integrated viewer

Main preview with toolbar: back to preserved explorer/search context, file name/type/source freshness, page/zoom/rotation where supported/fullscreen, and permitted download. Right tabs: Details, Metadata, Versions or Source observations, Activity, Workflow.

Managed Versions show immutable version sequence/hash/provenance and restore-as-new-version confirmation. Indexed Source observations show observed external change/freshness and incomplete-history notice; do not display a misleading restore button or guaranteed old-content download. Optional snapshot availability is explicit.

Common actions stay in the viewer/panel, avoiding repeated separate-page navigation. Preserve unsaved form state safely, warn on navigation, and handle conflict with reload/compare rather than silent overwrite. Unsupported/failed preview explains limitations; no unsafe iframe fallback to a cloud viewer.

## Search experience

Prominent global search with quick filename/title/content results and safe suggestions; advanced panel for repository/folder/type/category/tags/dates/owner/processing state and simple/metadata/full-text/OCR modes. Filter chips expose scope and reset; shortcuts are discoverable and not the only route.

Results use authorized title, limited encoded highlight, metadata/context and source/processing freshness. Clicking opens viewer/quick preview while preserving query/cursor/selection. Saved searches are named queries with live permissions; history is opt-in/policy controlled. Distinguish no matches, processing pending, stale/source unavailable, and error; explain restricted count availability rather than fabricate totals.

## Managed upload flow

Drop/select multiple files -> bounded queue with filename/size/progress/cancel -> destination/duplicate choice/metadata assignment -> server validation/quarantine -> accepted/processing status. Network byte progress and scan/OCR processing progress are separate. Indexed repositories do not offer upload.

Duplicate handling is explicit (skip/create separate/new version only when eligible), never auto-overwrite or reveal inaccessible duplicates. Retry explains whether transfer restarts; **do not claim resumable transfer** before protocol/checkpoint tests. Closed browser need not cancel already committed processing; status remains discoverable.

## Administration flows

- **Storage wizard:** provider/protocol/server -> write-only credential input -> test -> authorized root browser -> access/mode and health -> summary/activate. Expose mount/gateway pending state truthfully; Indexed tests never write source probes. Routine setup is web-guided; host prerequisite/gateway install and disaster recovery remain controlled operator tasks.
- **Repository wizard:** name/type/connection/root -> permissions -> indexing schedule/limits -> processing formats/languages -> retention/report-only -> validate/capability summary. Type/read-only/source-audit boundaries are visible before confirm.
- **Metadata configuration:** document type/field types (text/number/date/boolean/dropdown/multi-select/reference), required/default/validation/options/searchability -> schema-change impact/old-value preservation -> publish version.
- **User/role management:** local activation/reset/lockout/revoke sessions, groups/scoped permissions, optional LDAP mapping with no implicit NAS ACL synchronization. Audit and effective-permission preview for admins.
- **Workflow designer:** guided sequential/approved parallel definitions, eligibility/tasks/due/notification rules and version target; warn about stale Indexed state and incomplete evidence.
- **Retention:** policy/start event/expiry/report/review/hold, separate logical versus physical disposition and Indexed no-source-delete rule. Irreversible actions require explicit clear consequence/approval, not a generic “OK.”

## Indexing dashboard

Repository/scoped run state, discovered/indexed/failed/skipped counts, backlog, last scan/verification, measured throughput window, active stage, errors/reasons and resume checkpoint. Pause/resume/retry/reindex-folder/rebuild are permission-controlled, audited and confirm scope/load.

Unknown total during discovery uses indeterminate progress. Percentages require a known work basis; no invented ETA. A NAS outage is source unavailable, not zero documents; errors distinguish retryable I/O/credentials/resources from unsupported content. Show admin limits/schedules and recovery actions without raw stacks/secrets.

## Required screen states

All screens: loading, empty, error, browser/server disconnect or degraded dependency, forbidden/session-expired, processing pending, concurrent change and success. Use inline feedback for forms, persistent error summaries and meaningful retry; toast alone cannot be the only failure record. Announce status to assistive technology without overwhelming repeated worker updates.

Permission revocation closes sensitive views/clears client caches; a 404-safe resource response must not leak a title in an error breadcrumb. Destructive dialogs name action/scope/consequences and safe cancel/default focus, with keyboard/focus return. Bulk partial success shows item report.

## Localization and responsiveness

BM (`ms-MY`) and English (`en`) are required UI locales, separate from OCR language. All labels/errors/date/number formats/notifications and accessibility text use translation keys; no string concatenation that prevents natural translation. Customer content/path/tag text is not silently translated. Store UTC, display configured user/site timezone with explicit audit timezone. Default locale/timezone policy remains D-14.

Desktop: full explorer/detail/viewer. Tablet: collapsible tree/panel and practical selection. Mobile: essential search/preview/download-permission/tasks with responsive controls; no promise of every host-admin configuration fitting a tiny screen. WCAG 2.2 AA is the proposed measurable accessibility baseline; test keyboard/screen readers/reflow/contrast and avoid color-only status.

## UX acceptance

Synthetic-data usability journeys: find a document from physical/virtual views, safely distinguish repository types, view preview/details, classify without moving a file, upload/retry a Managed file, understand source-changed/unavailable, act on a task, configure a connection/repository, pause/retry indexing, and recover a denied/conflicting operation. Record BM/English, keyboard-only, desktop/tablet/mobile-essential results; propose task-success measurements under D-14 without inventing a training-time promise.

See [Design system](DESIGN_SYSTEM.md), [Repository models](REPOSITORY_MODELS.md), and [Testing](TESTING_STRATEGY.md).
