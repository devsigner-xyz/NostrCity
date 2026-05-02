export interface UsersSearchQuery {
  ownerPubkey: string;
  q: string;
  limit: number;
  searchRelays?: string[];
}

export interface UserProfileDto {
  pubkey: string;
  createdAt: number;
  name?: string;
  displayName?: string;
  about?: string;
  nip05?: string;
  picture?: string;
  banner?: string;
  lud16?: string;
}

export interface UsersSearchResponseDto {
  pubkeys: string[];
  profiles: Record<string, UserProfileDto>;
}

const LOWER_HEX_64_PATTERN = '^[0-9a-f]{64}$';

export const usersSearchQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ownerPubkey', 'q', 'limit'],
  properties: {
    ownerPubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    q: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
      pattern: '.*\\S.*',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
    },
    searchRelays: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'string',
        maxLength: 512,
        pattern: '^wss:\\/\\/\\S+$',
      },
    },
  },
} as const;

const userProfileSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pubkey', 'createdAt'],
  properties: {
    pubkey: {
      type: 'string',
      pattern: LOWER_HEX_64_PATTERN,
    },
    createdAt: {
      type: 'integer',
      minimum: 0,
    },
    name: {
      type: 'string',
      maxLength: 128,
    },
    displayName: {
      type: 'string',
      maxLength: 128,
    },
    about: {
      type: 'string',
      maxLength: 2048,
    },
    nip05: {
      type: 'string',
      maxLength: 320,
    },
    picture: {
      type: 'string',
      maxLength: 2048,
    },
    banner: {
      type: 'string',
      maxLength: 2048,
    },
    lud16: {
      type: 'string',
      maxLength: 320,
    },
  },
} as const;

export const usersSearchResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pubkeys', 'profiles'],
  properties: {
    pubkeys: {
      type: 'array',
      items: {
        type: 'string',
        pattern: LOWER_HEX_64_PATTERN,
      },
    },
    profiles: {
      type: 'object',
      patternProperties: {
        [LOWER_HEX_64_PATTERN]: userProfileSchema,
      },
      additionalProperties: false,
    },
  },
} as const;
