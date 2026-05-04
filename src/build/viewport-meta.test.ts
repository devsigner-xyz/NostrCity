import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function viewportContent(relativePath: string): string {
  const markup = readFileSync(join(process.cwd(), relativePath), 'utf8');
  const document = new DOMParser().parseFromString(markup, 'text/html');

  return document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '';
}

describe('viewport metadata', () => {
  it('prevents browser pinch zoom in the app shell', () => {
    const content = viewportContent('app/index.html');

    expect(content).toContain('width=device-width');
    expect(content).toContain('initial-scale=1.0');
    expect(content).toContain('maximum-scale=1.0');
    expect(content).toContain('user-scalable=no');
  });

  it('keeps browser zoom available on the landing page', () => {
    const content = viewportContent('index.html');

    expect(content).toContain('width=device-width');
    expect(content).toContain('initial-scale=1.0');
    expect(content).not.toContain('maximum-scale');
    expect(content).not.toContain('user-scalable');
  });

  it('installs the browser zoom lock from the app entry only', () => {
    const appEntry = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');
    const landingEntry = readFileSync(join(process.cwd(), 'src', 'landing', 'main.tsx'), 'utf8');

    expect(appEntry).toContain('installBrowserZoomLock');
    expect(landingEntry).not.toContain('installBrowserZoomLock');
  });
});
