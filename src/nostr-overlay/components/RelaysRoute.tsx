import { useNavigate } from 'react-router';
import type { RelaySettingsByType, RelaySettingsState } from '../../nostr/relay-settings';
import type { RelayConnectionProbe } from '../hooks/useRelayConnectionSummary';
import { buildRelayDetailPath } from '../settings/relay-detail-routing';
import { useI18n } from '@/i18n/useI18n';
import { SettingsRelaysPage } from './settings-pages/SettingsRelaysPage';
import { useRelaysSettingsController } from './settings-routes/controllers/useRelaysSettingsController';
import { OverlaySurface } from './OverlaySurface';

interface RelaysRouteProps {
    ownerPubkey?: string;
    suggestedRelays?: string[];
    suggestedRelaysByType?: Partial<RelaySettingsByType>;
    relayConnectionProbe?: RelayConnectionProbe;
    relayConnectionRefreshIntervalMs?: number;
    onRelaySettingsChange?: (nextState: RelaySettingsState) => void;
}

export function RelaysRoute({
    ownerPubkey,
    suggestedRelays,
    suggestedRelaysByType,
    relayConnectionProbe,
    relayConnectionRefreshIntervalMs,
    onRelaySettingsChange,
}: RelaysRouteProps) {
    const { t } = useI18n();
    const navigate = useNavigate();
    const relays = useRelaysSettingsController({
        ...(ownerPubkey ? { ownerPubkey } : {}),
        ...(suggestedRelays ? { suggestedRelays } : {}),
        ...(suggestedRelaysByType ? { suggestedRelaysByType } : {}),
        ...(relayConnectionProbe ? { relayConnectionProbe } : {}),
        ...(relayConnectionRefreshIntervalMs !== undefined ? { relayConnectionRefreshIntervalMs } : {}),
        ...(onRelaySettingsChange ? { onRelaySettingsChange } : {}),
    });

    return (
        <OverlaySurface ariaLabel={t('relaysRoute.aria')}>
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="nostr-settings-page nostr-routed-surface-panel nostr-page-layout nostr-settings-page-relays">
                    <SettingsRelaysPage
                        configuredRows={relays.configuredRows}
                        suggestedRows={relays.suggestedRows}
                        dmConfiguredRows={relays.dmConfiguredRows}
                        dmSuggestedRows={relays.dmSuggestedRows}
                        searchConfiguredRows={relays.searchConfiguredRows}
                        searchSuggestedRows={relays.searchSuggestedRows}
                        groupConfiguredRows={relays.groupConfiguredRows}
                        groupSuggestedRows={relays.groupSuggestedRows}
                        connectedConfiguredRelays={relays.connectedConfiguredRelays}
                        disconnectedConfiguredRelays={relays.disconnectedConfiguredRelays}
                        relayInfoByUrl={relays.relayInfoByUrl}
                        configuredRelayConnectionStatusByRelay={relays.configuredRelayConnectionStatusByRelay}
                        relayConnectionStatusByRelay={relays.relayConnectionStatusByRelay}
                        relayTypeLabels={relays.relayTypeLabels}
                        newRelayInput={relays.newRelayInput}
                        newDmRelayInput={relays.newDmRelayInput}
                        newSearchRelayInput={relays.newSearchRelayInput}
                        newGroupRelayInput={relays.newGroupRelayInput}
                        invalidRelayInputs={relays.invalidRelayInputs}
                        invalidDmRelayInputs={relays.invalidDmRelayInputs}
                        invalidSearchRelayInputs={relays.invalidSearchRelayInputs}
                        invalidGroupRelayInputs={relays.invalidGroupRelayInputs}
                        onNewRelayInputChange={relays.onNewRelayInputChange}
                        onNewDmRelayInputChange={relays.onNewDmRelayInputChange}
                        onNewSearchRelayInputChange={relays.onNewSearchRelayInputChange}
                        onNewGroupRelayInputChange={relays.onNewGroupRelayInputChange}
                        onAddRelays={relays.onAddRelays}
                        onOpenRelayDetails={(relayUrl, source, relayType) => {
                            navigate(buildRelayDetailPath({ relayUrl, source, relayType }));
                        }}
                        onRemoveRelay={relays.onRemoveRelay}
                        onSetConfiguredRelayNip65Access={relays.onSetConfiguredRelayNip65Access}
                        onAddSuggestedRelay={relays.onAddSuggestedRelay}
                        onAddAllSuggestedRelays={relays.onAddAllSuggestedRelays}
                        onResetRelaysToDefault={relays.onResetRelaysToDefault}
                        onAddDmRelays={relays.onAddDmRelays}
                        onRemoveDmRelay={relays.onRemoveDmRelay}
                        onAddSuggestedDmRelay={relays.onAddSuggestedDmRelay}
                        onAddAllSuggestedDmRelays={relays.onAddAllSuggestedDmRelays}
                        onResetDmRelaysToDefault={relays.onResetDmRelaysToDefault}
                        onAddGroupRelays={relays.onAddGroupRelays}
                        onRemoveGroupRelay={relays.onRemoveGroupRelay}
                        onAddSuggestedGroupRelay={relays.onAddSuggestedGroupRelay}
                        onAddAllSuggestedGroupRelays={relays.onAddAllSuggestedGroupRelays}
                        onResetGroupRelaysToDefault={relays.onResetGroupRelaysToDefault}
                        onAddSearchRelays={relays.onAddSearchRelays}
                        onRemoveSearchRelay={relays.onRemoveSearchRelay}
                        onAddSuggestedSearchRelay={relays.onAddSuggestedSearchRelay}
                        onAddAllSuggestedSearchRelays={relays.onAddAllSuggestedSearchRelays}
                        onResetSearchRelaysToDefault={relays.onResetSearchRelaysToDefault}
                        onOpenRelayActionsMenu={relays.onOpenRelayActionsMenu}
                        describeRelay={relays.describeRelay}
                        relayAvatarFallback={relays.relayAvatarFallback}
                        relayConnectionBadge={relays.relayConnectionBadge}
                    />
                </div>
            </div>
        </OverlaySurface>
    );
}
