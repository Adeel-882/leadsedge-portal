# Admin Messages composer layout

## Diagnosis

The desktop `.messages-workspace` grid had a bounded outer height but an implicit `auto` row. Its two grid children, `.messages-rail` and `.messages-pane`, had `height: 100%` without `min-height: 0`. The rail's intrinsic content could therefore enlarge the grid row beyond the outer workspace, whose `overflow: hidden` clipped the conversation/composer. Filtering the rail reduced its content contribution and brought the composer back into view. This source-level mechanism matches the supplied screenshots. The old build's geometry could not be captured because local browser navigation initially failed; the rebuilt app was subsequently validated successfully.

The former 540px desktop minimum and guessed viewport subtraction also did not account for the actual page heading and wrapper padding.

## Changes

- `app/admin/messages/page.tsx`: add page and heading classes; no data or rendering logic changes.
- `app/globals.css`: use an explicit `minmax(0, 1fr)` grid row and allow both grid children to shrink. Make the admin Messages page a bounded flex column below the existing app header. Its workspace fills the space remaining after the actual heading and padding. Reserve the existing bottom navigation height on tablets.
- `tests/messages-layout.test.ts`: four structural regression checks for bounded layout, independent scrolling, composer placement, and preservation of existing mobile/pagination structure.

The thread list (`.messages-thread-list`) owns rail scrolling. The message list (`.message-list`) owns history scrolling. Rail header/search, conversation header, and composer do not shrink. The composer remains a sibling of history inside the conversation flex column; it is not a fixed browser overlay. Project and task conversations use this same layout. Search does not change the allocated grid height.

Phone rules below 768px remain unchanged, including list/detail switching. Shared desktop grid containment also applies to the client Messages workspace; the new viewport-filling page wrapper is admin-only.

## Scope preserved

No changes to authentication, authorization, schema, data, badges, email, infrastructure, API calls, queries, polling, realtime subscriptions, message pagination, or scroll-position logic. No messages or staging fixtures were created for this change.

## Validation

- Focused Messages/layout tests: 9 passed across 2 files.
- Full suite: 319 passed across 36 files.
- Typecheck: passed.
- Lint: passed.
- Diff whitespace check: passed.
- Clean `npm run build:frankfurt`: passed; generated standalone output.

The regression tests inspect source contracts; actual geometry was checked separately in the authenticated local browser after rebuilding. No new sign-in links or emails were needed.

| Scenario | Measured result |
| --- | --- |
| 1366×768, all 8 threads | Composer bottom 751.2px; document height 768px; rail content 626px within approximately 459px viewport |
| Search `zack`, then clear | Composer remains at exactly 751.2px in both cases |
| Switch project to long task thread | Composer remains at 751.2px; history scrolls independently |
| Load earlier (50 to 100 messages) | History content grows from 3667px to 7242px; composer remains at 751.2px; document remains 768px |
| 1920×1080, long task thread | Composer bottom 1063.2px; document height 1080px |
| 820×1180 tablet | Composer bottom 1099.2px; document height 1180px, leaving room for bottom navigation |
| 390×844 phone | Existing back-to-list and project-thread selection work; desktop constraints are not applied |

Phone limitation preserved: long histories in the existing stacked mobile layout grow the document and require page scrolling. This task does not redesign that behavior. The always-visible composer fix applies to the requested desktop/tablet split pane.

Screenshot: `work/messages-composer-fixed.png` (1366×768, unfiltered eight-thread rail).

Manual acceptance: at 1366×768 and 1920×1080, open Messages without filtering, search `zack`, clear the search, switch between project and task threads, and load earlier history. The composer should remain visible in the same position while each list scrolls independently. Repeat at tablet width and confirm existing phone list/detail navigation.
