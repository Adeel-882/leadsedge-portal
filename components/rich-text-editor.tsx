'use client';

import { useEffect, useRef } from 'react';

export function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editor = useRef<HTMLDivElement>(null);
  useEffect(() => { if (editor.current && editor.current.innerHTML !== value) editor.current.innerHTML = value; }, [value]);
  function command(name: string, argument?: string) { document.execCommand(name, false, argument); editor.current?.focus(); onChange(editor.current?.innerHTML || ''); }
  return <div className="overflow-hidden rounded-xl border border-[#d8e0e9] focus-within:border-teal focus-within:ring-4 focus-within:ring-[#0d7c72]/10"><div className="flex flex-wrap gap-1 border-b border-line bg-[#f8fafc] p-2"><button type="button" className="rounded-lg px-3 py-2 text-xs font-bold hover:bg-white" onClick={() => command('formatBlock', 'h2')}>Heading</button><button type="button" className="rounded-lg px-3 py-2 text-sm font-bold hover:bg-white" onClick={() => command('bold')}>B</button><button type="button" className="rounded-lg px-3 py-2 text-sm italic hover:bg-white" onClick={() => command('italic')}>I</button><button type="button" className="rounded-lg px-3 py-2 text-xs hover:bg-white" onClick={() => command('insertUnorderedList')}>• List</button><button type="button" className="rounded-lg px-3 py-2 text-xs hover:bg-white" onClick={() => command('insertOrderedList')}>1. List</button><button type="button" className="rounded-lg px-3 py-2 text-xs hover:bg-white" onClick={() => { const url = window.prompt('Link URL'); if (url) command('createLink', url); }}>Link</button></div><div ref={editor} contentEditable suppressContentEditableWarning className="task-rich-text min-h-48 p-4 outline-none" onInput={(event) => onChange(event.currentTarget.innerHTML)} /></div>;
}
