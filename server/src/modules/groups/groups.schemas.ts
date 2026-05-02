export interface RelayGroupsQuery {
  relay: string;
}

export interface GroupSummaryDto {
  relay: string;
  id: string;
  name?: string;
  description?: string;
  picture?: string;
  private: boolean;
  restricted: boolean;
  hidden: boolean;
  closed: boolean;
  metadataVerified: boolean;
}

export interface RelayGroupsResponseDto {
  relay: string;
  verifiedRelaySelf: boolean;
  groups: GroupSummaryDto[];
}

const RELAY_URL_PATTERN = '^wss?://[^\\s]+$';
const GROUP_ID_PATTERN = '^[A-Za-z0-9_-]+$';

export const relayGroupsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['relay'],
  properties: {
    relay: {
      type: 'string',
      minLength: 6,
      maxLength: 512,
      pattern: RELAY_URL_PATTERN,
    },
  },
} as const;

const groupSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'relay',
    'id',
    'private',
    'restricted',
    'hidden',
    'closed',
    'metadataVerified',
  ],
  properties: {
    relay: {
      type: 'string',
      pattern: RELAY_URL_PATTERN,
    },
    id: {
      type: 'string',
      pattern: GROUP_ID_PATTERN,
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 2_000,
    },
    picture: {
      type: 'string',
      minLength: 1,
      maxLength: 2_048,
    },
    private: {
      type: 'boolean',
    },
    restricted: {
      type: 'boolean',
    },
    hidden: {
      type: 'boolean',
    },
    closed: {
      type: 'boolean',
    },
    metadataVerified: {
      type: 'boolean',
    },
  },
} as const;

export const relayGroupsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['relay', 'verifiedRelaySelf', 'groups'],
  properties: {
    relay: {
      type: 'string',
      pattern: RELAY_URL_PATTERN,
    },
    verifiedRelaySelf: {
      type: 'boolean',
    },
    groups: {
      type: 'array',
      items: groupSummarySchema,
    },
  },
} as const;
