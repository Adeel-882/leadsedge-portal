export type Theme = 'light' | 'dark';
export const THEME_KEY = 'leadsedge-theme';
export const THEME_EVENT = 'leadsedge-theme-change';
export function parseTheme(value: unknown): Theme { return value === 'dark' ? 'dark' : 'light'; }

// Runs before body paint. Storage can be unavailable in private/restricted browsers.
export const themeBootstrap = `(()=>{let t='light';try{t=localStorage.getItem('${THEME_KEY}')==='dark'?'dark':'light'}catch{}document.documentElement.dataset.theme=t})()`;

export function getTheme(): Theme { return parseTheme(document.documentElement.dataset.theme); }
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* Still works for this page. */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}
export function subscribeTheme(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) {
      document.documentElement.dataset.theme = parseTheme(event.newValue);
      notify();
    }
  };
  window.addEventListener(THEME_EVENT, notify);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(THEME_EVENT, notify); window.removeEventListener('storage', onStorage); };
}
