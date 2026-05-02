import { normalizePublicRelayUrl } from './relay-url-policy';

const SCOPED_READ_RELAYS_LIMIT = 12;

export const SCOPED_READ_RELAY_PATTERN = '^wss:\\/\\/\\S+$';

export function normalizeScopedReadRelaysInput(
  value: string | string[] | undefined,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = [...new Set(
    (Array.isArray(value) ? value : [value])
      .map((entry) => normalizePublicRelayUrl(entry))
      .filter((entry): entry is string => entry !== null),
  )].slice(0, SCOPED_READ_RELAYS_LIMIT);

  return normalized.length > 0 ? normalized : undefined;
}
