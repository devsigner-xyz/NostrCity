import type { Locator, Page } from '@playwright/test';
import { nip19 } from 'nostr-tools';

const READONLY_NPUB = 'npub1tr4dstaptd2sp98h7hlysp8qle6mw7wmauhfkgz3rmxdd8ndprusnw2y5g';
const decoded = nip19.decode(READONLY_NPUB);

if (decoded.type !== 'npub') {
    throw new Error('Expected readonly smoke identifier to be an npub');
}

export const READONLY_OWNER_PUBKEY = decoded.data as string;

const FOLLOW_PUBKEYS = [
    '1111111111111111111111111111111111111111111111111111111111111111',
    '2222222222222222222222222222222222222222222222222222222222222222',
    '3333333333333333333333333333333333333333333333333333333333333333',
] as const;

const PROFILE_LABELS: Record<string, { name: string; displayName?: string }> = {
    [READONLY_OWNER_PUBKEY]: { name: 'Seth For Privacy', displayName: 'Seth For Privacy' },
    [FOLLOW_PUBKEYS[0]]: { name: 'Alice Nakamoto', displayName: 'Alice Nakamoto' },
    [FOLLOW_PUBKEYS[1]]: { name: 'Bob Lightning', displayName: 'Bob Lightning' },
    [FOLLOW_PUBKEYS[2]]: { name: 'Carol Relay', displayName: 'Carol Relay' },
};

function fallbackProfile(pubkey: string) {
    const short = `${pubkey.slice(0, 6)}...${pubkey.slice(-4)}`;
    return {
        pubkey,
        createdAt: 1,
        name: short,
        displayName: short,
    };
}

async function mockOverlayBootstrapApis(page: Page): Promise<void> {
    await page.route('**/v1/graph/follows**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                pubkey: READONLY_OWNER_PUBKEY,
                follows: FOLLOW_PUBKEYS,
                relayHints: [],
            }),
        });
    });

    await page.route('**/v1/graph/followers', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                pubkey: READONLY_OWNER_PUBKEY,
                followers: [],
                complete: true,
            }),
        });
    });

    await page.route('**/v1/social/feed/following**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                items: [],
                hasMore: false,
                nextUntil: null,
            }),
        });
    });

    await page.route('**/v1/identity/profiles/resolve', async (route) => {
        const postData = route.request().postDataJSON() as { pubkeys?: string[] } | null;
        const pubkeys = postData?.pubkeys ?? [];
        const profiles = Object.fromEntries(
            pubkeys.map((pubkey) => {
                const predefined = PROFILE_LABELS[pubkey];
                return [pubkey, {
                    pubkey,
                    createdAt: 1,
                    ...(predefined ?? fallbackProfile(pubkey)),
                }];
            })
        );

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ profiles }),
        });
    });
}

export async function seedReadonlyDarkSession(page: Page): Promise<void> {
    await mockOverlayBootstrapApis(page);

    await page.addInitScript(({ ownerPubkey }) => {
        window.localStorage.setItem('nostr.overlay.auth.session.v1', JSON.stringify({
            method: 'npub',
            pubkey: ownerPubkey,
            readonly: true,
            locked: false,
            createdAt: Date.now(),
        }));
        window.localStorage.setItem('nostr.overlay.ui.v1', JSON.stringify({
            language: 'en',
            theme: 'dark',
        }));
    }, { ownerPubkey: READONLY_OWNER_PUBKEY });
}

export async function waitForOverlayRoute(page: Page, marker: string): Promise<void> {
    await page.waitForFunction((text) => document.body.innerText.includes(text), marker, { timeout: 45_000 });
}

function parseRgb(rgb: string): [number, number, number] | null {
    const match = rgb.match(/rgba?\(([^)]+)\)/);
    if (!match) {
        return null;
    }

    const channels = match[1]?.split(',').slice(0, 3).map((value) => Number.parseFloat(value.trim()));
    if (!channels || channels.some((value) => !Number.isFinite(value))) {
        return null;
    }

    return channels as [number, number, number];
}

function parseOklabLightness(value: string): number | null {
    const match = value.match(/oklab\(([^)]+)\)/i) ?? value.match(/oklch\(([^)]+)\)/i);
    if (!match) {
        return null;
    }

    const lightness = match[1]?.trim().split(/[\s/]+/)[0];
    if (!lightness) {
        return null;
    }

    if (lightness.endsWith('%')) {
        const percent = Number.parseFloat(lightness.slice(0, -1));
        return Number.isFinite(percent) ? percent / 100 : null;
    }

    const parsed = Number.parseFloat(lightness);
    return Number.isFinite(parsed) ? parsed : null;
}

function luminanceFromRgb([r, g, b]: [number, number, number]): number {
    const normalize = (channel: number): number => {
        const srgb = channel / 255;
        return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * normalize(r) + 0.7152 * normalize(g) + 0.0722 * normalize(b);
}

export async function visibleSurfaceLuminance(locator: Locator): Promise<number> {
    const color = await locator.evaluate((node) => {
        let current: HTMLElement | null = node as HTMLElement;

        while (current) {
            const background = getComputedStyle(current).backgroundColor;
            if (background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') {
                return background;
            }
            current = current.parentElement;
        }

        return getComputedStyle(document.body).backgroundColor;
    });

    const parsed = parseRgb(color);
    if (parsed) {
        return luminanceFromRgb(parsed);
    }

    const oklabLightness = parseOklabLightness(color);
    if (oklabLightness !== null) {
        return oklabLightness;
    }

    throw new Error(`Could not parse background color: ${color}`);
}
