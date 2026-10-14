# Provider draft checkpoint — 2026-10-15

Seven drafts created in the signed-in broadigo workspace. No publish or send action, no environment activation, no Frankfurt/Hostinger changes. Actual IDs and aliases are in provider-drafts.json. Subjects match manifest values entered in the editor. Variables were automatically declared during HTML import; CLIENT_NAME was inspected and confirmed String with no fallback. Full per-variable type inspection remains outstanding.

| Name | Provider ID | Actual alias | Required variables |
|---|---|---|---|
| Client Invitation | 94112e04-e5d4-4092-8d62-ac588932e1f5 | client-invitation | CLIENT_NAME, ACTION_URL |
| New Lead Assigned | 5bcdfc33-76bf-4ca9-aef7-736c6142cde9 | new-lead-assigned | CLIENT_NAME, TASK_TITLE, ACTION_URL |
| Feedback Requested | 6bbd86c6-bd54-4aa0-b027-ba2370ea2356 | feedback-requested | CLIENT_NAME, TASK_TITLE, PROJECT_NAME, ACTION_URL |
| Feedback Submitted | 9f622ee2-3d2e-48a1-b469-b0a01d85e884 | feedback-submitted | CLIENT_NAME, TASK_TITLE, PROJECT_NAME, ACTION_URL |
| Meeting Confirmation | 84d6d2dc-9f24-4810-9dba-8ac1ac404134 | meeting-confirmation | MEETING_TITLE, START_DISPLAY, TIMEZONE, ACTION_URL |
| Meeting Cancellation | 7290bdda-65af-47e4-9a40-dda065545048 | meeting-cancellation | MEETING_TITLE, START_DISPLAY, TIMEZONE, ACTION_URL |
| Meeting Reminder | 4837f003-6e1d-4e3b-9676-048c935857b2 | meeting-reminder | MEETING_TITLE, START_DISPLAY, TIMEZONE, ACTION_URL |

## Differences and corrections

Dashboard aliases are generated from names. Requested aliases such as leadsedge-task-assigned are NOT provisioned. No independent alias control was found. Keep current names; use IDs after explicit approval or correct aliases through authorized API access. Existing local API credential was rejected in the previous readiness check; it was not changed.

HTML import converts source to editor blocks. Provider-generated HTML for New Lead Assigned dropped the CTA table cell bgcolor attribute, leaving no red button background. All seven local source and synthetic preview files now add explicit background-color:#FF4134 to the CTA cell and anchor. The corrected task-assigned body was re-imported into its existing draft. A fresh editor load visibly showed the complete body and red button. However the separate detail preview returned empty HTML content after the update; it disagrees with the editor. Do not treat this draft as validated. The other six provider drafts still need the corrected HTML imported and verified. No aliases, subjects, variables, URLs, auth or application logic were changed by this correction.

## Provider-preview limits

Detail previews displayed variable placeholders literally. The editor's Test email option required a From field and did not provide a non-sending rendered preview in the inspected state. No From value, recipient, or test send was supplied. Actual substitution, ACTION_URL double-escaping, unsafe text escaping, exact resolved deep-link destinations, long-name layout and mobile overflow remain UNVERIFIED. Do not substitute local string replacement for provider rendering evidence. No real credentials were used in any preview. The task CTA remains ACTION_URL and the application still generates ordinary authenticated task deep links.

Repeated browser focus/runtime timeouts prevented reliable remaining edits. Retrying in a fresh tab recovered the editor display but not a consistent detail preview. The draft editor was left open for follow-up. Screenshots: work/resend-drafts-provider.jpg (all draft statuses in table), work/resend-task-assigned-editor.jpg (red button in editor). These do not prove send-time rendering.

## Next steps before sending or deploying

1. Resolve editor/detail preview consistency and finish all six remaining provider CTA corrections.
2. Verify all variable types and exact desired aliases; inspect rendered output with synthetic data only. If provider requires an actual test send, obtain separate approval and a disposable inbox first.
3. New Lead Assigned remains first target, but no category is cleared for real email testing yet. Do not publish/activate. Meeting activation additionally remains blocked on destination review.
4. Verify production SHA, preserve deployment backup, apply only email integration patch to an isolated baseline, rerun checks, exclude committed Multi-Admin code and its migration. No schema change required. Do not deploy the whole current checkout.
