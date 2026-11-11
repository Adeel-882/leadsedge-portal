# Auto-expanding message composer

The shared admin/client Conversation textarea previously had two rows, a 68px
minimum and 140px maximum, but no content-height measurement. Typing therefore
scrolled inside the initial height rather than growing the composer.

## Changes

- `components/message-input.tsx`: measure scrollHeight plus borders before paint;
  reset height before measuring to support shrink; account for padding, line
  height, wrapping, fonts, pane size and visual viewport resize. Clean up observers
  and listeners when the conversation changes.
- `lib/message-input-size.ts`: cap desktop height at 280px and mobile/tablet at
  38% of the visual viewport. Reduce the cap further in short panes to preserve
  message history. Scroll internally only after reaching the cap.
- `components/conversation.tsx`: use the shared input with existing controlled
  value, delivery, multiline and Ctrl/Command+Enter handlers unchanged.
- `app/globals.css`: compact 48px minimum, border-box sizing, no manual resize.
- `components/messages-workspace.tsx`: use the page's document position when
  fitting its height, preventing focus-induced document scrolling from being
  mistaken for extra room beneath fixed mobile navigation.
- `tests/message-input-size.test.ts`: growth, reset, wrapping, long content,
  responsive limits and short-viewport history space.

No messaging queries, subscriptions, unread state, authorization, delivery,
authentication, notifications or email code changed. No dependencies added.

## Validation

Local standalone demo, with temporary synthetic records and no real sends:
empty/one line approximately 50px; three lines 98px; ten lines 266px; long
pasted content capped at 280px on desktop. Deletion, successful send and changing
threads return the input to its compact height. Enter retains a newline and
Ctrl+Enter sends using the existing handler.

Browser checks cover 1920, 1440, 1366, 768 and 390px widths, light/dark themes,
and a shortened mobile viewport. This is browser viewport simulation, not a
physical mobile keyboard test. Client demo has zero threads; client functionality
uses the same Conversation/MessageInput implementation, but no live client send
was performed.

Full suite: 506 passed, 1 skipped. Typecheck, lint and Frankfurt standalone build
passed. Nothing pushed or deployed.
