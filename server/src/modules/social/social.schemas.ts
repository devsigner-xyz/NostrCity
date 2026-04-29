export interface FollowingFeedQuery {
  ownerPubkey: string;
  limit: number;
  until: number;
  hashtag?: string;
}

export interface ArticlesFeedQuery {
  ownerPubkey: string;
  limit: number;
  until: number;
}

export interface ArticleParams {
  eventId: string;
}

export interface ThreadParams {
  rootEventId: string;
}

export interface ThreadQuery {
  limit: number;
  until: number;
}

export interface EngagementBody {
  eventIds: string[];
  until?: number;
}

export interface ViewerReactionsBody {
  ownerPubkey: string;
  eventIds: string[];
}

export interface ViewerZapsBody {
  ownerPubkey: string;
  eventIds: string[];
}

export interface ViewerRepliesBody {
  ownerPubkey: string;
  eventIds: string[];
}

export interface SocialEventDto {
  id: string;
  pubkey: string;
  kind: number;
  createdAt: number;
  content: string;
  tags: string[][];
  sig?: string;
}

export interface FollowingFeedResponseDto {
  items: SocialEventDto[];
  hasMore: boolean;
  nextUntil: number | null;
}

export interface ArticleResponseDto {
  event: SocialEventDto | null;
}

export interface ThreadResponseDto {
  root: SocialEventDto | null;
  replies: SocialEventDto[];
  hasMore: boolean;
  nextUntil: number | null;
}

export interface EngagementTotalsDto {
  replies: number;
  reposts: number;
  reactions: number;
  zaps: number;
  zapSats: number;
}

export interface EngagementResponseDto {
  byEventId: Record<string, EngagementTotalsDto>;
}

export interface ViewerReactionDto {
  eventId: string;
  reactionEventId: string;
  emoji: string;
  createdAt: number;
}

export interface ViewerReactionsResponseDto {
  byEventId: Record<string, ViewerReactionDto>;
}

export interface ViewerZapDto {
  eventId: string;
  zapReceiptEventId: string;
  amountSats: number;
  createdAt: number;
}

export interface ViewerZapsResponseDto {
  byEventId: Record<string, ViewerZapDto>;
}

export interface ViewerReplyDto {
  eventId: string;
  replyEventId: string;
  createdAt: number;
}

export interface ViewerRepliesResponseDto {
  byEventId: Record<string, ViewerReplyDto>;
}

const LOWER_HEX_64_PATTERN = '^[0-9a-f]{64}$';
const MAX_ENGAGEMENT_EVENT_IDS = 100;
const MAX_UNTIL = 2_147_483_647;

export const followingFeedQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ownerPubkey', 'limit', 'until'],
  properties: {
    ownerPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
    },
    until: {
      type: 'integer',
      minimum: 0,
    },
    hashtag: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
  },
} as const;

export const articlesFeedQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ownerPubkey', 'limit', 'until'],
  properties: {
    ownerPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
    },
    until: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const articleParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['eventId'],
  properties: {
    eventId: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
  },
} as const;

export const threadParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['rootEventId'],
  properties: {
    rootEventId: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
  },
} as const;

export const threadQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['limit', 'until'],
  properties: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
    },
    until: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const engagementBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['eventIds'],
  properties: {
    eventIds: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_ENGAGEMENT_EVENT_IDS,
      items: {
        type: 'string',
        pattern: LOWER_HEX_64_PATTERN,
      },
    },
    until: {
      type: 'integer',
      minimum: 0,
      maximum: MAX_UNTIL,
    },
  },
} as const;

const socialTagSchema = {
  type: 'array',
  items: {
    type: 'string',
  },
} as const;

export const socialEventSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'pubkey', 'kind', 'createdAt', 'content', 'tags'],
  properties: {
    id: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    pubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    kind: {
      type: 'integer',
      minimum: 0,
    },
    createdAt: {
      type: 'integer',
      minimum: 0,
    },
    content: {
      type: 'string',
    },
    sig: {
      type: 'string',
      pattern: '^[0-9a-f]{128}$',
    },
    tags: {
      type: 'array',
      items: socialTagSchema,
    },
  },
} as const;

export const followingFeedResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'hasMore', 'nextUntil'],
  properties: {
    items: {
      type: 'array',
      items: socialEventSchema,
    },
    hasMore: {
      type: 'boolean',
    },
    nextUntil: {
      type: ['integer', 'null'],
      minimum: 0,
    },
  },
} as const;

export const articleResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['event'],
  properties: {
    event: {
      anyOf: [socialEventSchema, { type: 'null' }],
    },
  },
} as const;

export const threadResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['root', 'replies', 'hasMore', 'nextUntil'],
  properties: {
    root: {
      anyOf: [socialEventSchema, { type: 'null' }],
    },
    replies: {
      type: 'array',
      items: socialEventSchema,
    },
    hasMore: {
      type: 'boolean',
    },
    nextUntil: {
      type: ['integer', 'null'],
      minimum: 0,
    },
  },
} as const;

const engagementTotalsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['replies', 'reposts', 'reactions', 'zaps', 'zapSats'],
  properties: {
    replies: {
      type: 'integer',
      minimum: 0,
    },
    reposts: {
      type: 'integer',
      minimum: 0,
    },
    reactions: {
      type: 'integer',
      minimum: 0,
    },
    zaps: {
      type: 'integer',
      minimum: 0,
    },
    zapSats: {
      type: 'integer',
      minimum: 0,
    },
  },
} as const;

export const engagementResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['byEventId'],
  properties: {
    byEventId: {
      type: 'object',
      patternProperties: {
        [LOWER_HEX_64_PATTERN]: engagementTotalsSchema,
      },
      additionalProperties: false,
    },
  },
} as const;

export const viewerReactionsBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ownerPubkey', 'eventIds'],
  properties: {
    ownerPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    eventIds: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_ENGAGEMENT_EVENT_IDS,
      items: {
        type: 'string',
        pattern: LOWER_HEX_64_PATTERN,
      },
    },
  },
} as const;

export const viewerZapsBodySchema = viewerReactionsBodySchema;
export const viewerRepliesBodySchema = viewerReactionsBodySchema;

const viewerReactionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['eventId', 'reactionEventId', 'emoji', 'createdAt'],
  properties: {
    eventId: { type: 'string', pattern: LOWER_HEX_64_PATTERN },
    reactionEventId: { type: 'string', pattern: LOWER_HEX_64_PATTERN },
    emoji: { type: 'string', minLength: 1 },
    createdAt: { type: 'integer', minimum: 0 },
  },
} as const;

export const viewerReactionsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['byEventId'],
  properties: {
    byEventId: {
      type: 'object',
      patternProperties: {
        [LOWER_HEX_64_PATTERN]: viewerReactionSchema,
      },
      additionalProperties: false,
    },
  },
} as const;

const viewerZapSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['eventId', 'zapReceiptEventId', 'amountSats', 'createdAt'],
  properties: {
    eventId: { type: 'string', pattern: LOWER_HEX_64_PATTERN },
    zapReceiptEventId: { type: 'string', pattern: LOWER_HEX_64_PATTERN },
    amountSats: { type: 'integer', minimum: 0 },
    createdAt: { type: 'integer', minimum: 0 },
  },
} as const;

export const viewerZapsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['byEventId'],
  properties: {
    byEventId: {
      type: 'object',
      patternProperties: {
        [LOWER_HEX_64_PATTERN]: viewerZapSchema,
      },
      additionalProperties: false,
    },
  },
} as const;

const viewerReplySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['eventId', 'replyEventId', 'createdAt'],
  properties: {
    eventId: { type: 'string', pattern: LOWER_HEX_64_PATTERN },
    replyEventId: { type: 'string', pattern: LOWER_HEX_64_PATTERN },
    createdAt: { type: 'integer', minimum: 0 },
  },
} as const;

export const viewerRepliesResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['byEventId'],
  properties: {
    byEventId: {
      type: 'object',
      patternProperties: {
        [LOWER_HEX_64_PATTERN]: viewerReplySchema,
      },
      additionalProperties: false,
    },
  },
} as const;
