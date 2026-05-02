import type { RelaySettingsByType } from '../../nostr/relay-settings';
import type { UiSettingsState } from '../../nostr/ui-settings';
import type { RelayConnectionProbe } from '../hooks/useRelayConnectionSummary';
import type { MapBridge } from '../map-bridge';
import { OverlaySettingsLayout } from './settings-routes/OverlaySettingsLayout';

export interface SettingsPageProps {
    ownerPubkey?: string;
    mapBridge: MapBridge | null;
    suggestedRelays?: string[];
    suggestedRelaysByType?: Partial<RelaySettingsByType>;
    relayConnectionProbe?: RelayConnectionProbe;
    relayConnectionRefreshIntervalMs?: number;
    onUiSettingsChange?: (nextState: UiSettingsState) => void;
    onClose: () => void;
}

export function SettingsPage(props: SettingsPageProps) {
    return <OverlaySettingsLayout {...props} />;
}
