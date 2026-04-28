import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src', 'landing', 'style.css'), 'utf8');

describe('landing dark neon palette', () => {
  test('uses a violet blue neon palette for dark mode', () => {
    expect(styles).toMatch(/:root\.dark\s*\{[^}]*--landing-bg:\s*#02030f;/s);
    expect(styles).toMatch(/:root\.dark\s*\{[^}]*--landing-bg-deep:\s*#08001f;/s);
    expect(styles).toMatch(/:root\.dark\s*\{[^}]*--landing-surface:\s*#10113a;/s);
    expect(styles).toMatch(/:root\.dark\s*\{[^}]*--landing-accent:\s*#ff4df8;/s);
    expect(styles).toMatch(/:root\.dark\s*\{[^}]*--landing-accent-3:\s*#35d9ff;/s);
  });

  test('adds neon glow gradients without changing landing structure selectors', () => {
    expect(styles).toMatch(/body\s*\{[^}]*radial-gradient\(circle at 12% 4%,\s*color-mix\(in srgb,\s*var\(--landing-accent\) 34%, transparent\)/s);
    expect(styles).toMatch(/\.landing-shell::after\s*\{[^}]*var\(--landing-accent-3\) 26%/s);
    expect(styles).toMatch(/\.hero\s*\{[^}]*var\(--landing-accent\) 14%/s);
    expect(styles).toMatch(/\.feature-list\s*\{/s);
  });

  test('stacks each feature item as tagline, title, and description rows', () => {
    expect(styles).toMatch(/\.feature-row\s*\{[^}]*grid-template-columns:\s*1fr;/s);
    expect(styles).toMatch(/\.feature-row\s*\{[^}]*gap:\s*0\.85rem;/s);
    expect(styles).toMatch(/\.feature-row > div\s*\{[^}]*display:\s*contents;/s);
    expect(styles).toMatch(/\.feature-row \.feature-eyebrow\s*\{[^}]*margin:\s*0 0 0\.2rem;/s);
  });

  test('stacks section headers as tagline, title, and description rows', () => {
    expect(styles).toMatch(/\.section-copy\s*\{[^}]*display:\s*block;/s);
    expect(styles).not.toMatch(/\.section-copy\s*\{[^}]*grid-template-columns:/s);
    expect(styles).toMatch(/\.section-copy > p:not\(\.section-kicker\)\s*\{[^}]*margin:\s*1rem 0 0;/s);
    expect(styles).toMatch(/\.section-copy > p:not\(\.section-kicker\)\s*\{[^}]*max-width:\s*58ch;/s);
  });
});
