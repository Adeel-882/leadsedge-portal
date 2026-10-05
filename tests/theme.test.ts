import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { getTheme, parseTheme, setTheme, subscribeTheme, themeBootstrap, THEME_KEY } from '../lib/theme';

afterEach(() => vi.unstubAllGlobals());
describe('browser theme preference', () => {
  it.each(['dark', 'light', null, 'invalid'])('initializes before paint from %s', stored => {
    const document = { documentElement: { dataset: {} as Record<string, string> } };
    runInNewContext(themeBootstrap, { document, localStorage: { getItem: () => stored } });
    expect(document.documentElement.dataset.theme).toBe(parseTheme(stored));
  });
  it('defaults to light when storage is blocked', () => {
    const document = { documentElement: { dataset: {} as Record<string, string> } };
    runInNewContext(themeBootstrap, { document, localStorage: { getItem: () => { throw Error(); } } });
    expect(document.documentElement.dataset.theme).toBe('light');
  });
  it('switches instantly, persists, notifies both headers, and cleans up', () => {
    const target = new EventTarget();
    const storage = { setItem: vi.fn() };
    vi.stubGlobal('window', target);
    vi.stubGlobal('document', { documentElement: { dataset: { theme: 'light' } } });
    vi.stubGlobal('localStorage', storage);
    const notify = vi.fn(); const unsubscribe = subscribeTheme(notify);
    setTheme('dark');
    expect(getTheme()).toBe('dark');
    expect(storage.setItem).toHaveBeenCalledWith(THEME_KEY, 'dark');
    expect(notify).toHaveBeenCalledTimes(1);
    unsubscribe(); setTheme('light'); expect(notify).toHaveBeenCalledTimes(1);
  });
  it('still switches with unavailable storage and synchronizes another tab', () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    vi.stubGlobal('document', { documentElement: { dataset: { theme: 'light' } } });
    vi.stubGlobal('localStorage', { setItem: () => { throw Error(); } });
    const unsubscribe = subscribeTheme(vi.fn()); setTheme('dark'); expect(getTheme()).toBe('dark');
    const event = Object.assign(new Event('storage'), { key: THEME_KEY, newValue: 'light' });
    target.dispatchEvent(event); expect(getTheme()).toBe('light'); unsubscribe();
  });
});

const css = readFileSync('app/globals.css', 'utf8');
const palette = (selector: string) => Object.fromEntries([...css.slice(css.indexOf(selector)).split('}')[0].matchAll(/--([\w-]+):\s*(#[\da-f]{6});/g)].map(m => [m[1], m[2]]));
function luminance(hex: string) { const c = hex.slice(1).match(/../g)!.map(x => parseInt(x,16)/255).map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4); return c[0]*.2126+c[1]*.7152+c[2]*.0722; }
function contrast(a: string,b: string) { const l=[luminance(a),luminance(b)].sort((a,b)=>b-a); return (l[0]+.05)/(l[1]+.05); }
describe('theme text contrast', () => {
  const light = palette(':root {');
  for (const [name,p] of Object.entries({light,dark:{...light,...palette(':root[data-theme="dark"]')}})) {
    it(`${name} has readable body, muted, brand and semantic text`, () => {
      for (const [fg,bg] of [['ink','canvas'],['muted','surface'],['brand-text','brand-soft'],['brand-foreground','brand'],['brand-foreground','brand-hover'],['danger','danger-soft'],['success','success-soft'],['warning','warning-soft'],['info','info-soft']]) expect(contrast(p[fg],p[bg]),`${name}: ${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
    });
  }
});
