import { buildStorageScopeKeys } from './storage-scope';

export const ZAP_SETTINGS_STORAGE_KEY = 'nostr.overlay.zaps.v1';
export const DEFAULT_ZAP_AMOUNTS = [21, 128, 256] as const;

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

interface ZapSettingsPayload {
    amounts?: number[];
}

export interface ZapSettingsState {
    amounts: number[];
}

interface ZapSettingsOptions {
    ownerPubkey?: string;
    storage?: StorageLike | null;
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

function normalizeAmount(value: number): number | null {
    if (!Number.isFinite(value)) {
        return null;
    }

    const normalized = Math.round(value);
    if (normalized < 1 || normalized > 1_000_000) {
        return null;
    }

    return normalized;
}

function normalizeAmounts(values: number[]): number[] {
    const next = values
        .map((value) => normalizeAmount(value))
        .filter((value): value is number => value !== null);

    const deduped = [...new Set(next)].sort((a, b) => a - b);
    return deduped.length > 0 ? deduped : [...DEFAULT_ZAP_AMOUNTS];
}

function resolveStorage(options: ZapSettingsOptions): StorageLike | null {
    return options.storage ?? getDefaultStorage();
}

function parseState(raw: string | null): ZapSettingsState {
    if (!raw) {
        return getDefaultZapSettings();
    }

    try {
        const parsed = JSON.parse(raw) as ZapSettingsPayload;
        if (!parsed || !Array.isArray(parsed.amounts)) {
            return getDefaultZapSettings();
        }

        return {
            amounts: normalizeAmounts(parsed.amounts),
        };
    } catch {
        return getDefaultZapSettings();
    }
}

export function getDefaultZapSettings(): ZapSettingsState {
    return {
        amounts: [...DEFAULT_ZAP_AMOUNTS],
    };
}

export function loadZapSettings(options: ZapSettingsOptions = {}): ZapSettingsState {
    const storage = resolveStorage(options);
    if (!storage) {
        return getDefaultZapSettings();
    }

    const keys = buildStorageScopeKeys(
        options.ownerPubkey === undefined
            ? { baseKey: ZAP_SETTINGS_STORAGE_KEY }
            : {
                baseKey: ZAP_SETTINGS_STORAGE_KEY,
                ownerPubkey: options.ownerPubkey,
            }
    );

    if (!keys.normalizedOwnerPubkey) {
        return parseState(storage.getItem(ZAP_SETTINGS_STORAGE_KEY));
    }

    const scopedRaw = storage.getItem(keys.scopedKey);
    if (scopedRaw !== null) {
        return parseState(scopedRaw);
    }

    const migrationOwner = storage.getItem(keys.legacyMigrationMarkerKey);
    if (migrationOwner) {
        return getDefaultZapSettings();
    }

    const legacy = parseState(storage.getItem(ZAP_SETTINGS_STORAGE_KEY));
    storage.setItem(keys.scopedKey, JSON.stringify(legacy));
    storage.setItem(keys.legacyMigrationMarkerKey, keys.normalizedOwnerPubkey);
    return legacy;
}

export function saveZapSettings(
    state: ZapSettingsState,
    options: ZapSettingsOptions = {}
): ZapSettingsState {
    const nextState: ZapSettingsState = {
        amounts: normalizeAmounts(state.amounts),
    };

    const storage = resolveStorage(options);
    if (!storage) {
        return nextState;
    }

    const keys = buildStorageScopeKeys(
        options.ownerPubkey === undefined
            ? { baseKey: ZAP_SETTINGS_STORAGE_KEY }
            : {
                baseKey: ZAP_SETTINGS_STORAGE_KEY,
                ownerPubkey: options.ownerPubkey,
            }
    );
    const payload: ZapSettingsPayload = {
        amounts: nextState.amounts,
    };

    if (keys.normalizedOwnerPubkey) {
        storage.setItem(keys.scopedKey, JSON.stringify(payload));
    } else {
        storage.setItem(ZAP_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    }

    return nextState;
}

export function addZapAmount(state: ZapSettingsState, amount: number): ZapSettingsState {
    const amounts = normalizeAmounts([...state.amounts, amount]);
    return {
        amounts,
    };
}

export function removeZapAmount(state: ZapSettingsState, index: number): ZapSettingsState {
    if (index < 0 || index >= state.amounts.length) {
        return state;
    }

    const next = [...state.amounts];
    next.splice(index, 1);
    const amounts = normalizeAmounts(next);
    return {
        amounts,
    };
}
