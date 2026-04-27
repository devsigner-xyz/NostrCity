type EnvLike = Partial<Record<string, string | undefined>>;

export const isProductionRuntime = (env: EnvLike = process.env): boolean => {
  return env.NODE_ENV === 'production' || env.RAILWAY_ENVIRONMENT_NAME === 'production';
};

const hasNonEmptyValue = (value: string | undefined): boolean => {
  return typeof value === 'string' && value.trim().length > 0;
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
};
