import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRuntimeDirectMessagesService } from '../nostr/dm-runtime-service';
import { createLazyNdkClient } from '../nostr/lazy-ndk-client';
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
import './styles.css';

let overlayRoot: Root | null = null;

interface MountNostrOverlayOptions {
    services?: OverlayServices;
}

type OverlayWriteGateway = NonNullable<Parameters<NonNullable<OverlayServices['setWriteGateway']>>[0]>;

function missingWriteGateway(): never {
    throw new Error('Overlay write gateway is not configured');
}

export function createBootstrapOverlayServices(): OverlayServices {
    let getAuthHeaders: ((context: HttpClientAuthContext) => Promise<Record<string, string> | undefined>) | undefined;
    let ownerPubkey: string | undefined;
    let writeGateway: OverlayWriteGateway | undefined;
    let directMessageRelays: { inbox: string[]; outbox: string[] } = { inbox: [], outbox: [] };

    const client = createHttpClient({
        getAuthHeaders: (context) => getAuthHeaders?.(context),
    });
    const requireWriteGateway = (): OverlayWriteGateway => writeGateway ?? missingWriteGateway();
    const deferredWriteGateway: OverlayWriteGateway = {
        publishEvent: (event) => requireWriteGateway().publishEvent(event),
        publishTextNote: (content, tags) => requireWriteGateway().publishTextNote(content, tags),
        publishProfileMetadata: (content) => requireWriteGateway().publishProfileMetadata(content),
        publishContactList: (follows) => requireWriteGateway().publishContactList(follows),
        encryptDm: (pubkey, plaintext) => requireWriteGateway().encryptDm(pubkey, plaintext),
        decryptDm: (pubkey, ciphertext, scheme) => requireWriteGateway().decryptDm(pubkey, ciphertext, scheme),
    };
    let runtimeDirectMessagesService: ReturnType<typeof createRuntimeDirectMessagesService> | undefined;
    const getRuntimeDirectMessagesService = () => {
        runtimeDirectMessagesService ??= createRuntimeDirectMessagesService({
            writeGateway: deferredWriteGateway,
            resolveRelays: () => directMessageRelays,
        });
        return runtimeDirectMessagesService;
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
        }),
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
    });
}

export function mountNostrOverlay(win: Window = window, options: MountNostrOverlayOptions = {}): void {
    const container = win.document.getElementById('nostr-overlay-root');
    if (!container) {
        return;
    }

    const bridge = createWindowMapBridge(win);
    const queryClient = getNostrOverlayQueryClient();
    const services = options.services ?? createBootstrapOverlayServices();
    if (!overlayRoot) {
        overlayRoot = createRoot(container);
    }

    overlayRoot.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <HashRouter>
                    <App mapBridge={bridge} services={services} />
                </HashRouter>
            </QueryClientProvider>
        </StrictMode>
    );
}
