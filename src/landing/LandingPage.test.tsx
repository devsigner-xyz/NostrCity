import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { I18nProvider } from '@/i18n/I18nProvider';
import { UI_SETTINGS_STORAGE_KEY } from '@/nostr/ui-settings';
import LandingPage from './LandingPage';

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
}

function mockSystemTheme(matches: boolean, reducedMotion = false): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reducedMotion : matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

async function renderLanding(): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <I18nProvider initialLocale="es">
        <LandingPage />
      </I18nProvider>,
    );
  });

  return { container, root };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

afterEach(async () => {
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  vi.restoreAllMocks();

  for (const entry of mounted) {
    await act(async () => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
  mounted = [];
});

describe('LandingPage theme selector', () => {
  test('uses light mode before an explicit selection is stored', async () => {
    mockSystemTheme(true);

    const rendered = await renderLanding();
    mounted.push(rendered);

    const shell = rendered.container.querySelector('.landing-shell');
    const logo = rendered.container.querySelector('.brand-logo') as HTMLImageElement | null;
    const lightButton = rendered.container.querySelector('button[aria-pressed="true"]');

    expect(shell?.getAttribute('data-theme')).toBe('light');
    expect(logo?.getAttribute('src')).toBe('/icon-light-32x32.png');
    expect(logo?.getAttribute('width')).toBe('32');
    expect(logo?.getAttribute('height')).toBe('32');
    expect(lightButton?.textContent).toContain('Claro');
  });

  test('stores explicit light mode for the app when selected from the home', async () => {
    mockSystemTheme(true);
    window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'es', theme: 'dark' }));

    const rendered = await renderLanding();
    mounted.push(rendered);

    const lightButton = Array.from(rendered.container.querySelectorAll('.theme-toggle button')).find((button) =>
      (button.textContent || '').includes('Claro'),
    ) as HTMLButtonElement | undefined;
    expect(lightButton).toBeDefined();

    await act(async () => {
      lightButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const stored = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}') as { theme?: string; language?: string };
    const logo = rendered.container.querySelector('.brand-logo') as HTMLImageElement | null;

    expect(stored).toEqual({ language: 'es', theme: 'light', themePreferenceVersion: 2 });
    expect(rendered.container.querySelector('.landing-shell')?.getAttribute('data-theme')).toBe('light');
    expect(logo?.getAttribute('src')).toBe('/icon-light-32x32.png');
  });

  test('renders the editorial hero without the previous visual map preview', async () => {
    mockSystemTheme(false);

    const rendered = await renderLanding();
    mounted.push(rendered);

    expect(rendered.container.querySelector('[data-testid="landing-map-preview"]')).toBeNull();
    expect(rendered.container.querySelector('.hero-visual')).toBeNull();
    expect(rendered.container.querySelector('h1')?.textContent).toContain('Explora Nostr como ciudad de código abierto');
  });

  test('presents features as a two-column editorial list', async () => {
    mockSystemTheme(false);

    const rendered = await renderLanding();
    mounted.push(rendered);

    const featureList = rendered.container.querySelector('[data-testid="landing-feature-list"]');
    const featureItems = rendered.container.querySelectorAll('[data-testid="landing-feature-list"] article');

    expect(featureList?.classList.contains('feature-list')).toBe(true);
    expect(featureItems).toHaveLength(6);
    expect(featureItems[0]?.textContent).toContain('Mapa generativo');
  });

  test('uses native in-page links for section navigation', async () => {
    mockSystemTheme(false, true);

    const rendered = await renderLanding();
    mounted.push(rendered);

    const howLink = rendered.container.querySelector('a[href="#como-funciona"]');
    const featuresLink = rendered.container.querySelector('a[href="#features"]');

    expect(howLink).not.toBeNull();
    expect(featuresLink).not.toBeNull();
    expect(howLink?.textContent).toContain('Ver cómo funciona');
    expect(featuresLink?.textContent).toContain('Funciones');
  });
});
