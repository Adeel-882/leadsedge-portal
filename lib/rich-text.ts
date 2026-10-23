import sanitizeHtml from 'sanitize-html';

/** Shared by the editor and server read/write boundaries. Never allow style or event attributes. */
export function sanitizeTaskDescription(value: string) {
  const html = /<\/?[a-z][\s\S]*?>/i.test(value)
    ? value
    : value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').split(/\r?\n\r?\n/).map(p => `<p>${p.replace(/\r?\n/g, '<br>')}</p>`).join('');
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'h2', 'h3', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: {
      b: 'strong', i: 'em', div: 'p',
      // Some browsers/clipboard producers express inline bold as a span style.
      span: (_tag, attrs) => ({ tagName: /(?:^|;)\s*font-weight\s*:\s*(?:bold|[6-9]00)\s*(?:;|$)/i.test(attrs.style || '') ? 'strong' : 'span', attribs: {} }),
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}
