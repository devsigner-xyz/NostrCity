import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');

describe('map visual dark theme styles', () => {
    test('keeps map zoom actions in one row', () => {
        expect(styles).toMatch(/\.nostr-map-zoom-controls\s*\{[^}]*flex-direction:\s*row;/s);
        expect(styles).toMatch(/\.nostr-map-zoom-controls\s*\{[^}]*align-items:\s*center;/s);
    });

    test('defines dark styles for map zoom controls', () => {
        expect(styles).toMatch(/\.dark\s+\.nostr-map-zoom-group\s*\{[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--background\)\s+92%,\s*transparent\)/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-regenerate-button\s*\{[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--background\)\s+92%,\s*transparent\)/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-zoom-level\s*\{[^}]*color:\s*var\(--muted-foreground\)/s);
        expect(styles).not.toMatch(/\.dark\s+\.nostr-map-(?:zoom-group|regenerate-button|display-toggle-group|theme-toggle-group)\s*\{[^}]*rgba\(6,\s*41,\s*31,/s);
        expect(styles).not.toMatch(/\.dark\s+\.nostr-map-zoom-level\s*\{[^}]*#FFD900/s);
    });

    test('keeps map control surfaces on neutral system tokens', () => {
        expect(styles).toMatch(/\.nostr-map-zoom-group\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)/s);
        expect(styles).toMatch(/\.nostr-map-regenerate-button\s*\{[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--background\)\s+92%,\s*transparent\)/s);
        expect(styles).toMatch(/\.nostr-map-display-toggle-group\s*\{[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--background\)\s+92%,\s*transparent\)/s);
        expect(styles).toMatch(/\.nostr-map-theme-toggle-group\s*\{[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--background\)\s+92%,\s*transparent\)/s);
    });

    test('uses standard bordered map control wrappers', () => {
        expect(styles).toMatch(/\.nostr-map-zoom-group\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)/s);
        expect(styles).toMatch(/\.nostr-map-display-toggle-group\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)/s);
        expect(styles).toMatch(/\.nostr-map-theme-toggle-group\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)/s);
        expect(styles).toMatch(/\.nostr-map-regenerate-button\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)/s);
    });

    test('aligns display toggles with map action control surfaces', () => {
        expect(styles).toMatch(/\.nostr-map-display-toggle-group\s*\{[^}]*min-height:\s*38px;/s);
        expect(styles).toMatch(/\.nostr-map-regenerate-button\s*\{[^}]*width:\s*38px;[^}]*height:\s*38px;/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-display-toggle-group\s*\{[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--background\)\s+92%,\s*transparent\)/s);
    });

    test('separates zoom controls and keeps zoom buttons circular', () => {
        expect(styles).toMatch(/\.nostr-map-zoom-group\s*\{[^}]*gap:\s*0\.25rem;/s);
        expect(styles).toMatch(/\.nostr-map-zoom-button\s*\{[^}]*border-radius:\s*999px;/s);
        expect(styles).toMatch(/\.nostr-map-zoom-level\s*\{[^}]*border:\s*0;/s);
    });

    test('distinguishes active display toggles from inactive toggles', () => {
        expect(styles).toMatch(/\.nostr-map-display-toggle-button\[data-state="on"\]\s*\{[^}]*background:\s*var\(--muted\)/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-display-toggle-button\[data-state="on"\]\s*\{[^}]*background:\s*var\(--muted\)/s);
        expect(styles).not.toMatch(/\.dark\s+\.nostr-map-display-toggle-button\[data-state="on"\]\s*\{[^}]*rgba\(255,\s*217,\s*0,/s);
    });

    test('defines dark styles for map occupant and icon markers', () => {
        expect(styles).toMatch(/\.dark\s+\.nostr-map-occupant-tag\s*\{[^}]*border-color:\s*var\(--border\)/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-occupant-tag\s*\{[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--card\)\s+96%,\s*transparent\)/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-occupant-name\s*\{[^}]*color:\s*var\(--card-foreground\)/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-occupant-avatar\s*\{[^}]*border-color:\s*var\(--border\)/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-occupant-avatar-fallback\s*\{[^}]*background:\s*var\(--muted\)/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-occupant-avatar-fallback\s*\{[^}]*color:\s*var\(--muted-foreground\)/s);
        expect(styles).not.toMatch(/\.dark\s+\.nostr-map-occupant-tag\s*\{[^}]*rgba\(10,\s*58,\s*38,/s);
        expect(styles).not.toMatch(/\.dark\s+\.nostr-map-occupant-avatar-fallback\s*\{[^}]*rgba\(255,\s*109,\s*31,/s);
        expect(styles).toMatch(/\.nostr-map-icon-marker\s*\{[^}]*width:\s*1\.6rem;[^}]*height:\s*1\.6rem;/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-icon-marker\s*\{[^}]*border-color:\s*var\(--border\)/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-icon-marker\s*\{[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--card\)\s+96%,\s*transparent\)/s);
        expect(styles).toMatch(/\.dark\s+\.nostr-map-icon-marker\s*\{[^}]*color:\s*var\(--card-foreground\)/s);
        expect(styles).not.toMatch(/\.dark\s+\.nostr-map-icon-marker\s*\{[^}]*rgba\(255,\s*109,\s*31,/s);
    });
});

describe('chat visual theme styles', () => {
    test('uses semantic theme tokens for chat text and surfaces', () => {
        expect(styles).toMatch(/\.nostr-chats-page-title\s*\{[^}]*color:\s*var\(--foreground\)/s);
        expect(styles).toMatch(/\.nostr-chat-loading\s*\{[^}]*color:\s*var\(--muted-foreground\)/s);
        expect(styles).toMatch(/\.nostr-chat-conversation-title\s*\{[^}]*color:\s*var\(--foreground\)/s);
        expect(styles).toMatch(/\.nostr-chat-conversation-preview\s*\{[^}]*color:\s*var\(--muted-foreground\)/s);
        expect(styles).toMatch(/\.nostr-chat-message\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)[^}]*color:\s*var\(--card-foreground\)[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--card\)\s+96%,\s*transparent\)/s);
    });
});

describe('loading indicator theme styles', () => {
    test('uses semantic tokens for incremental list loaders', () => {
        expect(styles).toMatch(/\.nostr-list-loading-footer\s*\{[^}]*color:\s*var\(--muted-foreground\)/s);
        expect(styles).not.toMatch(/\.nostr-list-loading-footer\s*\{[^}]*#[0-9a-fA-F]{3,8}/s);
    });

    test('uses semantic tokens for the map loader surface', () => {
        expect(styles).toMatch(/\.nostr-map-loader-card\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)/s);
        expect(styles).toMatch(/\.nostr-map-loader-card\s*\{[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--background\)\s+95%,\s*transparent\)/s);
        expect(styles).toMatch(/\.nostr-map-loader-card\s*\{[^}]*color:\s*var\(--foreground\)/s);
        expect(styles).toMatch(/\.nostr-map-loader-text\s*\{[^}]*color:\s*var\(--foreground\)/s);
    });

    test('uses semantic tokens for rich event reference loaders', () => {
        expect(styles).toMatch(/\.nostr-rich-event-reference\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border\)/s);
        expect(styles).toMatch(/\.nostr-rich-event-reference\s*\{[^}]*background:\s*color-mix\(in\s+oklab,\s*var\(--card\)\s+96%,\s*transparent\)/s);
        expect(styles).toMatch(/\.nostr-rich-event-reference-content\s*\{[^}]*color:\s*var\(--card-foreground\)/s);
        expect(styles).toMatch(/\.nostr-rich-event-reference-meta\s*\{[^}]*color:\s*var\(--muted-foreground\)/s);
    });
});
