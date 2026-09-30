import type { ConversationMessage } from './types';
export type MessagePage = { messages: ConversationMessage[]; hasMore: boolean; gap?: {before:string;until:string} };
export type MessagePages = { pages: MessagePage[]; pageParams: unknown[] };
export const MAX_MESSAGE_PAGES = 10;
export function appendMessage(data: MessagePages | undefined, message: ConversationMessage): MessagePages {
  const current = data || { pages: [{ messages: [], hasMore: false }], pageParams: [null] };
  const all = [...flattenMessages(current).filter(item => item.id !== message.id), message].sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  const bounded = all.slice(-50 * MAX_MESSAGE_PAGES);
  const pages: MessagePage[] = [];
  for (let end = bounded.length; end > 0; end -= 50) {
    pages.push({ messages: bounded.slice(Math.max(0, end - 50), end), hasMore: end > 50 || all.length > bounded.length || Boolean(current.pages.at(-1)?.hasMore) });
  }
  const gap = current.pages[0]?.gap;
  if (gap && pages.length && !(bounded.length===500 && bounded.every(item=>item.createdAt>gap.until))) pages[0].gap=gap;
  return { pages, pageParams: pages.map((_page, index) => index === 0 ? null : pages[index - 1].messages[0]?.createdAt) };
}
// Reconnect fetches only the newest page and keeps retained older data and pending sends.
export function mergeNewest(data: MessagePages | undefined, newest: MessagePage) {
  const previousNewest = flattenMessages(data).filter(message=>!message.id.startsWith('pending-')).at(-1);
  let merged = data;
  for (const message of newest.messages) merged = appendMessage(merged, message);
  if (!merged) return {pages:[newest],pageParams:[null]};
  const pages=merged.pages.map((page,index)=>index===merged.pages.length-1?{...page,hasMore:page.hasMore || newest.hasMore}:page);
  // More than one page may have arrived while disconnected. Keep cached earlier
  // pages, but make the missing interval explicitly loadable before older history.
  if(previousNewest && newest.hasMore && newest.messages[0]?.createdAt>previousNewest.createdAt) pages[0]={...pages[0],gap:{before:newest.messages[0].createdAt,until:previousNewest.createdAt}};
  return {...merged,pages};
}
export function mergeGap(data: MessagePages, page: MessagePage): MessagePages {
  const gap=data.pages[0]?.gap;
  let merged=data;
  for(const message of page.messages) merged=appendMessage(merged,message);
  const pages:MessagePage[]=merged.pages.map(page=>{const item={...page};delete item.gap;return item;});
  if(gap && page.hasMore && page.messages[0]?.createdAt>gap.until) pages[0]={...pages[0],gap:{before:page.messages[0].createdAt,until:gap.until}} as MessagePage;
  return {...merged,pages};
}
export function removeMessage(data: MessagePages | undefined, id: string) {
  return data && { ...data, pages: data.pages.map(page=>({...page,messages:page.messages.filter(item=>item.id!==id)})) };
}
export function flattenMessages(data?: MessagePages) {
  const unique = new Map<string, ConversationMessage>();
  for (const page of [...(data?.pages || [])].reverse()) for(const message of page.messages) unique.set(message.id,message);
  return [...unique.values()];
}
