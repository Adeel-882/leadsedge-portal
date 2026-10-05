# Proposed direct-RPC feedback validation — NOT APPLIED

The applied authorization migration deliberately leaves the workflow/input suffix unchanged. API limits do not constrain direct `submit_lead_feedback` callers. No table constraint or extra function change is applied by this proposal.

After the function's authorization/feedback-availability checks and before inserting a submission, propose the following validation. Return a generic `Invalid feedback response` exception without echoing input.

1. Require `jsonb_typeof(submitted_answers) = 'object'`.
2. Reject `octet_length(submitted_answers::text) > 524288`. This caps normalized JSONB representation, not the original HTTP wire size; document that distinction.
3. Reject more than 30 keys, or a key absent from `task_row.form_schema`. Use this imported task's copy, not the current reusable template.
4. For every non-checkbox field, require a JSON string and enforce at most 10,000 UTF-16 code units (match JavaScript's string limit; count supplementary Unicode characters as two). Keep existing required-field and radio/select membership validation.
5. For checkbox fields, require a JSON array. Enforce at most 20 elements and no more than the field's configured options. Require each item to be a string present in those options, with no duplicate choices. Require nonempty arrays for required fields.
6. Reject unknown field types rather than accepting arbitrary nested JSON.
7. Preserve the existing one-time submission, locking, inserts, feedback state, notifications, email outbox and return value exactly.

Before applying: measure existing form cardinality/options and verify historical workflow compatibility; test ASCII and Unicode boundaries, exact/over byte boundaries, missing/unknown keys, wrong types, checkbox duplicates, normal submissions and direct authenticated RPC calls. This needs review/approval as a separate function-only migration. No RLS or table/schema redesign is needed.
