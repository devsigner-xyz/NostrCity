import type { PublishResult } from '../nostr/dm-types';
import type { NostrEvent } from '../nostr/types';
import { createHttpClient, type HttpClient } from './http-client';

export type RelayScope = 'social' | 'dm';

export interface SignedNostrEvent extends NostrEvent {
    sig: string;
}

export interface PublishForwardInput {
    event: SignedNostrEvent;
    relayScope: RelayScope;
    relays: string[];
}

export interface PublishForwardApi {
    forward(input: PublishForwardInput): Promise<PublishResult>;
}

interface PublishForwardResponse {
    ackedRelayIndexes: number[];
    failedRelays: Array<{ relayIndex: number; reason: string }>;
    timeoutRelayIndexes: number[];
}

export interface CreatePublishForwardApiOptions {
    client?: HttpClient;
}

export function createPublishForwardApi(options: CreatePublishForwardApiOptions = {}): PublishForwardApi {
    const client = options.client ?? createHttpClient();

    return {
        async forward(input) {
            const response = await client.postJson<PublishForwardResponse>('/publish/forward', {
                includeAuth: true,
                body: {
                    event: input.event,
                    relayScope: input.relayScope,
                    relays: input.relays,
                },
            });
            const relayAt = (relayIndex: number): string | undefined => input.relays[relayIndex];
            return {
                ackedRelays: response.ackedRelayIndexes.flatMap((relayIndex) => {
                    const relay = relayAt(relayIndex);
                    return relay ? [relay] : [];
                }),
                failedRelays: response.failedRelays.flatMap((failure) => {
                    const relay = relayAt(failure.relayIndex);
                    return relay ? [{ relay, reason: failure.reason }] : [];
                }),
                timeoutRelays: response.timeoutRelayIndexes.flatMap((relayIndex) => {
                    const relay = relayAt(relayIndex);
                    return relay ? [relay] : [];
                }),
            };
        },
    };
}
