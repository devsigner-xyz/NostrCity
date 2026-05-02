type EnvLike = Partial<Record<string, string | undefined>>;

export const isPublicDemoMode = (env: EnvLike = process.env): boolean => {
  const value = env.NOSTR_CITY_PUBLIC_DEMO_MODE?.trim().toLowerCase() ?? '';
  return value === 'true' || value === '1';
};
