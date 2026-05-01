import { canonicalizeGroupAddress, type CanonicalGroupAddress, type GroupAddressInput } from './groups';
import { buildStorageScopeKeys } from './storage-scope';

export const GROUP_REMEMBERED_STORAGE_KEY = 'nostr.overlay.groups.remembered.v1';

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

type GroupAddressLike = GroupAddressInput | string;

interface RememberedStorageInput {
    ownerPubkey: string;
    storage?: StorageLike | null;
}

export function loadRememberedGroups(input: RememberedStorageInput): CanonicalGroupAddress[] {
    const storage = input.storage ?? getDefaultStorage();
    if (!storage) {
        return [];
    }

    const raw = storage.getItem(storageKey(input.ownerPubkey));
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw) as { groups?: unknown };
        if (!Array.isArray(parsed.groups)) {
            return [];
        }

        return dedupeGroups(parsed.groups.flatMap((value) => {
            try {
                return [canonicalizeGroupAddress(value as GroupAddressLike)];
            } catch {
                return [];
            }
        }));
    } catch {
        storage.removeItem(storageKey(input.ownerPubkey));
        return [];
    }
}

export function saveRememberedGroups(input: RememberedStorageInput & { groups: GroupAddressLike[] }): CanonicalGroupAddress[] {
    const storage = input.storage ?? getDefaultStorage();
    const groups = dedupeGroups(input.groups.map((group) => canonicalizeGroupAddress(group)));
    if (!storage) {
        return groups;
    }

    storage.setItem(storageKey(input.ownerPubkey), JSON.stringify({
        groups: groups.map((group) => ({ relay: group.relay, id: group.id })),
    }));
    return groups;
}

export function addRememberedGroup(input: RememberedStorageInput & { group: GroupAddressLike }): CanonicalGroupAddress[] {
    const saveInput: RememberedStorageInput & { groups: GroupAddressLike[] } = {
        ownerPubkey: input.ownerPubkey,
        groups: [...loadRememberedGroups(input), input.group],
    };
    if (input.storage !== undefined) {
        saveInput.storage = input.storage;
    }

    return saveRememberedGroups(saveInput);
}

function storageKey(ownerPubkey: string): string {
    return buildStorageScopeKeys({ baseKey: GROUP_REMEMBERED_STORAGE_KEY, ownerPubkey }).scopedKey;
}

function getDefaultStorage(): StorageLike | null {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.localStorage;
}

function dedupeGroups(groups: CanonicalGroupAddress[]): CanonicalGroupAddress[] {
    const byKey = new Map<string, CanonicalGroupAddress>();
    for (const group of groups) {
        byKey.set(group.key, group);
    }

    return Array.from(byKey.values());
}
