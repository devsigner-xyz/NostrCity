type EnvLike = Partial<Record<string, string | undefined>>;

export const isProductionRuntime = (env: EnvLike = process.env): boolean => {
  const railwayEnvironmentName = env.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase();
  return (
    env.NODE_ENV === 'production'
    || railwayEnvironmentName === 'production'
    || railwayEnvironmentName === 'prod'
  );
};

const hasNonEmptyValue = (value: string | undefined): boolean => {
  return typeof value === 'string' && value.trim().length > 0;
};

const isAcceptAllTrustProxy = (value: string | undefined): boolean => {
  return value?.trim().toLowerCase() === 'true';
};

const isDisabledTrustProxy = (value: string | undefined): boolean => {
  return value?.trim().toLowerCase() === 'false';
};

const isLoopbackTrustProxy = (value: string | undefined): boolean => {
  return value?.trim().toLowerCase() === 'loopback';
};

export const validateProductionSecurityConfig = (env: EnvLike = process.env): void => {
  if (!isProductionRuntime(env)) {
    return;
  }

  const missing: string[] = [];
  if (!hasNonEmptyValue(env.BFF_CORS_ORIGINS)) {
    missing.push('BFF_CORS_ORIGINS');
  }
  if (!hasNonEmptyValue(env.FASTIFY_TRUST_PROXY)) {
    missing.push('FASTIFY_TRUST_PROXY');
  }

  if (missing.length > 0) {
    throw new Error(`Missing production security configuration: ${missing.join(', ')}`);
  }

  if (isAcceptAllTrustProxy(env.FASTIFY_TRUST_PROXY)) {
    throw new Error(
      'FASTIFY_TRUST_PROXY must be bounded in production; use loopback, false, or a comma-separated proxy allowlist instead of true.',
    );
  }

  if (
    hasNonEmptyValue(env.RAILWAY_ENVIRONMENT_NAME)
    && (isDisabledTrustProxy(env.FASTIFY_TRUST_PROXY) || isLoopbackTrustProxy(env.FASTIFY_TRUST_PROXY))
  ) {
    throw new Error(
      'FASTIFY_TRUST_PROXY must be a Railway proxy allowlist in Railway production so request.ip resolves to the client.',
    );
  }
};
