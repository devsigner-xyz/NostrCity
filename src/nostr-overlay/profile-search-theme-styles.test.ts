import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');

describe('profile and search theme styles', () => {
    test('keeps global user search empty states on semantic theme colors', () => {
        expect(styles).toMatch(/\.nostr-global-search-empty\s*\{[^}]*color:\s*var\(--muted-foreground\)/s);
    });

    test('keeps profile dialogs on semantic theme surfaces', () => {
        expect(styles).toMatch(/\.nostr-dialog\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--popover\)\s+98%,\s*transparent\)[^}]*color:\s*var\(--popover-foreground\)/s);
        expect(styles).toMatch(/\.nostr-profile-dialog-banner-shell\.is-placeholder\s*\{[^}]*background:\s*var\(--muted\)/s);
    });
});
