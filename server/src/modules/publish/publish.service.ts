import { BlockList, isIP } from 'node:net';

import {
  verifyNip01Event,
  type NostrEventVerifyFailureCode,
  type SignedNostrEvent,
} from '../../nostr/event-verify';
import type {
  PublishForwardRequestDto,
  RelayScope,
} from './publish.schemas';

const FORWARD_TIMEOUT_MS = 4_000;

const SOCIAL_ALLOWED_RELAY_HOSTS = new Set([
  'relay.damus.io',
  'relay.primal.net',
  'nos.lol',
  'relay.nostr.band',
]);

const DM_ALLOWED_RELAY_HOSTS = new Set([
  'relay.damus.io',
  'relay.primal.net',
  'nos.lol',
  'relay.nostr.band',
]);

const SCOPE_POLICY: Record<RelayScope, {
  maxRelays: number;
  allowedKinds: Set<number> | null;
  allowedRelayHosts: Set<string>;
}> = {
  social: {
    maxRelays: 8,
    allowedKinds: new Set([0, 1, 3, 5, 6, 7, 10000, 10002, 10050]),
    allowedRelayHosts: SOCIAL_ALLOWED_RELAY_HOSTS,
  },
  dm: {
    maxRelays: 5,
    allowedKinds: new Set([4, 1059]),
    allowedRelayHosts: DM_ALLOWED_RELAY_HOSTS,
  },
};

const FORBIDDEN_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  'host.docker.internal',
  'gateway.docker.internal',
  'kubernetes',
  'kubernetes.default',
  'kubernetes.default.svc',
  'metadata.google.internal',
  'instance-data',
]);

const PRIVATE_ADDRESS_BLOCKLIST = new BlockList();
PRIVATE_ADDRESS_BLOCKLIST.addSubnet('127.0.0.0', 8, 'ipv4');
PRIVATE_ADDRESS_BLOCKLIST.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_ADDRESS_BLOCKLIST.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_ADDRESS_BLOCKLIST.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE_ADDRESS_BLOCKLIST.addSubnet('169.254.0.0', 16, 'ipv4');
PRIVATE_ADDRESS_BLOCKLIST.addSubnet('0.0.0.0', 8, 'ipv4');
PRIVATE_ADDRESS_BLOCKLIST.addSubnet('100.64.0.0', 10, 'ipv4');
PRIVATE_ADDRESS_BLOCKLIST.addSubnet('198.18.0.0', 15, 'ipv4');
PRIVATE_ADDRESS_BLOCKLIST.addAddress('169.254.169.254', 'ipv4');
PRIVATE_ADDRESS_BLOCKLIST.addAddress('::', 'ipv6');
PRIVATE_ADDRESS_BLOCKLIST.addAddress('::1', 'ipv6');
PRIVATE_ADDRESS_BLOCKLIST.addSubnet('fc00::', 7, 'ipv6');
PRIVATE_ADDRESS_BLOCKLIST.addSubnet('fe80::', 10, 'ipv6');
PRIVATE_ADDRESS_BLOCKLIST.addSubnet('ff00::', 8, 'ipv6');

const normalizeHostname = (hostname: string): string => {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '');
};

const isPrivateOrInternalHost = (hostname: string): boolean => {
  const normalized = normalizeHostname(hostname);
  if (normalized.length === 0) {
    return true;
  }

  if (normalized.includes('%')) {
    return true;
  }

  if (FORBIDDEN_HOSTNAMES.has(normalized) || normalized.endsWith('.local')) {
    return true;
  }

  const ipType = isIP(normalized);
  if (ipType === 0) {
    return false;
  }

  if (ipType === 4) {
    return PRIVATE_ADDRESS_BLOCKLIST.check(normalized, 'ipv4');
  }

  if (PRIVATE_ADDRESS_BLOCKLIST.check(normalized, 'ipv6')) {
    return true;
  }

  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice('::ffff:'.length);
    if (isIP(mappedIpv4) === 4) {
      return PRIVATE_ADDRESS_BLOCKLIST.check(mappedIpv4, 'ipv4');
    }
  }

  return false;
};

const normalizeRelayUrl = (url: string): string | null => {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'wss:') {
    return null;
  }

  if (!parsed.hostname || parsed.username || parsed.password) {
    return null;
  }

  if (parsed.port && parsed.port !== '443') {
    return null;
  }

  if (parsed.pathname && parsed.pathname !== '/') {
    return null;
  }

  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = '/';

  const normalized = parsed.toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
};

const buildRelayPolicyError = (code: PublishForwardValidationErrorCode, message: string) => {
  return {
    ok: false as const,
    error: {
      code,
      message,
    },
  };
};

export type PublishForwardValidationErrorCode =
  | NostrEventVerifyFailureCode
  | 'RELAY_COUNT_EXCEEDED'
  | 'RELAY_DUPLICATE'
  | 'RELAY_URL_INVALID'
  | 'RELAY_URL_PRIVATE'
  | 'RELAY_SCOPE_POLICY_VIOLATION';

export type PublishForwardValidationResult =
  | {
      ok: true;
      value: PublishForwardRequestDto;
    }
  | {
      ok: false;
      error: {
        code: PublishForwardValidationErrorCode;
        message: string;
      };
    };

export interface PublishRelayForwarder {
  publishEvent(relay: string, event: SignedNostrEvent): Promise<'ack' | 'failed' | 'timeout'>;
}

class WsPublishRelayForwarder implements PublishRelayForwarder {
  constructor(private readonly timeoutMs: number) {}

  async publishEvent(relay: string, event: SignedNostrEvent): Promise<'ack' | 'failed' | 'timeout'> {
    const Socket = globalThis.WebSocket;
    if (!Socket) {
      return 'failed';
    }

    return new Promise<'ack' | 'failed' | 'timeout'>((resolve) => {
      const socket = new Socket(relay);
      let settled = false;

      const settle = (result: 'ack' | 'failed' | 'timeout') => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);

        try {
          socket.close();
        } catch {
          // ignore socket close errors
        }

        resolve(result);
      };

      const timeout = setTimeout(() => settle('timeout'), this.timeoutMs);

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify(['EVENT', event]));
      });

      socket.addEventListener('message', (message) => {
        let payload: unknown;

        try {
          payload = JSON.parse(String(message.data));
        } catch {
          return;
        }

        if (
          Array.isArray(payload) &&
          payload[0] === 'OK' &&
          payload[1] === event.id &&
          typeof payload[2] === 'boolean'
        ) {
          settle(payload[2] ? 'ack' : 'failed');
        }
      });

      socket.addEventListener('error', () => {
        settle('failed');
      });

      socket.addEventListener('close', () => {
        settle('failed');
      });
    });
  }
}

export interface PublishService {
  forward(request: PublishForwardRequestDto): Promise<PublishForwardResult>;
}

export interface PublishForwardResult {
  ackedRelays: string[];
  failedRelays: Array<{ relay: string; reason: string }>;
  timeoutRelays: string[];
}

export interface PublishServiceOptions {
  relayForwarder?: PublishRelayForwarder;
}

export const validatePublishForwardRequest = (
  request: PublishForwardRequestDto,
): PublishForwardValidationResult => {
  const eventResult = verifyNip01Event(request.event);
  if (!eventResult.ok) {
    return {
      ok: false,
      error: {
        code: eventResult.code,
        message: eventResult.message,
      },
    };
  }

  const scopePolicy = SCOPE_POLICY[request.relayScope];
  if (scopePolicy.allowedKinds && !scopePolicy.allowedKinds.has(request.event.kind)) {
    return buildRelayPolicyError(
      'RELAY_SCOPE_POLICY_VIOLATION',
      `relayScope ${request.relayScope} does not allow kind ${request.event.kind}`,
    );
  }

  if (request.relays.length > scopePolicy.maxRelays) {
    return buildRelayPolicyError(
      'RELAY_COUNT_EXCEEDED',
      `relays exceeds max allowed (${scopePolicy.maxRelays}) for relayScope ${request.relayScope}`,
    );
  }

  const normalizedRelays: string[] = [];
  const seenRelays = new Set<string>();

  for (const relayUrl of request.relays) {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    if (!normalizedRelayUrl) {
      return buildRelayPolicyError('RELAY_URL_INVALID', 'relay URL is invalid or not wss://');
    }

    const hostname = new URL(normalizedRelayUrl).hostname;
    if (isPrivateOrInternalHost(hostname)) {
      return buildRelayPolicyError('RELAY_URL_PRIVATE', 'relay host is private/internal');
    }

    const normalizedHost = normalizeHostname(hostname);
    if (!scopePolicy.allowedRelayHosts.has(normalizedHost)) {
      return buildRelayPolicyError(
        'RELAY_SCOPE_POLICY_VIOLATION',
        `relay host is not allowed for relayScope ${request.relayScope}`,
      );
    }

    if (seenRelays.has(normalizedRelayUrl)) {
      return buildRelayPolicyError('RELAY_DUPLICATE', 'relay entries must be unique');
    }

    seenRelays.add(normalizedRelayUrl);
    normalizedRelays.push(normalizedRelayUrl);
  }

  return {
    ok: true,
    value: {
      ...request,
      relays: normalizedRelays,
      event: eventResult.event,
    },
  };
};

class PublishForwardService implements PublishService {
  constructor(private readonly relayForwarder: PublishRelayForwarder) {}

  async forward(request: PublishForwardRequestDto): Promise<PublishForwardResult> {
    const ackedRelays: string[] = [];
    const timeoutRelays: string[] = [];
    const failedRelays: Array<{ relay: string; reason: string }> = [];

    const results = await Promise.all(
      request.relays.map(async (relay) => {
        try {
          const result = await this.relayForwarder.publishEvent(relay, request.event);
          return { relay, result, reason: undefined as string | undefined };
        } catch {
          return { relay, result: 'failed' as const, reason: 'connection_error' };
        }
      }),
    );

    for (const result of results) {
      if (result.result === 'ack') {
        ackedRelays.push(result.relay);
        continue;
      }

      if (result.result === 'timeout') {
        timeoutRelays.push(result.relay);
        continue;
      }

      failedRelays.push({
        relay: result.relay,
        reason: result.reason ?? 'publish_failed',
      });
    }

    return {
      ackedRelays,
      failedRelays,
      timeoutRelays,
    };
  }
}

export const createPublishService = (options: PublishServiceOptions = {}): PublishService => {
  const relayForwarder = options.relayForwarder ?? new WsPublishRelayForwarder(FORWARD_TIMEOUT_MS);
  return new PublishForwardService(relayForwarder);
};

export const relayScopePolicies = SCOPE_POLICY;
