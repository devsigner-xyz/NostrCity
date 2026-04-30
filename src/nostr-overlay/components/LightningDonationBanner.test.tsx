import { act, Fragment, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { LightningDonationBanner } from './LightningDonationBanner';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const donationProfile = {
    pubkey: 'd'.repeat(64),
    displayName: 'strhodler',
    lud16: 'strhodler@getalby.com',
};

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
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('LightningDonationBanner', () => {
    test('renders a QR code for a lightning profile without exposing wallet donation controls', async () => {
        const rendered = await renderElement(
            <LightningDonationBanner
                profile={donationProfile}
                canDonateWithWallet={false}
                onDonate={vi.fn()}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="lightning-donation-banner"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="lightning-donation-qr"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="lightning-donation-amount"]')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="lightning-donation-submit"]')).toBeNull();
    });

    test('renders QR with strhodler avatar image settings and 150px size', async () => {
        const rendered = await renderElement(
            <LightningDonationBanner
                profile={donationProfile}
                canDonateWithWallet={false}
                onDonate={vi.fn()}
            />
        );
        mounted.push(rendered);

        const qrSvg = rendered.container.querySelector('[data-testid="lightning-donation-qr"] svg') as SVGElement | null;
        const qrImage = rendered.container.querySelector('[data-testid="lightning-donation-qr"] image') as SVGImageElement | null;

        expect(qrSvg?.getAttribute('width')).toBe('150');
        expect(qrSvg?.getAttribute('height')).toBe('150');
        expect(qrImage?.getAttribute('href')).toBe('/strhodler.jpg');
        expect(Number(qrImage?.getAttribute('width'))).toBeGreaterThan(0);
        expect(Number(qrImage?.getAttribute('height'))).toBeGreaterThan(0);
    });

    test('clips the embedded QR avatar as a circle', async () => {
        const rendered = await renderElement(
            <LightningDonationBanner
                profile={donationProfile}
                canDonateWithWallet={false}
                onDonate={vi.fn()}
            />
        );
        mounted.push(rendered);

        const qr = rendered.container.querySelector('[data-testid="lightning-donation-qr"]') as HTMLElement | null;
        expect(qr?.className).toContain('[&_image]:[clip-path:circle(50%)]');
    });

    test('uses profile-section styling without the old bordered banner treatment', async () => {
        const rendered = await renderElement(
            <LightningDonationBanner
                profile={donationProfile}
                canDonateWithWallet={false}
                onDonate={vi.fn()}
            />
        );
        mounted.push(rendered);

        const banner = rendered.container.querySelector('[data-testid="lightning-donation-banner"]') as HTMLElement | null;
        expect(banner?.className).toContain('nostr-profile-info-section');
        expect(banner?.className).not.toContain('border-primary');
        expect(banner?.className).not.toContain('bg-primary/5');
    });

    test('uses explicit extra spacing between QR and donation content', async () => {
        const rendered = await renderElement(
            <LightningDonationBanner
                profile={donationProfile}
                canDonateWithWallet={false}
                onDonate={vi.fn()}
            />
        );
        mounted.push(rendered);

        const banner = rendered.container.querySelector('[data-testid="lightning-donation-banner"]') as HTMLElement | null;
        expect(banner?.style.columnGap).toBe('2rem');
        expect(banner?.style.rowGap).toBe('1.5rem');
    });

    test('omits the explanatory donation description copy', async () => {
        const rendered = await renderElement(
            <LightningDonationBanner
                profile={donationProfile}
                canDonateWithWallet={false}
                onDonate={vi.fn()}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').not.toContain('puedes donar sats');
        expect(rendered.container.textContent || '').not.toContain('you can donate sats');
    });

    test('encodes lud16 QR as a lightning LNURL instead of a raw lightning address', async () => {
        const rendered = await renderElement(
            <LightningDonationBanner
                profile={donationProfile}
                canDonateWithWallet={false}
                onDonate={vi.fn()}
            />
        );
        mounted.push(rendered);

        const qr = rendered.container.querySelector('[data-testid="lightning-donation-qr"]') as HTMLElement | null;
        const qrValue = qr?.getAttribute('data-qr-value') || '';

        expect(qrValue).toMatch(/^lightning:lnurl1/i);
        expect(qrValue).not.toContain(donationProfile.lud16);
    });

    test('keeps input ids unique when multiple banners are mounted', async () => {
        const rendered = await renderElement(
            <Fragment>
                <LightningDonationBanner profile={donationProfile} canDonateWithWallet onDonate={vi.fn()} />
                <LightningDonationBanner profile={donationProfile} canDonateWithWallet onDonate={vi.fn()} />
            </Fragment>
        );
        mounted.push(rendered);

        const inputs = Array.from(rendered.container.querySelectorAll('[data-testid="lightning-donation-amount"]')) as HTMLInputElement[];
        expect(inputs).toHaveLength(2);
        expect(inputs[0]?.id).not.toBe(inputs[1]?.id);
    });

    test('submits a wallet donation amount for the donation profile', async () => {
        const onDonate = vi.fn(async () => {});
        const rendered = await renderElement(
            <LightningDonationBanner
                profile={donationProfile}
                canDonateWithWallet
                onDonate={onDonate}
            />
        );
        mounted.push(rendered);

        const amountInput = rendered.container.querySelector('[data-testid="lightning-donation-amount"]') as HTMLInputElement | null;
        const submitButton = rendered.container.querySelector('[data-testid="lightning-donation-submit"]') as HTMLButtonElement | null;
        expect(amountInput).not.toBeNull();
        expect(submitButton).not.toBeNull();

        await act(async () => {
            if (amountInput) {
                const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                valueSetter?.call(amountInput, '210');
                amountInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await act(async () => {
            submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onDonate).toHaveBeenCalledWith({ pubkey: donationProfile.pubkey, amount: 210 });
    });

    test('does not submit non-integer amount strings', async () => {
        const onDonate = vi.fn(async () => {});
        const rendered = await renderElement(
            <LightningDonationBanner
                profile={donationProfile}
                canDonateWithWallet
                onDonate={onDonate}
            />
        );
        mounted.push(rendered);

        const amountInput = rendered.container.querySelector('[data-testid="lightning-donation-amount"]') as HTMLInputElement | null;
        const submitButton = rendered.container.querySelector('[data-testid="lightning-donation-submit"]') as HTMLButtonElement | null;

        await act(async () => {
            if (amountInput) {
                const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                valueSetter?.call(amountInput, '1e3');
                amountInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await act(async () => {
            submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onDonate).not.toHaveBeenCalled();
    });

    test('does not crash or render when lud16 metadata is malformed', async () => {
        const rendered = await renderElement(
            <LightningDonationBanner
                profile={{ pubkey: 'e'.repeat(64), displayName: 'Broken LN', lud16: 'not-a-lightning-address' }}
                canDonateWithWallet
                onDonate={vi.fn()}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent).toBe('');
    });

    test('does not submit amounts that overflow millisecond-satoshi precision', async () => {
        const onDonate = vi.fn(async () => {});
        const rendered = await renderElement(
            <LightningDonationBanner
                profile={donationProfile}
                canDonateWithWallet
                onDonate={onDonate}
            />
        );
        mounted.push(rendered);

        const amountInput = rendered.container.querySelector('[data-testid="lightning-donation-amount"]') as HTMLInputElement | null;
        const submitButton = rendered.container.querySelector('[data-testid="lightning-donation-submit"]') as HTMLButtonElement | null;

        await act(async () => {
            if (amountInput) {
                const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                valueSetter?.call(amountInput, String(Number.MAX_SAFE_INTEGER));
                amountInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await act(async () => {
            submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onDonate).not.toHaveBeenCalled();
    });

    test('does not render when the profile has no lightning endpoint', async () => {
        const rendered = await renderElement(
            <LightningDonationBanner
                profile={{ pubkey: 'e'.repeat(64), displayName: 'No LN' }}
                canDonateWithWallet
                onDonate={vi.fn()}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent).toBe('');
    });
});
