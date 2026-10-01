import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const css=readFileSync('app/globals.css','utf8');
const desktop=css.slice(css.indexOf('@media (min-width: 768px)'));
const conversation=readFileSync('components/conversation.tsx','utf8');
it('bounds the desktop grid row independently of rail content',()=>{
 expect(desktop).toContain('grid-template-rows: minmax(0, 1fr)');
 expect(desktop).toContain('.messages-rail, .messages-pane { min-height: 0; }');
 expect(desktop).not.toContain('min-height: 540px');
});
it('fits admin Messages below the shell header with a nonshrinking heading',()=>{
 expect(readFileSync('app/admin/messages/page.tsx','utf8')).toContain('page-wrap messages-page');
 expect(desktop).toContain('height: calc(100dvh - var(--topbar-height))');
 expect(desktop).toContain('.messages-page-heading { flex-shrink: 0; }');
 expect(desktop).toContain('.messages-page > .messages-workspace { flex: 1; height: auto; min-height: 0; }');
});
it('keeps both scroll regions bounded and the composer outside history',()=>{
 expect(css).toMatch(/\.messages-thread-list\s*\{[^}]*overflow-y: auto/);
 expect(css).toMatch(/\.message-list\s*\{[^}]*overflow-y: auto/);
 expect(desktop).toContain('.messages-pane-body .message-list { min-height: 0; }');
 expect(desktop).toContain('.messages-pane-body .message-composer { flex-shrink: 0; }');
 expect(conversation).toContain('</div><form className="message-composer"');
});
it('retains mobile list/detail switching and existing paginated conversation behavior',()=>{
 expect(css).toContain('.mobile-conversation-open .messages-rail { display: none; }');
 expect(css).toContain('.mobile-conversation-open .messages-pane { display: flex; }');
 expect(conversation).toContain('Load earlier messages');
 expect(conversation).toContain('useInfiniteQuery');
});
