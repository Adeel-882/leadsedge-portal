import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { messageTimeline } from '../lib/message-time';
import { useMessageClock } from '../components/use-message-clock';
import { appendMessage, flattenMessages, removeMessage, type MessagePages } from '../lib/message-cache';
import type { ConversationMessage } from '../lib/types';

const message = (id: string, createdAt: string): ConversationMessage => ({ id, createdAt, senderId: 'viewer', senderName: 'Viewer', senderRole: 'client', body: 'Hello', attachmentUrl: null });
describe('viewer-local message chronology', () => {
  it('formats Today, Yesterday, recent weekdays and full older dates with 12-hour times', () => {
    const rows = messageTimeline([
      message('1', '2026-10-01T08:42:00Z'), message('2', '2026-10-05T08:42:00Z'),
      message('3', '2026-10-08T08:42:00Z'), message('4', '2026-10-09T08:42:00Z'),
    ], 'UTC', new Date('2026-10-09T14:00:00Z'));
    expect(rows.map(row => row.day)).toEqual(['October 1, 2026', 'Monday', 'Yesterday', 'Today']);
    expect(rows.map(row => row.time)).toEqual(Array(4).fill('8:42 AM'));
  });
  it('uses local midnight rather than the UTC date', () => {
    const rows = messageTimeline([message('1', '2026-10-08T18:59:00Z'), message('2', '2026-10-08T19:01:00Z')], 'Asia/Karachi', new Date('2026-10-08T20:00:00Z'));
    expect(rows.map(row => [row.day, row.time])).toEqual([['Yesterday', '11:59 PM'], ['Today', '12:01 AM']]);
  });
  it.each([
    ['2026-03-08T05:30:00Z', '2026-03-09T04:15:00Z'], // 23-hour day
    ['2026-11-01T04:30:00Z', '2026-11-02T05:15:00Z'], // 25-hour day
  ])('handles DST calendar boundaries for %s', (createdAt, now) => {
    expect(messageTimeline([message('1', createdAt)], 'America/New_York', new Date(now))[0].day).toBe('Yesterday');
  });
  it('merges same-day separators across paginated history', () => {
    const data: MessagePages = { pages: [
      { messages: [message('3', '2026-10-09T12:00:00Z')], hasMore: true },
      { messages: [message('1', '2026-10-08T12:00:00Z'), message('2', '2026-10-09T10:00:00Z')], hasMore: false },
    ], pageParams: [null, 'cursor'] };
    expect(messageTimeline(flattenMessages(data), 'UTC', new Date('2026-10-09T15:00:00Z')).map(row => row.day)).toEqual(['Yesterday', 'Today', null]);
  });
  it('deduplicates delivered/optimistic messages and displays the server timestamp', () => {
    let data = appendMessage(undefined, message('pending-1', '2026-10-09T15:01:00Z'));
    expect(messageTimeline(flattenMessages(data), 'UTC', new Date('2026-10-09T16:00:00Z'))[0].time).toBe('Sending…');
    const authoritative = message('server-1', '2026-10-09T15:00:00Z');
    data = appendMessage(data, authoritative); // realtime arrives before response
    data = appendMessage(removeMessage(data, 'pending-1'), authoritative);
    const rows = messageTimeline(flattenMessages(data), 'UTC', new Date('2026-10-09T16:00:00Z'));
    expect(rows).toHaveLength(1);
    expect(rows[0].time).toBe('3:00 PM');
  });
  it('retains the existing 500-message limit', () => {
    let data: MessagePages | undefined;
    for (let i = 0; i < 510; i++) data = appendMessage(data, message(String(i), new Date(Date.UTC(2026, 9, 9, 0, i)).toISOString()));
    expect(flattenMessages(data)).toHaveLength(500);
    expect(messageTimeline(flattenMessages(data), 'UTC', new Date('2026-10-09T16:00:00Z')).filter(row => row.day)).toHaveLength(1);
  });
  it('omits browser-local information during server render and initial hydration', () => {
    function Clock() { return createElement('span', null, useMessageClock() ?? 'pending'); }
    expect(renderToString(createElement(Clock))).toBe('<span>pending</span>');
  });
});
