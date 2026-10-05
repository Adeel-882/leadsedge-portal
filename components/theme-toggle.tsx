'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from '@phosphor-icons/react';
import { getTheme, setTheme, subscribeTheme } from '@/lib/theme';

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'light');
  const label = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  return <button type="button" className="icon-button theme-toggle" aria-label={label} title={label} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
    {theme === 'light' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
  </button>;
}
