import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { CityStatsPage } from './CityStatsPage';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { container, root };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    window.localStorage.clear();
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('CityStatsPage', () => {
    test('renders english city stats copy when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <CityStatsPage
                buildingsCount={100}
                occupiedBuildingsCount={60}
                followedPubkeys={['verified', 'lightning', 'bot', 'mutual']}
                followerPubkeys={['mutual', 'follower-only']}
                profilesByPubkey={{
                    verified: { pubkey: 'verified', nip05: 'verified@example.com' },
                    lightning: { pubkey: 'lightning', lud16: 'pay@example.com' },
                    bot: { pubkey: 'bot', bot: true },
                    mutual: { pubkey: 'mutual', lud06: 'lnurl1example' },
                }}
                verificationByPubkey={{
                    verified: { status: 'verified', identifier: 'verified@example.com', checkedAt: 1 },
                }}
                parkCount={7}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('City stats');
        expect(text).toContain('Map capacity and Nostr identity signals for the people you follow.');
        expect(rendered.container.querySelector('[data-slot="overlay-page-header-title"]')?.textContent).toBe('City stats');
        expect(rendered.container.querySelector('[data-slot="overlay-page-header-description"]')?.textContent).toBe('Map capacity and Nostr identity signals for the people you follow.');
        expect(text).toContain('Total homes');
        expect(text).toContain('Occupied buildings');
        expect(text).toContain('NIP-05 identity verified');
        expect(text).toContain('Mutual follows');
        expect(text).toContain('Followed profile quality');
        expect(text).not.toContain('Unhoused demand');
        expect(text).not.toContain('Occupancy demographics');
        expect(text).not.toContain('Demographic network');
        expect(rendered.container.querySelectorAll('[data-testid="city-stats-kpi-card"]')).toHaveLength(10);
        expect(rendered.container.querySelectorAll('[data-testid="city-stats-chart-card"]')).toHaveLength(3);

        const cardValue = (label: string): string | undefined => Array.from(rendered.container.querySelectorAll('[data-testid="city-stats-kpi-card"]'))
            .find((card) => (card.textContent || '').includes(label))
            ?.querySelector('p')
            ?.textContent
            ?.trim();

        expect(cardValue('Following')).toBe('4');
        expect(cardValue('NIP-05 identity verified')).toBe('1 (25.0%)');
        expect(cardValue('Mutual follows')).toBe('1 (25.0%)');
        expect(cardValue('Lightning profiles')).toBe('2 (50.0%)');
        expect(cardValue('Profiles loaded')).toBe('4 (100.0%)');
        expect(cardValue('Declared bots')).toBe('1 (25.0%)');
    });
});
