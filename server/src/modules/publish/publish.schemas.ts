import type { SignedNostrEvent } from '../../nostr/event-verify';

export const relayScopes = ['social', 'dm'] as const;

export type RelayScope = (typeof relayScopes)[number];

export interface PublishForwardRequestDto {
  event: SignedNostrEvent;
  relayScope: RelayScope;
  relays: string[];
}

export interface PublishForwardFailure {
  relayIndex: number;
  reason: string;
}

export interface PublishForwardResponseDto {
  ackedRelayIndexes: number[];
  failedRelays: PublishForwardFailure[];
  timeoutRelayIndexes: number[];
}

export const publishForwardBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['event', 'relayScope', 'relays'],
  properties: {
    event: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig'],
      properties: {
        id: {
          type: 'string',
          pattern: '^[0-9a-f]{64}$',
          minLength: 64,
          maxLength: 64,
        },
        pubkey: {
          type: 'string',
          pattern: '^[0-9a-f]{64}$',
          minLength: 64,
          maxLength: 64,
        },
        created_at: {
          type: 'integer',
          minimum: 0,
        },
        kind: {
          type: 'integer',
          minimum: 0,
        },
        tags: {
          type: 'array',
          items: {
            type: 'array',
            maxItems: 16,
            items: {
              type: 'string',
              maxLength: 512,
            },
          },
        },
        content: {
          type: 'string',
          maxLength: 32768,
        },
        sig: {
          type: 'string',
          pattern: '^[0-9a-f]{128}$',
          minLength: 128,
          maxLength: 128,
        },
      },
      allOf: [
        {
          if: {
            required: ['kind'],
            properties: {
              kind: { const: 3 },
            },
          },
          then: {
            properties: {
              tags: { type: 'array', maxItems: 4096 },
            },
          },
          else: {
            properties: {
              tags: { type: 'array', maxItems: 128 },
            },
          },
        },
      ],
    },
    relayScope: {
      type: 'string',
      enum: relayScopes,
    },
    relays: {
      type: 'array',
      minItems: 1,
      maxItems: 32,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 2048,
      },
    },
  },
} as const;

export const publishForwardResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ackedRelayIndexes', 'failedRelays', 'timeoutRelayIndexes'],
  properties: {
    ackedRelayIndexes: {
      type: 'array',
      items: {
        type: 'integer',
        minimum: 0,
      },
    },
    failedRelays: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['relayIndex', 'reason'],
        properties: {
          relayIndex: {
            type: 'integer',
            minimum: 0,
          },
          reason: {
            type: 'string',
          },
        },
      },
    },
    timeoutRelayIndexes: {
      type: 'array',
      items: {
        type: 'integer',
        minimum: 0,
      },
    },
  },
} as const;
