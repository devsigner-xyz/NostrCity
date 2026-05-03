import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SimplePool } from 'nostr-tools/pool';
import { createAuthService } from '../nostr/auth/auth-service';
import { createRuntimeDirectMessagesService } from '../nostr/dm-runtime-service';
import { GROUP_METADATA_KIND, isVerifiedPublicSavedGroupsEvent, parsePublicSavedGroupRelaysEvent, parsePublicSavedGroupsEvent, PUBLIC_SAVED_GROUPS_KIND } from '../nostr/groups';
import {
    discoverNip29GroupsFromRelays,
    resolveNip29GroupDiscoveryRelays,
    verifiedDiscoveredGroups,
} from '../nostr/group-relay-discovery';
import { loadRememberedGroups } from '../nostr/group-remembered-storage';
import { createGroupsRuntimeService } from '../nostr/groups-runtime-service';
import { fetchNip11RelayInfo } from '../nostr/groups-transport';
import { createLazyNdkClient } from '../nostr/lazy-ndk-client';
import { getBootstrapRelays } from '../nostr/relay-policy';
import { getRelaySetByType, loadRelaySettings, type RelaySettingsState } from '../nostr/relay-settings';
import type { PublishResult } from '../nostr/dm-types';
import type { NostrClient, NostrEvent } from '../nostr/types';
import { createDmApiService } from '../nostr-api/dm-api-service';
import { createGraphApiService } from '../nostr-api/graph-api-service';
import { createHttpClient, type HttpClientAuthContext } from '../nostr-api/http-client';
import { createIdentityApiService } from '../nostr-api/identity-api-service';
import { createSocialFeedApiService } from '../nostr-api/social-feed-api-service';
import { createSocialNotificationsApiService } from '../nostr-api/social-notifications-api-service';
import { createUserSearchApiService } from '../nostr-api/user-search-api-service';
import { App } from './App';
import { createWindowMapBridge } from './map-bridge';
import { getNostrOverlayQueryClient } from './query/query-client';
import { createOverlayServices, type OverlayServices } from './services/overlay-services';
import { createSocialPublisher } from './social-publisher';
import { cleanLegacyHashRoutePath, overlayRouterBasenameFromPathname } from './legacy-hash-routing';
import './styles.css';

let overlayRoot: Root | null = null;

interface MountNostrOverlayOptions {
    services?: OverlayServices;
}

type OverlayWriteGateway = NonNullable<Parameters<NonNullable<OverlayServices['setWriteGateway']>>[0]>;

function createDeferredWriteGateway(requireWriteGateway: () => OverlayWriteGateway): OverlayWriteGateway {
    return {
        publishEvent: (event) => requireWriteGateway().publishEvent(event),
        publishTextNote: (content, tags) => requireWriteGateway().publishTextNote(content, tags),
        publishProfileMetadata: (content) => requireWriteGateway().publishProfileMetadata(content),
        publishContactList: (follows, preservedTags) => requireWriteGateway().publishContactList(follows, preservedTags),
        publishMuteList: (mutedPubkeys, preservedTags) => requireWriteGateway().publishMuteList(mutedPubkeys, preservedTags),
        encryptDm: (pubkey, plaintext) => requireWriteGateway().encryptDm(pubkey, plaintext),
        decryptDm: (pubkey, ciphertext, scheme) => requireWriteGateway().decryptDm(pubkey, ciphertext, scheme),
    };
}

async function publishSignedEventToRelays(event: NostrEvent, relayUrls: string[]): Promise<PublishResult> {
    const pool = new SimplePool();
    const attempts = await Promise.allSettled(
        pool.publish(relayUrls, event as Parameters<typeof pool.publish>[1])
    );
    pool.close(relayUrls);

    return publishAttemptsToResult(attempts, relayUrls);
}

function publishAttemptsToResult(attempts: PromiseSettledResult<string>[], relayUrls: string[]): PublishResult {
    return attempts.reduce<PublishResult>((result, attempt, index) => {
        const relay = relayUrls[index] ?? '';
        if (attempt.status === 'fulfilled') {
            if (attempt.value.startsWith('connection failure:')) {
                result.failedRelays.push({ relay, reason: attempt.value });
            } else {
                result.ackedRelays.push(relay);
            }
        } else {
            result.failedRelays.push({
                relay,
                reason: attempt.reason instanceof Error ? attempt.reason.message : 'unknown: publish failed',
            });
        }

        return result;
    }, { ackedRelays: [], failedRelays: [], timeoutRelays: [] });
}

function missingWriteGateway(): never {
    throw new Error('Overlay write gateway is not configured');
}

async function loadVerifiedPublicSavedGroupsEvent(input: {
    client: Pick<NostrClient, 'connect' | 'fetchLatestReplaceableEvent'>;
    ownerPubkey: string;
}): Promise<NostrEvent | null> {
    try {
        await input.client.connect();
        const event = await input.client.fetchLatestReplaceableEvent(input.ownerPubkey, PUBLIC_SAVED_GROUPS_KIND);
        return event && isVerifiedPublicSavedGroupsEvent(event, input.ownerPubkey) ? event : null;
    } catch {
        return null;
    }
}

export function createBootstrapOverlayServices(): OverlayServices {
    let getAuthHeaders: ((context: HttpClientAuthContext) => Promise<Record<string, string> | undefined>) | undefined;
    let ownerPubkey: string | undefined;
    let writeGateway: OverlayWriteGateway | undefined;
    let directMessageRelays: { inbox: string[]; outbox: string[] } = { inbox: [], outbox: [] };
    let bootstrapRelaySettings: RelaySettingsState | undefined;

    const client = createHttpClient({
        getAuthHeaders: (context) => getAuthHeaders?.(context),
    });
    const requireWriteGateway = (): OverlayWriteGateway => writeGateway ?? missingWriteGateway();
    const deferredWriteGateway = createDeferredWriteGateway(requireWriteGateway);
    const resolveSocialPublishRelays = (): string[] => {
        const relaySettings = bootstrapRelaySettings ?? loadRelaySettings(ownerPubkey ? { ownerPubkey } : undefined);
        return [
            ...getRelaySetByType(relaySettings, 'nip65Both'),
            ...getRelaySetByType(relaySettings, 'nip65Write'),
        ];
    };
    let runtimeDirectMessagesService: ReturnType<typeof createRuntimeDirectMessagesService> | undefined;
    let runtimeGroupsService: ReturnType<typeof createGroupsRuntimeService> | undefined;
    let runtimeGroupsOwnerPubkey: string | undefined;
    let savedGroupsClient: ReturnType<typeof createLazyNdkClient> | undefined;
    const groupRelayClients = new Map<string, ReturnType<typeof createLazyNdkClient>>();
    const getRuntimeDirectMessagesService = () => {
        runtimeDirectMessagesService ??= createRuntimeDirectMessagesService({
            writeGateway: deferredWriteGateway,
            resolveRelays: () => directMessageRelays,
        });
        return runtimeDirectMessagesService;
    };
    const getRuntimeGroupsService = () => {
        if (!runtimeGroupsService || runtimeGroupsOwnerPubkey !== ownerPubkey) {
            runtimeGroupsOwnerPubkey = ownerPubkey;
            runtimeGroupsService = createGroupsRuntimeService({
                writeGateway: deferredWriteGateway,
                ...(ownerPubkey ? { ownPubkey: ownerPubkey } : {}),
                publishToGroupRelay: publishSignedEventToRelays,
                transport: {
                    fetchRelayInfo: (relay) => fetchNip11RelayInfo(relay),
                    fetchGroupEvents: async (relay, filters) => {
                        const relayClient = createLazyNdkClient({ relays: [relay] });
                        await relayClient.connect();
                        const results = await Promise.all(filters.map((filter) => relayClient.fetchEvents(filter)));
                        return results.flat();
                    },
                },
            });
        }

        return runtimeGroupsService;
    };
    const getSavedGroupsClient = () => {
        savedGroupsClient ??= createLazyNdkClient({ relays: getBootstrapRelays() });
        return savedGroupsClient;
    };
    const getGroupRelayClient = (relay: string) => {
        const existing = groupRelayClients.get(relay);
        if (existing) {
            return existing;
        }

        const nextClient = createLazyNdkClient({ relays: [relay] });
        groupRelayClients.set(relay, nextClient);
        return nextClient;
    };
    const dmApiService = createDmApiService({
        client,
        decryptDm: (pubkey, ciphertext, scheme) => deferredWriteGateway.decryptDm(pubkey, ciphertext, scheme),
        sendDm: async (input) => {
            const sendDm = getRuntimeDirectMessagesService().sendDm;
            if (!sendDm) {
                throw new Error('Direct messages send is unavailable');
            }

            return sendDm(input);
        },
    });

    return createOverlayServices({
        createClient: (relays: string[] = []) => createLazyNdkClient({ relays }),
        authService: createAuthService(),
        graphApiService: createGraphApiService({ client }),
        socialFeedService: createSocialFeedApiService({
            client,
            resolveOwnerPubkey: () => ownerPubkey,
        }),
        socialNotificationsService: createSocialNotificationsApiService({ client }),
        directMessagesService: {
            subscribeInbox(input, onMessage) {
                const apiUnsubscribe = dmApiService.subscribeInbox(input, onMessage);
                return typeof apiUnsubscribe === 'function' ? apiUnsubscribe : () => {};
            },
            ...(dmApiService.sendDm ? { sendDm: dmApiService.sendDm } : {}),
            async loadInitialConversations(input) {
                return dmApiService.loadInitialConversations?.(input) ?? [];
            },
            async loadConversationMessages(input) {
                return dmApiService.loadConversationMessages?.(input) ?? [];
            },
        },
        identityApiService: createIdentityApiService({ client }),
        userSearchApiService: createUserSearchApiService({ client }),
        socialPublisher: createSocialPublisher({
            writeGateway: deferredWriteGateway,
            client,
            resolveOwnerPubkey: () => ownerPubkey,
            resolveRelays: resolveSocialPublishRelays,
        }),
        groupsService: {
            async loadGroups(input) {
                const relayClient = getSavedGroupsClient();
                const savedGroups = await loadVerifiedPublicSavedGroupsEvent({ client: relayClient, ownerPubkey: input.ownerPubkey });
                const saved = savedGroups ? parsePublicSavedGroupsEvent(savedGroups) : [];
                const remembered = loadRememberedGroups({ ownerPubkey: input.ownerPubkey });
                const publicRelayTags = savedGroups ? parsePublicSavedGroupRelaysEvent(savedGroups) : [];
                const relaySettings = loadRelaySettings({ ownerPubkey: input.ownerPubkey });
                const groupRelays = resolveNip29GroupDiscoveryRelays({
                    configuredGroupRelays: relaySettings.byType.groups,
                    savedGroups: [...saved, ...remembered],
                    publicRelayTags,
                });
                const discovered = await discoverNip29GroupsFromRelays({
                    relays: groupRelays,
                    fetchRelayInfo: (relay) => fetchNip11RelayInfo(relay),
                    fetchMetadataEvents: async (relay, author) => {
                        const relayOnlyClient = getGroupRelayClient(relay);
                        await relayOnlyClient.connect();
                        return relayOnlyClient.fetchEvents(author ? { kinds: [GROUP_METADATA_KIND], authors: [author] } : { kinds: [GROUP_METADATA_KIND] });
                    },
                });
                return {
                    saved,
                    remembered,
                    discovered,
                };
            },
            loadGroup: (input) => getRuntimeGroupsService().loadGroup(input.group),
            publishMessage: (input) => getRuntimeGroupsService().publishMessage(input),
            requestJoin: (input) => getRuntimeGroupsService().requestJoin(input),
            requestLeave: (input) => getRuntimeGroupsService().requestLeave(input),
            savePublicGroups: (input) => getRuntimeGroupsService().savePublicGroups(input),
        },
        configureAuthHeaders: (nextGetAuthHeaders) => {
            getAuthHeaders = nextGetAuthHeaders;
        },
        setOwnerPubkey: (nextOwnerPubkey) => {
            ownerPubkey = nextOwnerPubkey;
        },
        setWriteGateway: (nextWriteGateway) => {
            writeGateway = nextWriteGateway;
        },
        setDirectMessageRelays: (nextDirectMessageRelays) => {
            directMessageRelays = nextDirectMessageRelays;
        },
        setBootstrapRelaySettings: (nextBootstrapRelaySettings) => {
            bootstrapRelaySettings = nextBootstrapRelaySettings;
        },
    });
}

export const __bootstrapTestUtils = {
    createDeferredWriteGateway,
    loadVerifiedPublicSavedGroupsEvent,
    publishAttemptsToResult,
    verifiedDiscoveredGroups,
};

export function mountNostrOverlay(win: Window = window, options: MountNostrOverlayOptions = {}): void {
    const container = win.document.getElementById('nostr-overlay-root');
    if (!container) {
        return;
    }

    const cleanLegacyPath = cleanLegacyHashRoutePath(win.location.pathname, win.location.hash);
    if (cleanLegacyPath) {
        win.history.replaceState(win.history.state, '', cleanLegacyPath);
    }

    const bridge = createWindowMapBridge(win);
    const queryClient = getNostrOverlayQueryClient();
    const services = options.services ?? createBootstrapOverlayServices();
    const basename = overlayRouterBasenameFromPathname(win.location.pathname);
    if (!overlayRoot) {
        overlayRoot = createRoot(container);
    }

    overlayRoot.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter {...(basename ? { basename } : {})}>
                    <App mapBridge={bridge} services={services} />
                </BrowserRouter>
            </QueryClientProvider>
        </StrictMode>
    );
}
