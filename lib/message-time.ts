type TimedMessage = { id: string; createdAt: string };

/** Calendar arithmetic uses local date parts, never elapsed 24-hour periods (DST). */
export function messageTimeline<T extends TimedMessage>(messages: T[], timeZone: string, now: Date) {
  const dateParts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true });
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' });
  const fullDate = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'long', day: 'numeric' });
  const calendar = (date: Date) => {
    const parts = Object.fromEntries(dateParts.formatToParts(date).map(part => [part.type, part.value]));
    const key = `${parts.year}-${parts.month}-${parts.day}`;
    return { key, ordinal: Date.UTC(+parts.year, +parts.month - 1, +parts.day) / 86_400_000 };
  };
  const today = calendar(now).ordinal;
  let previousDay = '';
  return messages.map(message => {
    const date = new Date(message.createdAt);
    if (!Number.isFinite(date.getTime())) return { message, time: 'Time unavailable', day: null, dayKey: null };
    const { key, ordinal } = calendar(date);
    const difference = today - ordinal;
    const label = difference === 0 ? 'Today' : difference === 1 ? 'Yesterday' : difference > 1 && difference < 7 ? weekday.format(date) : fullDate.format(date);
    const day = key === previousDay ? null : label;
    previousDay = key;
    return { message, time: message.id.startsWith('pending-') ? 'Sending…' : time.format(date), day, dayKey: key };
  });
}
