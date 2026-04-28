import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { getDefaultUiSettings } from '../../nostr/ui-settings';
import type { AuthSessionState } from '../../nostr/auth/session';
import type { MapBridge } from '../map-bridge';
import { OverlayDialogLayer } from './OverlayDialogLayer';

const {
    activeProfileDialogContainerMock,
    easterEggDialogMock,
    easterEggFireworksMock,
    loginGateScreenMock,
    mapPresenceLayerMock,
    socialComposeDialogMock,
    uiSettingsDialogMock,
} = vi.hoisted(() => ({
    activeProfileDialogContainerMock: vi.fn(),
    easterEggDialogMock: vi.fn(),
    easterEggFireworksMock: vi.fn(),
    loginGateScreenMock: vi.fn(),
    mapPresenceLayerMock: vi.fn(),
    socialComposeDialogMock: vi.fn(),
    uiSettingsDialogMock: vi.fn(),
}));

vi.mock('../components/MapPresenceLayer', async () => {
    const React = await vi.importActual<typeof import('react')>('react');
    return {
        MapPresenceLayer: (props: Record<string, unknown>) => {
            mapPresenceLayerMock(props);
            return React.createElement('div', { 'data-testid': 'map-presence-layer' }, 'presence');
        },
    };
});

vi.mock('./ActiveProfileDialogContainer', async () => {
    const React = await vi.importActual<typeof import('react')>('react');
    return {
        ActiveProfileDialogContainer: (props: Record<string, unknown>) => {
            activeProfileDialogContainerMock(props);
            return React.createElement('div', { 'data-testid': 'active-profile-dialog-container' }, 'profile');
        },
    };
});

vi.mock('../components/EasterEggDialog', async () => {
    const React = await vi.importActual<typeof import('react')>('react');
    return {
        EasterEggDialog: (props: Record<string, unknown>) => {
            easterEggDialogMock(props);
            return React.createElement('div', { 'data-testid': 'easter-egg-dialog' }, 'easter egg');
        },
    };
});

vi.mock('../components/EasterEggFireworks', async () => {
    const React = await vi.importActual<typeof import('react')>('react');
    return {
        EasterEggFireworks: (props: Record<string, unknown>) => {
            easterEggFireworksMock(props);
            return React.createElement('div', { 'data-testid': 'easter-egg-fireworks' }, 'fireworks');
        },
    };
});

vi.mock('../components/SocialComposeDialog', async () => {
    const React = await vi.importActual<typeof import('react')>('react');
    return {
        SocialComposeDialog: (props: Record<string, unknown>) => {
            socialComposeDialogMock(props);
            return React.createElement('div', { 'data-testid': 'social-compose-dialog' }, 'compose');
        },
    };
});

vi.mock('../components/LoginGateScreen', async () => {
    const React = await vi.importActual<typeof import('react')>('react');
    return {
        LoginGateScreen: (props: Record<string, unknown>) => {
            loginGateScreenMock(props);
            return React.createElement('div', { 'data-testid': 'login-gate-screen' }, 'login');
        },
    };
});

vi.mock('../components/UiSettingsDialog', async () => {
    const React = await vi.importActual<typeof import('react')>('react');
    return {
        UiSettingsDialog: (props: Record<string, unknown>) => {
            uiSettingsDialogMock(props);
            return React.createElement('div', { 'data-testid': 'ui-settings-dialog' }, 'settings');
        },
    };
});

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

interface OpenChangeProps {
    onOpenChange: (open: boolean) => void;
}

const OWNER_PUBKEY = 'f'.repeat(64);
const ACTIVE_PUBKEY = 'a'.repeat(64);
const EVENT_ID = 'event-1';

const authSession: AuthSessionState = {
    method: 'nip07',
    pubkey: OWNER_PUBKEY,
    readonly: false,
    locked: false,
    createdAt: 1,
    capabilities: {
        canSign: true,
        canEncrypt: true,
        encryptionSchemes: ['nip44'],
    },
};

function createMapBridgeStub(): MapBridge {
    return {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        regenerateMap: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue([]),
        listEasterEggBuildings: vi.fn().mockReturnValue([]),
        applyOccupancy: vi.fn(),
        setViewportInsetLeft: vi.fn(),
        setVerifiedBuildingIndexes: vi.fn(),
        setDialogBuildingHighlight: vi.fn(),
        setStreetLabelsEnabled: vi.fn(),
        setStreetLabelsZoomLevel: vi.fn(),
        setStreetLabelUsernames: vi.fn(),
        setTrafficParticlesCount: vi.fn(),
        setTrafficParticlesSpeed: vi.fn(),
        setColourScheme: vi.fn(),
        getColourScheme: vi.fn().mockReturnValue('Nostr City Light'),
        listColourSchemes: vi.fn().mockReturnValue(['Nostr City Light']),
        mountSettingsPanel: vi.fn(),
        focusBuilding: vi.fn(),
        getParkCount: vi.fn().mockReturnValue(0),
        getZoom: vi.fn().mockReturnValue(1),
        setZoom: vi.fn(),
        worldToScreen: vi.fn().mockImplementation((point) => point),
        getViewportInsetLeft: vi.fn().mockReturnValue(0),
        onMapGenerated: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingClick: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingContextMenu: vi.fn().mockReturnValue(() => {}),
        onEasterEggBuildingClick: vi.fn().mockReturnValue(() => {}),
        onViewChanged: vi.fn().mockReturnValue(() => {}),
    };
}

function createDefaultProps(overrides: Partial<ComponentProps<typeof OverlayDialogLayer>> = {}): ComponentProps<typeof OverlayDialogLayer> {
    const activeProfileData = {
        posts: [{ id: EVENT_ID, pubkey: ACTIVE_PUBKEY, createdAt: 123, content: 'hello' }],
        postsLoading: false,
        hasMorePosts: false,
        followsCount: 2,
        followersCount: 1,
        statsLoading: false,
        follows: ['b'.repeat(64)],
        followers: ['c'.repeat(64)],
        networkProfiles: {},
        relaySuggestionsByType: {
            nip65Both: [],
            nip65Read: [],
            nip65Write: [],
            dmInbox: [],
            search: [],
        },
        networkLoading: false,
        loadMorePosts: vi.fn(async () => {}),
        retryPosts: vi.fn(async () => {}),
        retryNetwork: vi.fn(async () => {}),
    };

    return {
        mapBridge: createMapBridgeStub(),
        showLoginGate: false,
        occupancyByBuildingIndex: { 1: ACTIVE_PUBKEY },
        discoveredEasterEggIds: ['bitcoin_whitepaper'],
        profiles: { [ACTIVE_PUBKEY]: { pubkey: ACTIVE_PUBKEY, displayName: 'Alice' } },
        ownerPubkey: OWNER_PUBKEY,
        ownerProfile: { pubkey: OWNER_PUBKEY, displayName: 'Owner' },
        ownerBuildingIndex: 4,
        occupiedLabelsZoomLevel: 2,
        alwaysVisiblePubkeys: [OWNER_PUBKEY],
        specialMarkersEnabled: true,
        activeProfilePubkey: ACTIVE_PUBKEY,
        activeProfile: { pubkey: ACTIVE_PUBKEY, displayName: 'Alice' },
        activeProfileData,
        activeProfileEngagementByEventId: {},
        richContentProfilesByPubkey: {},
        verificationByPubkey: {},
        eventReferencesById: {},
        ownerFollows: [],
        canWrite: true,
        canAccessDirectMessages: true,
        reactionByEventId: {},
        repostByEventId: {},
        pendingReactionByEventId: {},
        pendingRepostByEventId: {},
        onCloseActiveProfile: vi.fn(),
        onOpenThread: vi.fn(),
        onSelectHashtag: vi.fn(),
        onSelectProfile: vi.fn(),
        onCopyNpub: vi.fn(),
        onAddRelaySuggestion: vi.fn(),
        onAddAllRelaySuggestions: vi.fn(),
        onFollowProfile: vi.fn(),
        onSendMessage: vi.fn(),
        onToggleReaction: vi.fn(async () => true),
        onToggleRepost: vi.fn(async () => true),
        onOpenQuoteComposer: vi.fn(),
        onRequestZapPayment: vi.fn(async () => {}),
        zapAmounts: [21, 128],
        onConfigureZapAmounts: vi.fn(),
        onResolveProfiles: vi.fn(async () => {}),
        onResolveEventReferences: vi.fn(async () => ({})),
        activeEasterEgg: null,
        easterEggCelebrationNonce: 0,
        onCloseActiveEasterEgg: vi.fn(),
        socialComposeState: null,
        isSubmittingSocialCompose: false,
        onSearchUsers: vi.fn(async () => ({ pubkeys: [], profiles: {} })),
        userSearchRelaySetKey: 'search-key',
        onCloseSocialCompose: vi.fn(),
        onSubmitSocialCompose: vi.fn(async () => {}),
        authSession,
        savedLocalAccount: { pubkey: OWNER_PUBKEY, mode: 'device' },
        loginDisabled: false,
        sessionRestorationResolved: true,
        mapLoaderText: null,
        resolvedOverlayTheme: 'dark',
        onStartSession: vi.fn(async () => {}),
        isUiSettingsDialogOpen: false,
        uiSettings: getDefaultUiSettings(),
        onPersistUiSettings: vi.fn(),
        onOpenUiSettingsDialog: vi.fn(),
        onCloseUiSettingsDialog: vi.fn(),
        ...overrides,
    };
}

async function renderLayer(props: ComponentProps<typeof OverlayDialogLayer>): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(<OverlayDialogLayer {...props} />);
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
    mapPresenceLayerMock.mockClear();
    activeProfileDialogContainerMock.mockClear();
    easterEggDialogMock.mockClear();
    easterEggFireworksMock.mockClear();
    socialComposeDialogMock.mockClear();
    loginGateScreenMock.mockClear();
    uiSettingsDialogMock.mockClear();
});

describe('OverlayDialogLayer', () => {
    test('forwards map presence and active profile props', async () => {
        const props = createDefaultProps();
        const rendered = await renderLayer(props);
        mounted.push(rendered);

        expect(mapPresenceLayerMock).toHaveBeenCalledWith(expect.objectContaining({
            mapBridge: props.mapBridge,
            occupancyByBuildingIndex: props.occupancyByBuildingIndex,
            discoveredEasterEggIds: props.discoveredEasterEggIds,
            profiles: props.profiles,
            ownerPubkey: props.ownerPubkey,
            ownerProfile: props.ownerProfile,
            ownerBuildingIndex: props.ownerBuildingIndex,
            occupiedLabelsZoomLevel: props.occupiedLabelsZoomLevel,
            alwaysVisiblePubkeys: props.alwaysVisiblePubkeys,
            specialMarkersEnabled: props.specialMarkersEnabled,
        }));
        expect(activeProfileDialogContainerMock).toHaveBeenCalledWith(expect.objectContaining({
            activeProfilePubkey: props.activeProfilePubkey,
            activeProfileData: props.activeProfileData,
            activeProfileEngagementByEventId: props.activeProfileEngagementByEventId,
            onClose: props.onCloseActiveProfile,
        }));
    });

    test('renders active easter egg dialog and fireworks in dialog order', async () => {
        const onCloseActiveEasterEgg = vi.fn();
        const rendered = await renderLayer(createDefaultProps({
            activeEasterEgg: {
                nonce: 7,
                buildingIndex: 3,
                easterEggId: 'bitcoin_whitepaper',
            },
            easterEggCelebrationNonce: 9,
            onCloseActiveEasterEgg,
        }));
        mounted.push(rendered);

        expect(easterEggDialogMock).toHaveBeenCalledWith(expect.objectContaining({
            buildingIndex: 3,
            onClose: onCloseActiveEasterEgg,
        }));
        expect(easterEggDialogMock.mock.calls[0]?.[0].entry.title).toBe('Bitcoin: A Peer-to-Peer Electronic Cash System');
        expect(easterEggFireworksMock).toHaveBeenCalledWith(expect.objectContaining({ nonce: 9 }));
        expect(Array.from(rendered.container.querySelectorAll('[data-testid]')).map((node) => node.getAttribute('data-testid'))).toEqual([
            'map-presence-layer',
            'active-profile-dialog-container',
            'easter-egg-dialog',
            'easter-egg-fireworks',
            'ui-settings-dialog',
        ]);
    });

    test('renders compose dialog only when compose state exists and closes on false open change', async () => {
        const onCloseSocialCompose = vi.fn();
        const withoutCompose = await renderLayer(createDefaultProps({ socialComposeState: null }));
        mounted.push(withoutCompose);
        expect(socialComposeDialogMock).not.toHaveBeenCalled();

        const withCompose = await renderLayer(createDefaultProps({
            socialComposeState: { mode: 'post' },
            onCloseSocialCompose,
        }));
        mounted.push(withCompose);

        expect(socialComposeDialogMock).toHaveBeenCalledWith(expect.objectContaining({
            open: true,
            mode: 'post',
        }));
        const composeProps = socialComposeDialogMock.mock.calls[socialComposeDialogMock.mock.calls.length - 1]?.[0] as OpenChangeProps;
        act(() => {
            composeProps.onOpenChange(false);
        });
        expect(onCloseSocialCompose).toHaveBeenCalledTimes(1);
    });

    test('renders login gate only when requested', async () => {
        const hidden = await renderLayer(createDefaultProps({ showLoginGate: false }));
        mounted.push(hidden);
        expect(loginGateScreenMock).not.toHaveBeenCalled();

        const shownProps = createDefaultProps({ showLoginGate: true, loginDisabled: true, sessionRestorationResolved: false });
        const shown = await renderLayer(shownProps);
        mounted.push(shown);

        expect(loginGateScreenMock).toHaveBeenCalledWith(expect.objectContaining({
            authSession: shownProps.authSession,
            savedLocalAccount: shownProps.savedLocalAccount,
            disabled: true,
            mapLoaderText: shownProps.mapLoaderText,
            overlayTheme: shownProps.resolvedOverlayTheme,
            restoringSession: true,
            onStartSession: shownProps.onStartSession,
        }));
    });

    test('routes UI settings open changes to open and close callbacks', async () => {
        const onOpenUiSettingsDialog = vi.fn();
        const onCloseUiSettingsDialog = vi.fn();
        const rendered = await renderLayer(createDefaultProps({ onOpenUiSettingsDialog, onCloseUiSettingsDialog }));
        mounted.push(rendered);

        const settingsProps = uiSettingsDialogMock.mock.calls[uiSettingsDialogMock.mock.calls.length - 1]?.[0] as OpenChangeProps;
        act(() => {
            settingsProps.onOpenChange(true);
        });
        act(() => {
            settingsProps.onOpenChange(false);
        });

        expect(onOpenUiSettingsDialog).toHaveBeenCalledTimes(1);
        expect(onCloseUiSettingsDialog).toHaveBeenCalledTimes(1);
    });

    test('passes map bridge to UI settings dialog', async () => {
        const props = createDefaultProps();
        const rendered = await renderLayer(props);
        mounted.push(rendered);

        expect(uiSettingsDialogMock).toHaveBeenCalledWith(expect.objectContaining({
            mapBridge: props.mapBridge,
        }));
    });
});
