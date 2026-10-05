// Suppress only the untouched stock template copy in the editor. Keep stored
// state intact until the administrator edits it; never strip custom lead data.
export function leadDetailsEditorValue(description: string) {
  return /^\s*<h2>Lead details<\/h2>\s*<p>Add the lead information here before activating this task\.?<\/p>\s*$/.test(description)
    ? '<h2>Lead details</h2>'
    : description;
}
