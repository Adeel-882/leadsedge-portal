import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface LockedPackage { version?: string }

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')) as {
  packages: Record<string, LockedPackage>;
};

function atLeast(actual: string, minimum: string): boolean {
  const current = actual.split('.').map(Number);
  const floor = minimum.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (current[index] !== floor[index]) return current[index] > floor[index];
  }
  return true;
}

describe('critical Next.js security advisories', () => {
  it('locks every Next.js installation to a version patched for all three reported RCEs', () => {
    const nextVersions = Object.entries(lock.packages)
      .filter(([path]) => path.endsWith('/next'))
      .map(([, entry]) => entry.version);

    expect(nextVersions.length).toBeGreaterThan(0);
    for (const version of nextVersions) {
      expect(version).toBeDefined();
      expect(atLeast(version!, '16.4.1')).toBe(true);
    }
  });

  it('does not lock vulnerable sharp versions through any Next.js installation', () => {
    const sharpVersions = Object.entries(lock.packages)
      .filter(([path]) => path.endsWith('/sharp'))
      .map(([, entry]) => entry.version);

    expect(sharpVersions.length).toBeGreaterThan(0);
    for (const version of sharpVersions) {
      expect(version).toBeDefined();
      expect(atLeast(version!, '0.35.5')).toBe(true);
    }
  });
});
