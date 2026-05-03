import { getEventHash, verifyEvent } from 'nostr-tools';

const REQUIRED_EVENT_KEYS = ['content', 'created_at', 'id', 'kind', 'pubkey', 'sig', 'tags'] as const;
const MAX_EVENT_CONTENT_LENGTH = 32_768;
const MAX_EVENT_TAGS = 128;
const MAX_CONTACT_LIST_TAGS = 4096;
const MAX_TAG_ITEMS = 16;
const MAX_TAG_ITEM_LENGTH = 512;

const isLowerHex = (value: string, length: number): boolean => {
  return value.length === length && /^[0-9a-f]+$/.test(value);
};

const isValidTags = (value: unknown, maxTags: number): value is string[][] => {
  return (
    Array.isArray(value) &&
    value.length <= maxTags &&
    value.every(
      (tag) =>
        Array.isArray(tag) &&
        tag.length <= MAX_TAG_ITEMS &&
        tag.every((item) => typeof item === 'string' && item.length <= MAX_TAG_ITEM_LENGTH),
    )
  );
};

const hasRequiredEventShape = (value: unknown): value is SignedNostrEvent => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const event = value as Partial<SignedNostrEvent>;
  const kind = event.kind;
  const createdAt = event.created_at;
  const keys = Object.keys(event);
  if (keys.length !== REQUIRED_EVENT_KEYS.length) {
    return false;
  }

  for (const key of REQUIRED_EVENT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(event, key)) {
      return false;
    }
  }

  if (
    typeof event.id !== 'string' ||
    typeof event.pubkey !== 'string' ||
    typeof event.sig !== 'string' ||
    typeof event.content !== 'string' ||
    event.content.length > MAX_EVENT_CONTENT_LENGTH ||
    typeof kind !== 'number' ||
    typeof createdAt !== 'number' ||
    !Number.isInteger(kind) ||
    !Number.isInteger(createdAt) ||
    kind < 0 ||
    createdAt < 0
  ) {
    return false;
  }

  const maxTags = kind === 3 ? MAX_CONTACT_LIST_TAGS : MAX_EVENT_TAGS;
  if (!isValidTags(event.tags, maxTags)) {
    return false;
  }

  return true;
};

export interface SignedNostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export type NostrEventVerifyFailureCode =
  | 'EVENT_SHAPE_INVALID'
  | 'EVENT_ID_INVALID'
  | 'EVENT_SIG_INVALID';

export type NostrEventVerifyResult =
  | {
      ok: true;
      event: SignedNostrEvent;
    }
  | {
      ok: false;
      code: NostrEventVerifyFailureCode;
      message: string;
    };

export const verifyNip01Event = (value: unknown): NostrEventVerifyResult => {
  if (!hasRequiredEventShape(value)) {
    return {
      ok: false,
      code: 'EVENT_SHAPE_INVALID',
      message: 'event must match NIP-01 shape',
    };
  }

  if (!isLowerHex(value.id, 64) || !isLowerHex(value.pubkey, 64) || !isLowerHex(value.sig, 128)) {
    return {
      ok: false,
      code: 'EVENT_SHAPE_INVALID',
      message: 'event id/pubkey/sig must be lowercase hex',
    };
  }

  const expectedId = getEventHash({
    pubkey: value.pubkey,
    created_at: value.created_at,
    kind: value.kind,
    tags: value.tags,
    content: value.content,
  });

  if (value.id !== expectedId) {
    return {
      ok: false,
      code: 'EVENT_ID_INVALID',
      message: 'event.id does not match NIP-01 hash',
    };
  }

  if (!verifyEvent(value)) {
    return {
      ok: false,
      code: 'EVENT_SIG_INVALID',
      message: 'event.sig is invalid for event.pubkey',
    };
  }

  return {
    ok: true,
    event: value,
  };
};
