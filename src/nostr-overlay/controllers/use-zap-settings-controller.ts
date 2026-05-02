import { useEffect, useState } from 'react';
import { loadZapSettings, saveZapSettings, type ZapSettingsState } from '../../nostr/zap-settings';

interface UseZapSettingsControllerInput {
    ownerPubkey?: string;
    zapSettings?: ZapSettingsState;
    onZapSettingsChange?: (nextState: ZapSettingsState) => void;
}

interface ZapSettingsController {
    zapSettingsState: ZapSettingsState;
    persistZapSettings: (nextState: ZapSettingsState) => void;
}

export function useZapSettingsController(input: UseZapSettingsControllerInput): ZapSettingsController {
    const { ownerPubkey, zapSettings, onZapSettingsChange } = input;
    const [zapSettingsState, setZapSettingsState] = useState<ZapSettingsState>(() => zapSettings ?? loadZapSettings(
        ownerPubkey ? { ownerPubkey } : undefined
    ));

    useEffect(() => {
        setZapSettingsState(zapSettings ?? loadZapSettings(ownerPubkey ? { ownerPubkey } : undefined));
    }, [ownerPubkey, zapSettings]);

    const persistZapSettings = (nextState: ZapSettingsState): void => {
        const savedState = saveZapSettings(nextState, ownerPubkey ? { ownerPubkey } : undefined);
        setZapSettingsState(savedState);
        onZapSettingsChange?.(savedState);
    };

    return {
        zapSettingsState,
        persistZapSettings,
    };
}
