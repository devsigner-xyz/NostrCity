import { beforeEach, describe, expect, test } from 'vitest';
import {
    DEFAULT_ZAP_AMOUNTS,
    ZAP_SETTINGS_STORAGE_KEY,
    addZapAmount,
    loadZapSettings,
    removeZapAmount,
    saveZapSettings,
} from './zap-settings';

describe('zap settings', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test('loads default zap amounts when nothing is stored', () => {
        const state = loadZapSettings();
        expect(state.amounts).toEqual(DEFAULT_ZAP_AMOUNTS);
    });

    test('adds and persists a new zap amount sorted and deduped', () => {
        const next = addZapAmount(loadZapSettings(), 64);
        const saved = saveZapSettings(next);

        expect(saved.amounts).toEqual([21, 64, 128, 256]);
        expect(window.localStorage.getItem(ZAP_SETTINGS_STORAGE_KEY) || '').toContain('64');
    });

    test('removes zap amounts safely', () => {
        const removed = removeZapAmount({ amounts: [21, 256, 333] }, 0);
        expect(removed.amounts).toEqual([256, 333]);
    });

    test('keeps zap settings isolated per owner pubkey', () => {
        const ownerA = 'a'.repeat(64);
        const ownerB = 'b'.repeat(64);

        const savedA = saveZapSettings({ amounts: [34, 55, 89] }, { ownerPubkey: ownerA });
        const loadedA = loadZapSettings({ ownerPubkey: ownerA });
        const loadedB = loadZapSettings({ ownerPubkey: ownerB });

        expect(savedA.amounts).toEqual([34, 55, 89]);
        expect(loadedA.amounts).toEqual([34, 55, 89]);
        expect(loadedB.amounts).toEqual([...DEFAULT_ZAP_AMOUNTS]);
    });

    test('ignores legacy default zap amount from stored settings', () => {
        window.localStorage.setItem(ZAP_SETTINGS_STORAGE_KEY, JSON.stringify({
            amounts: [21, 64, 128],
            defaultAmount: 64,
        }));

        const loaded = loadZapSettings();
        const saved = saveZapSettings(loaded);

        expect(loaded).toEqual({ amounts: [21, 64, 128] });
        expect(saved).toEqual({ amounts: [21, 64, 128] });
        expect(window.localStorage.getItem(ZAP_SETTINGS_STORAGE_KEY) || '').not.toContain('defaultAmount');
    });
});
