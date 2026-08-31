export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export function formatDate(value: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  try {
    return new Intl.DateTimeFormat('en', options || { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  } catch {
    return 'Not set';
  }
}

export function formatTime(value: string) {
  return formatDate(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
