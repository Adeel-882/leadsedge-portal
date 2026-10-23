import { describe, expect, it } from 'vitest';
import { sanitizeTaskDescription } from '@/lib/rich-text';
import { leadDetailsEditorValue } from '@/lib/lead-details-copy';
import { filterMessageThreads, emptyAdminProjectThread } from '@/lib/message-workspace';
import { demoProjects } from '@/lib/demo-data';
import { readFileSync } from 'node:fs';

describe('lead rich text persistence', () => {
  it('preserves plain paragraphs, line breaks and literal characters without making them bold', () => {
    expect(sanitizeTaskDescription('Name: Example\nCity: Alva\n\nNotes & plans < 500')).toBe('<p>Name: Example<br />City: Alva</p><p>Notes &amp; plans &lt; 500</p>');
  });
  it('preserves browser bold, mixed formatting and block breaks through repeated saves/reads', () => {
    const stored = sanitizeTaskDescription('<div><b>Name:</b> Example</div><div>Normal <span style="font-weight: 700">selected phrase</span> notes.</div><p><i>Next line</i><br>End</p>');
    expect(stored).toBe('<p><strong>Name:</strong> Example</p><p>Normal <strong>selected phrase</strong> notes.</p><p><em>Next line</em><br />End</p>');
    expect(sanitizeTaskDescription(stored)).toBe(stored);
  });
  it('retains deliberate legacy headings and strong text', () => {
    const text='<h2>Legacy heading</h2><p><strong>Bold</strong> normal</p>';
    expect(sanitizeTaskDescription(text)).toBe(text);
    expect(leadDetailsEditorValue(text)).toBe(text);
  });
  it('starts an untouched stock instruction in a normal paragraph, without changing custom content', () => {
    expect(leadDetailsEditorValue('<h2>Lead details</h2><p>Add the lead information here before activating this task.</p>')).toBe('<p><br></p>');
  });
  it('removes scripts, event handlers, embedded resources, styles and unsafe links', () => {
    const clean=sanitizeTaskDescription('<script>alert(1)</script><img src=x onerror=alert(1)><p onclick="alert(1)">Safe</p><a href="javascript:alert(1)">bad</a><span style="background:url(javascript:alert(1))">text</span>');
    expect(clean).not.toMatch(/script|img|onerror|onclick|style=|javascript:/i);
    expect(clean).toContain('<p>Safe</p>');
    expect(sanitizeTaskDescription('<a href="https://example.com/?a=1&amp;b=2">Link</a>')).toContain('href="https://example.com/?a=1&amp;b=2"');
  });
});
describe('supported inbox filters', () => {
  const project={...emptyAdminProjectThread(demoProjects[0]),clientName:'Example Client',unreadCount:2};
  const task={...project,key:'task:one',kind:'task' as const,title:'Follow up',unreadCount:0};
  it('combines search with all, unread, project and task filters without changing the inventory', () => {
    const threads=[project,task];
    expect(filterMessageThreads(threads,'example','all')).toEqual(threads);
    expect(filterMessageThreads(threads,'','unread')).toEqual([project]);
    expect(filterMessageThreads(threads,'','project')).toEqual([project]);
    expect(filterMessageThreads(threads,'FOLLOW','task')).toEqual([task]);
    expect(filterMessageThreads(threads,'unknown','all')).toEqual([]);
    expect(threads[0].unreadCount).toBe(2);
  });
  it('reflects newly unread threads and read acknowledgements using the supplied inventory only', () => {
    expect(filterMessageThreads([{...task,unreadCount:1}],'','unread')).toHaveLength(1);
    expect(filterMessageThreads([{...project,unreadCount:0}],'','unread')).toHaveLength(0);
    expect(filterMessageThreads([],'','all')).toEqual([]);
  });
});
it('removes the imported status control and explicitly submits active without changing task creation defaults', () => {
  const source=readFileSync('components/admin/tasks-client.tsx','utf8');
  expect(source).not.toContain('Imported status');expect(source).not.toContain('setInitialStatus');
  expect(source).toContain("templateTaskIds: selectedTaskIds, initialStatus: 'active'");
  expect(source).toContain("status: 'draft'");
});
