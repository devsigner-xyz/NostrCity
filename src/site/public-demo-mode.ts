interface PublicDemoModeEnv {
    NOSTR_CITY_PUBLIC_DEMO_MODE?: boolean | string;
}

export function isPublicDemoMode(
    env: PublicDemoModeEnv = import.meta.env as PublicDemoModeEnv,
): boolean {
    const value = String(env.NOSTR_CITY_PUBLIC_DEMO_MODE ?? '').trim().toLowerCase();
    return value === 'true' || value === '1';
}
