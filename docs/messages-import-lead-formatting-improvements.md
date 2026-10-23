# Messages, template import and lead formatting improvements

Local implementation and review evidence — 23 October 2026.

## Scope and isolation

No deployment, push, production data writes, migration, environment-file edits, authentication, email integration, Multi-Admin, RLS or permissions changes. Browser checks used the built standalone application at http://127.0.0.1:3000 with the existing synthetic demo mode, without loading server credentials. Demo messages/imports do not persist or send notifications. The production screenshot's particular stored lead record was not inspected or rewritten.

## Messages before and after

The existing two-pane infrastructure already supported project/task conversations, an authorized project selector, query caching, read acknowledgments, pagination and Realtime. It did not need replacement. The old page heading consumed vertical space; the inbox emphasized thread titles and had no category filters; the composer was single-line.

The new layout follows the reference's hierarchy: existing application navigation, full-height inbox, then conversation. Desktop inbox width is 360–460px (smaller on tablet). Message Center, Project Chat, search and filters stay above independently scrollable rows. Rows emphasize client identity, then project/task context, preview, activity and unread count. Selected rows use LeadsEdge red, not LaunchBay blue. Conversation headers expose Open task or the admin's Open project action; existing chronological date separators and local AM/PM times remain.

Supported filters are All, Unread, Project Chats and Task Chats. Search includes client, project, title, sender and preview. There is no message-assignment/sent-folder model supporting the reference's other tabs, so none were invented. The existing Project Chat selector and project:<id> deep links remain. Clients have no new admin actions or project-management links. No new private-message or visibility controls were added.

Messages use safe React text rendering, preserved newlines, wrapping and explicitly detected HTTP(S) links with noopener/noreferrer. The textarea uses Enter for a newline and Ctrl/Command+Enter to send; pending/error handling is unchanged. No new queries, polling or Realtime subscriptions were introduced.

Browser testing found that connection and demo/configuration banners can change the page's top position. A ResizeObserver now measures the available viewport below the actual page top and above visible mobile navigation, rather than assuming a fixed header height. Visual viewport resizing is observed for keyboard changes. The observer is cleaned up on unmount. Composer/history are separate nonshrinking/shrinking flex regions.

## Template import

Removed Imported Status label, selector and its state. The UI explicitly submits initialStatus: 'active' through the unchanged authorized import endpoint. Template/step IDs and project ID are unchanged, and the existing RPC/assignment-email queue are still used. The server and SQL defaults remain draft for callers omitting initialStatus; manual task creation still saves a draft. Thus active is explicit for this import experience, not a global status-default change. No existing tasks or database enums were modified.

The demo import modal shows Template, Workflow to import, Cancel and Import workflow only. Submitting succeeds in demo mode. Actual persistent import behavior is covered with a mocked authorized RPC test; a live database import was deliberately not performed.

## Formatting diagnosis and lifecycle

Two concrete defects were found:

1. leadDetailsEditorValue replaced untouched template instructions with only an h2 heading. New typing could inherit that heading's bold presentation. It now produces an empty paragraph.
2. The sanitizer omitted b/i/div emitted by browser editing or paste. This could discard inline bold/italic and collapse paragraph boundaries. Plain text newlines also lacked HTML line-break conversion.

Normal paragraphs were not universally set to bold by CSS. Explicit existing headings/strong content can account for some all-bold records; there is no basis to declare those records accidental or silently remove that formatting. The exact production record in the screenshot remains unverified.

The existing small contenteditable editor is retained. It now sanitizes incoming/pasted content, avoids replacing the focused DOM on every keystroke, provides Normal text and Clear formatting, and displays the Bold toggle state. Normal text explicitly removes selected legacy heading wrappers, including Chromium's nested-paragraph edge case. No editing framework was added.

The shared sanitizer is used by editor input and existing server query/write boundaries. Browser b/i become strong/em, div becomes p, recognized bold spans become strong, plain text is escaped and line breaks become br/paragraphs. Only the existing small formatting vocabulary is allowed. Scripts, event handlers, styles, embedded resources, unsafe link protocols and protocol-relative URLs are rejected/removed. Allowed links receive safe target/rel attributes. Legitimate headings, lists and inline emphasis remain supported.

Template task create/update and project task create/update already called sanitizeTaskDescription; they still do. Template import still copies description data independently. Template/task read mapping sanitizes before the shared task-rich-text admin/client renderers display HTML. Existing explicit markup is not rewritten in storage. Assignment/notification email composition and message preview storage are unchanged.

## Changed files

- app/admin/messages/page.tsx and app/portal/messages/page.tsx — shared bounded page and screen-reader page heading.
- app/globals.css — Message Center sizing, themes, rows, composer, responsive layout and explicit normal/strong typography.
- components/messages-workspace.tsx — inbox hierarchy, supported filters, contextual actions, banner-aware sizing.
- lib/message-workspace.ts — pure search/category filtering.
- components/conversation.tsx and new components/message-body.tsx — multiline composer and safe text links.
- components/admin/tasks-client.tsx — remove import-status selector, explicitly import active.
- components/rich-text-editor.tsx — default/paste/selection/format controls.
- lib/lead-details-copy.ts — empty paragraph instead of heading-only editor default.
- new lib/rich-text.ts and lib/queries.ts — shared formatting-preserving sanitizer with the existing export contract.
- new tests/messages-import-formatting.test.ts and tests/template-import-active.test.ts — formatting, sanitization, filters, active import and authorization regressions.
- tests/invitation-branding-and-editor.test.ts, tests/messages-split-pane.test.ts and tests/template-workflow-scheduling.test.ts — update obsolete UI/default expectations only; invitation behavior unchanged.
- This report.

## Validation and screenshots

Full Vitest suite: 483 passed, 1 skipped (58 files: 57 passed, 1 skipped). Typecheck, ESLint and the Frankfurt standalone build passed. Build reports plugin timing warnings, not build failures. Initial sandbox test execution failed before loading tests due temporary-cache filesystem restrictions; the successful runs used the normal host execution environment.

Browser evidence is in work/messages-ui (local review artifacts, not release source):

| View | Width × height | Measured composer bottom | Result |
| --- | --- | --- | --- |
| Admin desktop | 1920 × 1080 | 1080 | Fits; inbox 460px |
| Admin laptop | 1440 × 900 | 900 | Fits; inbox 403px |
| Admin laptop | 1366 × 768 | 768 | Fits; inbox 383px |
| Admin tablet | 768 × 1024 | 960 | Above 64px navigation |
| Admin mobile | 390 × 844 | 780 | Above 64px navigation |

No horizontal overflow in these measurements. Tiny subpixel rounding was below 0.001px. Verified dark mode, project filtering plus name search, project thread selection/deep link, multiline synthetic send and exact safe link URL, mobile Back to conversations, client desktop/mobile empty states, simplified import and synthetic submission. Rendered demo lead paragraphs measured weight 400 and strong labels 700.

Screenshots: admin-1920.png, admin-1440.png, admin-1366.png, admin-768.png, admin-dark.png, admin-mobile.png, admin-mobile-inbox.png, client-mobile-empty.png, client-desktop-empty.png, import-modal.png, lead-rendered.png and lead-editor.png in ../work/messages-ui/.

The final build additionally disables document scrolling on Messages only, leaving inbox/history scrolling independent. Final screenshots are admin-final.png and admin-mobile-final.png. The rebuilt desktop composer bottom was 900px in a 900px viewport; mobile was 780px exactly above navigation in an 844px viewport, with document width 390px matching the viewport. Normal text reset was retested successfully; subsequent typing produced `<p>Normal note<b>&nbsp;bold phrase</b>&nbsp;normal again</p>`, without an enclosing heading. The server sanitizer converts that b to strong on persistence. The local server is left running in explicitly synthetic demo mode for review, not connected to production data.

## Limits and review follow-up

- Existing demo fixtures return no client inbox threads. Client empty-state/layout is verified; populated client messaging has shared component/unit coverage but was not authenticated against production.
- Demo mode has no working Supabase Realtime connection and displays the reconnect banner. Existing Realtime/read-receipt/cache/isolation tests passed; no new live provider event or actual unread receipt mutation is claimed.
- Demo saves do not persist. Sanitizer round-trip tests cover safe formatting on save/read, and the browser covers editing/rendering; a database save-and-refresh remains a staging/manual acceptance check.
- Test data has few rows. Height measurements include banners; large-history pagination and cache behavior rely on the existing passing regression suite, not a new live 500-message browser test.
- Physical mobile keyboard behavior was not tested on a phone; browser mobile viewport was tested.
- No new backend message editing/deletion/visibility features were introduced.

Before any eventual deployment, review the local diff and perform a permitted staging account check for persistent formatting, populated client threads and incoming Realtime/unread reconciliation. Production remains unchanged.
