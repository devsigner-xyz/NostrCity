import type { FastifyPluginAsync } from 'fastify';

const STRHODLER_PUBKEY = '6b636f5b85a4ae125ca4f050628077512cc5a7f4fce780084b52097439fd7d49';

const nip05Document = {
  names: {
    strhodler: STRHODLER_PUBKEY,
  },
  relays: {
    [STRHODLER_PUBKEY]: [
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.primal.net',
      'wss://relay.snort.social',
      'wss://nostr.wine',
      'wss://relay.nostr.band',
      'wss://relay.current.fyi',
      'wss://purplepag.es',
      'wss://relay.nostr.bg',
      'wss://nostr.mom',
      'wss://relayable.org',
      'wss://offchain.pub',
    ],
  },
} as const;

export const nip05WellKnownRoute: FastifyPluginAsync = async (app) => {
  app.options('/.well-known/nostr.json', async (_request, reply) => {
    return reply
      .header('access-control-allow-origin', '*')
      .header('access-control-allow-methods', 'GET,OPTIONS')
      .header('access-control-allow-headers', 'Content-Type,Authorization,X-Request-Id')
      .header('access-control-max-age', '600')
      .code(204)
      .send();
  });

  app.get('/.well-known/nostr.json', async (_request, reply) => {
    return reply
      .header('access-control-allow-origin', '*')
      .type('application/json; charset=utf-8')
      .send(nip05Document);
  });
};
