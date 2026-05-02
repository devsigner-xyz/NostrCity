import { BlockList, isIP } from 'node:net';

const FORBIDDEN_RELAY_HOSTNAMES = new Set([
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

const PRIVATE_RELAY_BLOCKLIST = new BlockList();
PRIVATE_RELAY_BLOCKLIST.addSubnet('127.0.0.0', 8, 'ipv4');
PRIVATE_RELAY_BLOCKLIST.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_RELAY_BLOCKLIST.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_RELAY_BLOCKLIST.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE_RELAY_BLOCKLIST.addSubnet('169.254.0.0', 16, 'ipv4');
PRIVATE_RELAY_BLOCKLIST.addSubnet('0.0.0.0', 8, 'ipv4');
PRIVATE_RELAY_BLOCKLIST.addSubnet('100.64.0.0', 10, 'ipv4');
PRIVATE_RELAY_BLOCKLIST.addSubnet('198.18.0.0', 15, 'ipv4');
PRIVATE_RELAY_BLOCKLIST.addAddress('169.254.169.254', 'ipv4');
PRIVATE_RELAY_BLOCKLIST.addAddress('::', 'ipv6');
PRIVATE_RELAY_BLOCKLIST.addAddress('::1', 'ipv6');
PRIVATE_RELAY_BLOCKLIST.addSubnet('fc00::', 7, 'ipv6');
PRIVATE_RELAY_BLOCKLIST.addSubnet('fe80::', 10, 'ipv6');
PRIVATE_RELAY_BLOCKLIST.addSubnet('ff00::', 8, 'ipv6');

export const normalizeRelayHostname = (hostname: string): string => hostname
  .trim()
  .toLowerCase()
  .replace(/^\[/, '')
  .replace(/\]$/, '')
  .replace(/\.$/, '');

export const isPrivateOrInternalRelayHost = (hostname: string): boolean => {
  const normalized = normalizeRelayHostname(hostname);
  if (!normalized || normalized.includes('%')) {
    return true;
  }

  if (FORBIDDEN_RELAY_HOSTNAMES.has(normalized) || normalized.endsWith('.local')) {
    return true;
  }

  const ipType = isIP(normalized);
  if (ipType === 0) {
    return false;
  }

  if (ipType === 4) {
    return PRIVATE_RELAY_BLOCKLIST.check(normalized, 'ipv4');
  }

  if (PRIVATE_RELAY_BLOCKLIST.check(normalized, 'ipv6')) {
    return true;
  }

  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice('::ffff:'.length);
    if (isIP(mappedIpv4) === 4) {
      return PRIVATE_RELAY_BLOCKLIST.check(mappedIpv4, 'ipv4');
    }
  }

  return false;
};

export const normalizePublicRelayUrl = (value: string): string | null => {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
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

  if (isPrivateOrInternalRelayHost(parsed.hostname)) {
    return null;
  }

  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = '/';

  const normalized = parsed.toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
};
