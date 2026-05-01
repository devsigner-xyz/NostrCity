import { finalizeEvent, getPublicKey, verifyEvent } from 'nostr-tools/pure';

export interface Nip46TransportEvent {
    kind: number;
    pubkey: string;
    tags: string[][];
    content: string;
    created_at: number;
    id?: string;
    sig?: string;
}

export interface Nip46TransportIo {
    publish(event: Nip46TransportEvent): Promise<void>;
    subscribe(handler: (event: Nip46TransportEvent) => void): () => void;
}

interface Nip46TransportOptions {
    localPubkey: string;
    localSecretKey?: Uint8Array;
    remoteSignerPubkey?: string | undefined;
    timeoutMs?: number;
    now?: () => number;
    classifyResponse: (event: Nip46TransportEvent) => Promise<string | undefined> | string | undefined;
}

interface SendRequestInput {
    requestId: string;
    content: string;
}

interface PendingRequest {
    resolve: (event: Nip46TransportEvent) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 12_000;

function hasPTagForPubkey(event: Nip46TransportEvent, pubkey: string): boolean {
    return event.tags.some((tag) => tag[0] === 'p' && tag[1] === pubkey);
}

export function validateNip46ResponseEvent(
    event: Nip46TransportEvent,
    options: { localPubkey: string; remoteSignerPubkey?: string | undefined }
): void {
    if (event.kind !== 24133) {
        throw new Error('Invalid NIP-46 response event');
    }
    if (options.remoteSignerPubkey && event.pubkey !== options.remoteSignerPubkey) {
        throw new Error('Invalid NIP-46 response event');
    }
    if (!hasPTagForPubkey(event, options.localPubkey)) {
        throw new Error('Invalid NIP-46 response event');
    }
    if (!event.id || !/^[a-f0-9]{64}$/.test(event.id)) {
        throw new Error('Invalid NIP-46 response event');
    }
    if (!event.sig || !/^[a-f0-9]{128}$/.test(event.sig)) {
        throw new Error('Invalid NIP-46 response event');
    }
    if (!verifyEvent(event as Parameters<typeof verifyEvent>[0])) {
        throw new Error('Invalid NIP-46 response event');
    }
}

export function createNip46Transport(io: Nip46TransportIo, options: Nip46TransportOptions) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const localPubkey = options.localSecretKey ? getPublicKey(options.localSecretKey) : options.localPubkey;
    const pending = new Map<string, PendingRequest>();

    const unsubscribe = io.subscribe(async (event) => {
        try {
            validateNip46ResponseEvent(event, {
                localPubkey,
                remoteSignerPubkey: options.remoteSignerPubkey,
            });
        } catch {
            return;
        }

        let responseId: string | undefined;
        try {
            responseId = await options.classifyResponse(event);
        } catch {
            return;
        }

        if (!responseId) {
            return;
        }

        const pendingRequest = pending.get(responseId);
        if (!pendingRequest) {
            return;
        }

        clearTimeout(pendingRequest.timeoutId);
        pending.delete(responseId);
        pendingRequest.resolve(event);
    });

    return {
        async sendRequest(input: SendRequestInput): Promise<Nip46TransportEvent> {
            if (pending.has(input.requestId)) {
                throw new Error(`Duplicate pending NIP-46 request id: ${input.requestId}`);
            }

            return new Promise<Nip46TransportEvent>((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    pending.delete(input.requestId);
                    reject(new Error('NIP-46 request timed out'));
                }, timeoutMs);

                pending.set(input.requestId, { resolve, reject, timeoutId });

                void io
                    .publish(options.localSecretKey ? finalizeEvent({
                        kind: 24133,
                        tags: options.remoteSignerPubkey ? [['p', options.remoteSignerPubkey]] : [],
                        content: input.content,
                        created_at: now(),
                    }, options.localSecretKey) : {
                        kind: 24133,
                        pubkey: localPubkey,
                        tags: options.remoteSignerPubkey ? [['p', options.remoteSignerPubkey]] : [],
                        content: input.content,
                        created_at: now(),
                    })
                    .catch((error) => {
                        const request = pending.get(input.requestId);
                        if (!request) {
                            return;
                        }

                        clearTimeout(request.timeoutId);
                        pending.delete(input.requestId);
                        reject(error instanceof Error ? error : new Error('Failed to publish NIP-46 request'));
                    });
            });
        },

        close(): void {
            unsubscribe();

            for (const [requestId, request] of pending.entries()) {
                clearTimeout(request.timeoutId);
                request.reject(new Error('NIP-46 transport closed'));
                pending.delete(requestId);
            }
        },
    };
}
