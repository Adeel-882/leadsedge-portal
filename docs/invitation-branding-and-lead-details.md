# Invitation branding and Lead details editor

Validated October 5, 2026.

## Invitation

The canonical server sender is `sendPortalInvitation()` in `lib/email.ts`. Both project creation and the project invitation-resend endpoint call it. Its former HTML was generated inline in that function with a light background and teal button.

Replaced only this invitation's subject and HTML with the supplied table-based dark design. Subject is exactly **You're invited to LeadsEdge Portal**. The centered CTA is **View Your Portal**, background **#FF4134**. The escaped existing `clientName` and `actionLink` values replace the descriptive placeholders; no project name is used as product branding.

The existing Resend API key/from configuration, recipient, error handling, return contract, and sending path are unchanged. Other branded emails retain their existing design. Invitation routes, generation, expiry, one-time verification, and authentication are untouched.

The rendered token-free preview was visually checked: dark #070707 background, #111111 card, red branding and centered button, correct staging client name, security note, and footer. Artifact: `work/invitation-brand-preview.png`.

One actual browser resend was attempted for Frankfurt Test Client 1 through the existing admin action. The latest `email_deliveries` record reports **failed**, provider accepted **false**, error **API key is invalid** at 2026-10-05 20:52:46 Asia/Karachi. The UI displayed its existing delivery failure message. No credentials/configuration were changed and no repeated sends were attempted. Received-mail rendering and live CTA click-through remain unverified because the provider rejected the send. The preview and payload tests are not evidence of email delivery.

## Lead details editor

The sentence is not hardcoded editor helper text. Historical seed/migration definitions store it in template HTML:

```html
<h2>Lead details</h2><p>Add the lead information here before activating this task.</p>
```

Imports copy that description into project tasks. `TaskEditor` in `components/admin/task-editor.tsx` passes it to `RichTextEditor`.

Added `leadDetailsEditorValue()` in `lib/lead-details-copy.ts` and applied it only to the editor's displayed value. Only the complete untouched stock description is reduced to `<h2>Lead details</h2>`; custom content is returned unchanged. Original description state remains intact until the administrator edits the field. Opening the editor or saving unrelated fields does not silently clean database descriptions. The normal detail-page stored-description rendering is outside this editor-only change and remains unchanged.

Browser validation used the existing draft `1f0876a1-cc28-4f39-ba79-f71c7dfc87b3`: the rich-text editor showed Lead details without the instruction paragraph. Title, assignee, completion control, form fields, and 7-day delay remained present. No new task or database cleanup was needed. Artifact: `work/lead-details-editor-proof.png`.

## Validation and files

- Focused invitation/editor/product tests: 16 passed, 2 files.
- Full suite: 330 passed, 38 files.
- Typecheck: passed.
- Lint: passed.
- Clean `npm run build:frankfurt`: passed.
- Exactly one Frankfurt standalone Node listener remains on port 3000. Temporary email preview server closed.

Changed files: `lib/email.ts`, `lib/lead-details-copy.ts`, `components/admin/task-editor.tsx`, `tests/product-improvements.test.ts`, `tests/invitation-branding-and-editor.test.ts`, and this report.

No changes to auth, RLS, schema, Supabase email templates, realtime, import/title behavior, task scheduling/badges, SMTP, Hostinger, DNS, Seoul, or Tokyo. No deployment performed.
