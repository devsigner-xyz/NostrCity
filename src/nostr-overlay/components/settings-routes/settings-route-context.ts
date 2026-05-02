import type { RelaySettingsByType } from '../../../nostr/relay-settings';
import type { UiSettingsState } from '../../../nostr/ui-settings';
import type { RelayConnectionProbe } from '../../hooks/useRelayConnectionSummary';
import type { MapBridge } from '../../map-bridge';
import { useOutletContext } from 'react-router';

export interface SettingsRouteContextValue {
    ownerPubkey?: string;
    mapBridge: MapBridge | null;
    suggestedRelays?: string[];
    suggestedRelaysByType?: Partial<RelaySettingsByType>;
    relayConnectionProbe?: RelayConnectionProbe;
    relayConnectionRefreshIntervalMs?: number;
    onUiSettingsChange?: (nextState: UiSettingsState) => void;
    onClose: () => void;
}

export function useSettingsRouteContext(): SettingsRouteContextValue {
    return useOutletContext<SettingsRouteContextValue>();
}
