'use client';

import { useEffect, useRef, useState } from 'react';
import { LinkSimple, ListBullets, ListNumbers, TextB, TextH, TextItalic } from '@phosphor-icons/react';
import { sanitizeTaskDescription } from '@/lib/rich-text';

export function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editor = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  const [bold, setBold] = useState(false);
  useEffect(() => {
    // Do not replace the focused document on each keystroke: that loses the selection.
    if (editor.current && value !== emitted.current) editor.current.innerHTML = sanitizeTaskDescription(value);
  }, [value]);
  function changed() {
    emitted.current = editor.current?.innerHTML || '';
    onChange(emitted.current);
    setBold(document.queryCommandState('bold'));
  }
  function command(name: string, argument?: string) {
    editor.current?.focus();
    if (name === 'formatBlock' && argument === 'p') {
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      // Pasted blocks can sit inside a legacy heading. formatBlock alone leaves
      // that ancestor in Chromium, so explicitly remove selected heading wrappers.
      for (const heading of Array.from(editor.current?.querySelectorAll('h2, h3') || [])) {
        if (!range?.intersectsNode(heading)) continue;
        if (heading.querySelector('p, div')) heading.replaceWith(...heading.childNodes);
        else {
          const paragraph = document.createElement('p');
          paragraph.append(...heading.childNodes);
          heading.replaceWith(paragraph);
        }
      }
    }
    document.execCommand(name, false, argument);
    changed();
  }
  return <div className="rich-text-editor overflow-hidden rounded-lg border border-line-strong focus-within:border-brand focus-within:ring-4 focus-within:ring-focus">
    <div role="toolbar" aria-label="Lead details formatting" className="flex flex-wrap gap-1 border-b border-line bg-surface-subtle p-2" onMouseDown={event => event.preventDefault()}>
      <button type="button" className="button-ghost h-8 px-2" onClick={() => command('formatBlock', 'p')}>Normal text</button>
      <button type="button" aria-label="Heading" title="Heading" className="button-ghost h-8 px-2" onClick={() => command('formatBlock', 'h2')}><TextH size={16} aria-hidden /></button>
      <button type="button" aria-label="Bold" aria-pressed={bold} title="Bold" className="button-ghost h-8 px-2" onClick={() => command('bold')}><TextB size={16} weight="bold" aria-hidden /></button>
      <button type="button" aria-label="Italic" title="Italic" className="button-ghost h-8 px-2" onClick={() => command('italic')}><TextItalic size={16} aria-hidden /></button>
      <button type="button" aria-label="Bulleted list" className="button-ghost h-8 px-2" onClick={() => command('insertUnorderedList')}><ListBullets size={16} aria-hidden /></button>
      <button type="button" aria-label="Numbered list" className="button-ghost h-8 px-2" onClick={() => command('insertOrderedList')}><ListNumbers size={16} aria-hidden /></button>
      <button type="button" aria-label="Insert link" className="button-ghost h-8 px-2" onClick={() => { const url = window.prompt('Link URL'); if (url && /^(https?:|mailto:|tel:)/i.test(url.trim())) command('createLink', url.trim()); }}><LinkSimple size={16} aria-hidden /></button>
      <button type="button" className="button-ghost h-8 px-2" onClick={() => command('removeFormat')}>Clear formatting</button>
    </div>
    <div ref={editor} contentEditable suppressContentEditableWarning role="textbox" aria-label="Lead details" aria-multiline="true" className="task-rich-text min-h-48 p-4 outline-none" onInput={changed} onKeyUp={() => setBold(document.queryCommandState('bold'))} onMouseUp={() => setBold(document.queryCommandState('bold'))} onPaste={event => {
      event.preventDefault();
      command('insertHTML', sanitizeTaskDescription(event.clipboardData.getData('text/html') || event.clipboardData.getData('text/plain')));
    }} />
  </div>;
}
