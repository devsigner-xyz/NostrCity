export type ReadinessCheckName = 'redisRateLimit';
export type ReadinessCheckStatus = 'ok' | 'failed' | 'not_configured';

export type ReadinessChecks = Partial<Record<ReadinessCheckName, () => Promise<void>>>;

export const readinessCheckNames: ReadinessCheckName[] = ['redisRateLimit'];
