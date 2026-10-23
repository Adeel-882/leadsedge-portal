import sanitizeHtml from 'sanitize-html';

export const DEFAULT_LEAD_DETAILS = '<p>Lead Detail</p>';
const stock = /^\s*<h2>Lead details<\/h2>\s*<p>Add the lead information here before activating this task\.?<\/p>\s*$/i;

function textContent(description: string) {
  return sanitizeHtml(description, { allowedTags: [], allowedAttributes: {} })
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code: string) => {
      const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/&nbsp;|&ZeroWidthSpace;/gi, ' ').replace(/&amp;/g, '&')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '').trim();
}

/** Apply only to newly imported drafts, never when reopening or clearing an editor. */
export function initialLeadDetails(description: string) {
  return !textContent(description) || stock.test(description) ? DEFAULT_LEAD_DETAILS : description;
}

/** Existing descriptions are editable as stored, including intentionally cleared drafts. */
export function leadDetailsEditorValue(description: string) { return description; }

export function hasMeaningfulLeadDetails(description: string) {
  const text = textContent(description).replace(/\s+/g, ' ').trim();
  return /[\p{L}\p{N}]/u.test(text) && !/^lead details?[.!:]?$/i.test(text)
    && !/^lead details?\s*add the lead information here before activating this task\.?$/i.test(text)
    && !/^add the lead information here before activating this task\.?$/i.test(text);
}

export function isLeadAssignmentTemplate(value: unknown): boolean {
  const one = (item: unknown): Record<string, unknown> | undefined => {
    const result = Array.isArray(item) ? item[0] : item;
    return result && typeof result === 'object' ? result as Record<string, unknown> : undefined;
  };
  return one(one(value)?.template)?.name === 'Lead Assignment';
}
