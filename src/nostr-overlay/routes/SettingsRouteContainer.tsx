import type { RelaySettingsByType } from '../../nostr/relay-settings';
import type { UiSettingsState } from '../../nostr/ui-settings';
import { SettingsPage } from '../components/SettingsPage';
import type { MapBridge } from '../map-bridge';

export interface SettingsRouteContainerProps {
    mapBridge: MapBridge | null;
    suggestedRelays: string[];
    suggestedRelaysByType: Partial<RelaySettingsByType>;
    onUiSettingsChange: (nextState: UiSettingsState) => void;
    ownerPubkey?: string;
    onClose: () => void;
}

export function SettingsRouteContainer({
    mapBridge,
    suggestedRelays,
    suggestedRelaysByType,
    onUiSettingsChange,
    ownerPubkey,
    onClose,
}: SettingsRouteContainerProps) {
    return (
        <SettingsPage
            mapBridge={mapBridge}
            suggestedRelays={suggestedRelays}
            suggestedRelaysByType={suggestedRelaysByType}
            onUiSettingsChange={onUiSettingsChange}
            {...(ownerPubkey ? { ownerPubkey } : {})}
            onClose={onClose}
        />
    );
}
