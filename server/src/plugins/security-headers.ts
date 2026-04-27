import type { FastifyPluginAsync } from 'fastify';

export interface SecurityHeadersOptions {
  isProduction?: boolean;
}

const buildContentSecurityPolicy = (
  options: SecurityHeadersOptions,
): string => {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https: wss:",
    "media-src 'self' https: blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self'",
  ];

  if (options.isProduction) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
};

export const resolveSecurityHeaders = (
  options: SecurityHeadersOptions = {},
): Readonly<Record<string, string>> => {
  const headers: Record<string, string> = {
    'content-security-policy': buildContentSecurityPolicy(options),
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'geolocation=(), microphone=(), camera=()',
  };

  if (options.isProduction) {
    headers['strict-transport-security'] =
      'max-age=31536000; includeSubDomains';
  }

  return headers;
};

const isProductionLikeRuntime = (): boolean => {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.RAILWAY_ENVIRONMENT_NAME === 'production'
  );
};

export const securityHeadersPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (_request, reply) => {
    for (const [name, value] of Object.entries(
      resolveSecurityHeaders({ isProduction: isProductionLikeRuntime() }),
    )) {
      if (!reply.hasHeader(name)) {
        reply.header(name, value);
      }
    }
  });
};

(securityHeadersPlugin as FastifyPluginAsync & { [key: symbol]: boolean })[
  Symbol.for('skip-override')
] = true;
