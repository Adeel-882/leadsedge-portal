export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export function formatDate(value: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', options || { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
