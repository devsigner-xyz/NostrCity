import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../../nostr/ui-settings';
import { Badge } from '@/components/ui/badge';
import { SettingsRelayDetailPage } from './SettingsRelayDetailPage';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(
            <SettingsRelayDetailPage
                selectedRelay={{ relayUrl: 'wss://relay.one', source: 'configured', relayType: 'nip65Both' }}
                activeRelayTypes={['nip65Both']}
                selectedRelayDetails={{ relayUrl: 'wss://relay.one', source: 'configured', host: 'relay.one' }}
                selectedRelayAdminIdentity="npub1admin"
                selectedRelayConnectionStatus="connected"
                relayHasNip11Metadata
                relayHasFees={false}
                copiedRelayIdentityKey={null}
                relayTypeLabels={{
                    nip65Both: 'NIP-65 read+write',
                    nip65Read: 'NIP-65 read',
                    nip65Write: 'NIP-65 write',
                    dmInbox: 'NIP-17 DM inbox',
                    search: 'NIP-50 search',
                    groups: 'NIP-29 groups',
                }}
                relayAvatarFallback={() => 'RL'}
                relayConnectionBadge={() => <Badge variant="outline">Online</Badge>}
                formatRelayFee={() => '1 sat'}
                onCopyRelayIdentity={vi.fn(async () => {})}
            />
        );
    });

    return { container, root } satisfies RenderResult;
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

describe('SettingsRelayDetailPage', () => {
    test('renders english detail copy when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement();
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Relay details');
        expect(text).toContain('Metadata and technical capabilities of the selected relay.');
        expect(text).toContain('Technical details');
        expect(text).toContain('Connection');
        expect(text).toContain('Copy npub');
    });
});
