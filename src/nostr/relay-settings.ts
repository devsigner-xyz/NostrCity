import { getBootstrapRelays, mergeRelaySets, normalizeRelayUrl } from './relay-policy';
import { buildStorageScopeKeys } from './storage-scope';

export const RELAY_SETTINGS_STORAGE_KEY = 'nostr.overlay.relays.v1';

export const DEFAULT_SEARCH_RELAYS = [
    'wss://search.nos.today',
    'wss://relay.noswhere.com',
    'wss://filter.nostr.wine',
];

export const DEFAULT_GROUP_RELAYS = [
    'wss://groups.fiatjaf.com',
    'wss://groups.0xchat.com',
    'wss://relay.groups.nip29.com',
    'wss://groups.hzrd149.com',
    'wss://pyramid.fiatjaf.com',
];

export const RELAY_TYPES = ['nip65Both', 'nip65Read', 'nip65Write', 'dmInbox', 'search', 'groups'] as const;
export type RelayType = (typeof RELAY_TYPES)[number];

export interface RelaySettingsByType {
    nip65Both: string[];
    nip65Read: string[];
    nip65Write: string[];
    dmInbox: string[];
    search: string[];
    groups: string[];
}

interface LegacyRelaySettingsByType {
    general?: string[];
    dmInbox?: string[];
    dmOutbox?: string[];
}

interface RelaySettingsPayload {
    relays: string[];
    byType?: Partial<Record<RelayType, string[]>> | LegacyRelaySettingsByType;
}

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

interface RelaySettingsOptions {
    ownerPubkey?: string;
    storage?: StorageLike | null;
}

type RelaySettingsInput = StorageLike | null | undefined | RelaySettingsOptions;

export interface RelaySettingsState {
    relays: string[];
    byType: RelaySettingsByType;
}

const DEFAULT_DM_INBOX_RELAYS = [
    'wss://relay.snort.social',
    'wss://temp.iris.to',
    'wss://vault.iris.to',
];

function removeRelayFromNip65Sets(byType: RelaySettingsByType, relayUrl: string): RelaySettingsByType {
    return {
        ...byType,
        nip65Both: byType.nip65Both.filter((relay) => relay !== relayUrl),
        nip65Read: byType.nip65Read.filter((relay) => relay !== relayUrl),
        nip65Write: byType.nip65Write.filter((relay) => relay !== relayUrl),
    };
}

function getDefaultStorage(): StorageLike | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function resolveOptions(input?: RelaySettingsInput): RelaySettingsOptions {
    if (!input) {
        return {};
    }

    if (typeof (input as StorageLike).getItem === 'function') {
        return { storage: input as StorageLike | null };
    }

    return input as RelaySettingsOptions;
}

function normalizeRelayList(relays: string[]): string[] {
    return mergeRelaySets(relays);
}

function isLegacyByType(byType: Partial<Record<RelayType, string[]>> | LegacyRelaySettingsByType): byType is LegacyRelaySettingsByType {
    return 'general' in byType
        || 'dmOutbox' in byType
        || (!('nip65Both' in byType) && !('nip65Read' in byType) && !('nip65Write' in byType) && !('search' in byType) && !('groups' in byType));
}

function normalizeByType(byType: Partial<Record<RelayType, string[]>> | LegacyRelaySettingsByType): RelaySettingsByType {
    const legacy = isLegacyByType(byType) ? byType : undefined;
    const typed = legacy ? {} : byType as Partial<Record<RelayType, string[]>>;

    return {
        nip65Both: normalizeRelayList(typed.nip65Both ?? legacy?.general ?? []),
        nip65Read: normalizeRelayList(typed.nip65Read ?? legacy?.dmInbox ?? []),
        nip65Write: normalizeRelayList(typed.nip65Write ?? legacy?.dmOutbox ?? []),
        dmInbox: normalizeRelayList(typed.dmInbox ?? []),
        search: normalizeRelayList(typed.search ?? DEFAULT_SEARCH_RELAYS),
        groups: normalizeRelayList(typed.groups ?? []),
    };
}

function buildAllRelays(byType: RelaySettingsByType): string[] {
    return mergeRelaySets(byType.nip65Both, byType.nip65Read, byType.nip65Write, byType.dmInbox);
}

function normalizeRelayState(state: RelaySettingsState): RelaySettingsState {
    const byType = normalizeByType(state.byType);
    return {
        byType,
        relays: buildAllRelays(byType),
    };
}

function isRelaySettingsPayload(value: unknown): value is RelaySettingsPayload {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const payload = value as Partial<RelaySettingsPayload>;
    const hasRelays = Array.isArray(payload.relays) && payload.relays.every((relay) => typeof relay === 'string');
    if (!hasRelays) {
        return false;
    }

    if (!payload.byType || typeof payload.byType !== 'object' || Array.isArray(payload.byType)) {
        return true;
    }

    const byType = payload.byType as Record<string, unknown>;
    return Object.values(byType).every(
        (set) => set === undefined || (Array.isArray(set) && set.every((relay) => typeof relay === 'string'))
    );
}

function parseRelaySettings(raw: string | null): RelaySettingsState | null {
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!isRelaySettingsPayload(parsed)) {
            return null;
        }

        const payload = parsed as RelaySettingsPayload;
        if (payload.byType) {
            return normalizeRelayState({
                relays: normalizeRelayList(payload.relays),
                byType: normalizeByType(payload.byType),
            });
        }

        const defaults = getDefaultRelaySettings().byType;
        const legacyByType = normalizeByType({
            nip65Both: payload.relays,
            nip65Read: defaults.nip65Read,
            nip65Write: defaults.nip65Write,
            dmInbox: defaults.dmInbox,
        });
        return {
            relays: buildAllRelays(legacyByType),
            byType: legacyByType,
        };
    } catch {
        return null;
    }
}

export function getDefaultRelaySettings(): RelaySettingsState {
    const bootstrap = getBootstrapRelays();
    const byType = normalizeByType({
        nip65Both: bootstrap,
        nip65Read: bootstrap,
            nip65Write: bootstrap,
            dmInbox: DEFAULT_DM_INBOX_RELAYS,
            search: [...DEFAULT_SEARCH_RELAYS],
            groups: [],
        });

    return {
        relays: buildAllRelays(byType),
        byType,
    };
}

export function getDefaultDmInboxRelays(): string[] {
    return [...DEFAULT_DM_INBOX_RELAYS];
}

export function getRelaySetByType(state: RelaySettingsState, relayType: RelayType): string[] {
    return state.byType[relayType] ?? [];
}

export function loadRelaySettings(input?: RelaySettingsInput): RelaySettingsState {
    const options = resolveOptions(input);
    const storage = options.storage ?? getDefaultStorage();
    if (!storage) {
        return getDefaultRelaySettings();
    }

    const keys = buildStorageScopeKeys(
        options.ownerPubkey === undefined
            ? { baseKey: RELAY_SETTINGS_STORAGE_KEY }
            : {
                baseKey: RELAY_SETTINGS_STORAGE_KEY,
                ownerPubkey: options.ownerPubkey,
            }
    );

    if (!keys.normalizedOwnerPubkey) {
        return parseRelaySettings(storage.getItem(RELAY_SETTINGS_STORAGE_KEY)) ?? getDefaultRelaySettings();
    }

    const scopedRaw = storage.getItem(keys.scopedKey);
    if (scopedRaw !== null) {
        return parseRelaySettings(scopedRaw) ?? getDefaultRelaySettings();
    }

    const migrationOwner = storage.getItem(keys.legacyMigrationMarkerKey);
    if (migrationOwner) {
        return getDefaultRelaySettings();
    }

    const legacy = parseRelaySettings(storage.getItem(RELAY_SETTINGS_STORAGE_KEY)) ?? getDefaultRelaySettings();
    storage.setItem(keys.scopedKey, JSON.stringify({
        relays: legacy.relays,
        byType: legacy.byType,
    }));
    storage.setItem(keys.legacyMigrationMarkerKey, keys.normalizedOwnerPubkey);
    return legacy;
}

export function saveRelaySettings(
    state: RelaySettingsState,
    input?: RelaySettingsInput
): RelaySettingsState {
    const options = resolveOptions(input);
    const nextState = normalizeRelayState(state);
    const storage = options.storage ?? getDefaultStorage();
    if (!storage) {
        return nextState;
    }

    const keys = buildStorageScopeKeys(
        options.ownerPubkey === undefined
            ? { baseKey: RELAY_SETTINGS_STORAGE_KEY }
            : {
                baseKey: RELAY_SETTINGS_STORAGE_KEY,
                ownerPubkey: options.ownerPubkey,
            }
    );

    const payload: RelaySettingsPayload = {
        relays: nextState.relays,
        byType: nextState.byType,
    };

    if (keys.normalizedOwnerPubkey) {
        storage.setItem(keys.scopedKey, JSON.stringify(payload));
    } else {
        storage.setItem(RELAY_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    }

    return nextState;
}

export function addRelay(state: RelaySettingsState, relayUrl: string, relayType: RelayType = 'nip65Both'): RelaySettingsState {
    const normalized = normalizeRelayUrl(relayUrl);
    if (!normalized) {
        return state;
    }

    const byType = normalizeByType({
        ...state.byType,
        [relayType]: [...(state.byType[relayType] ?? []), normalized],
    });

    return {
        byType,
        relays: buildAllRelays(byType),
    };
}

export function setRelayNip65Access(
    state: RelaySettingsState,
    relayUrl: string,
    access: { read: boolean; write: boolean }
): RelaySettingsState {
    const normalized = normalizeRelayUrl(relayUrl);
    if (!normalized) {
        return state;
    }

    const existsInNip65 = [state.byType.nip65Both, state.byType.nip65Read, state.byType.nip65Write].some((set) =>
        set.includes(normalized)
    );
    if (!existsInNip65) {
        return state;
    }

    const byType = removeRelayFromNip65Sets(state.byType, normalized);

    if (access.read && access.write) {
        byType.nip65Both = [...byType.nip65Both, normalized];
    } else if (access.read) {
        byType.nip65Read = [...byType.nip65Read, normalized];
    } else if (access.write) {
        byType.nip65Write = [...byType.nip65Write, normalized];
    }

    const normalizedByType = normalizeByType(byType);

    return {
        byType: normalizedByType,
        relays: buildAllRelays(normalizedByType),
    };
}

export function removeRelay(state: RelaySettingsState, relayUrl: string, relayType?: RelayType): RelaySettingsState {
    const normalized = normalizeRelayUrl(relayUrl);
    if (!normalized) {
        return state;
    }

    if (relayType) {
        const byType = normalizeByType({
            ...state.byType,
            [relayType]: (state.byType[relayType] ?? []).filter((relay) => relay !== normalized),
        });
        return {
            byType,
            relays: buildAllRelays(byType),
        };
    }

    const byType = normalizeByType({
        nip65Both: state.byType.nip65Both.filter((relay) => relay !== normalized),
        nip65Read: state.byType.nip65Read.filter((relay) => relay !== normalized),
        nip65Write: state.byType.nip65Write.filter((relay) => relay !== normalized),
        dmInbox: state.byType.dmInbox.filter((relay) => relay !== normalized),
        search: state.byType.search.filter((relay) => relay !== normalized),
        groups: state.byType.groups ?? [],
    });

    return {
        byType,
        relays: buildAllRelays(byType),
    };
}
