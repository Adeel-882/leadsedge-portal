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

function lockedVersions(packageName: string): string[] {
  return Object.entries(lock.packages)
    .filter(([path]) => path === `node_modules/${packageName}` || path.endsWith(`/node_modules/${packageName}`))
    .map(([, entry]) => entry.version ?? 'missing');
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

describe('reported high-severity dependency advisories', () => {
  it('keeps React Server Components on the fixed 19.2 patch line with matching React packages', () => {
    const versions = lockedVersions('react-server-dom-webpack');
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      expect(/^19\.2\.\d+$/.test(version) && atLeast(version, '19.2.9')).toBe(true);
    }
    expect(lock.packages['node_modules/react']?.version).toBe(lock.packages['node_modules/react-dom']?.version);
    expect(lock.packages['node_modules/react']?.version).toBe(versions[0]);
  });

  it('uses a patched Vite 8.1 build without the Windows launch-editor vulnerability', () => {
    const versions = lockedVersions('vite');
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      expect(/^8\.1\.\d+$/.test(version) && atLeast(version, '8.1.6')).toBe(true);
    }
  });

  it('locks Zod, fast-uri, and source-map-js above their reported vulnerable versions', () => {
    for (const [name, floor] of [['zod', '4.6.6'], ['fast-uri', '3.1.7'], ['source-map-js', '1.2.2']]) {
      const versions = lockedVersions(name);
      expect(versions.length).toBeGreaterThan(0);
      for (const version of versions) expect(atLeast(version, floor)).toBe(true);
    }
  });

  it('locks both installed brace-expansion major lines above the recursion fixes', () => {
    const versions = lockedVersions('brace-expansion');
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      const floor = version.startsWith('1.') ? '1.1.20' : version.startsWith('5.') ? '5.0.11' : null;
      expect(floor).not.toBeNull();
      expect(atLeast(version, floor!)).toBe(true);
    }
  });
});
