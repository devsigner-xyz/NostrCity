import { useNavigate } from 'react-router';
import { SettingsRelaysPage } from '../settings-pages/SettingsRelaysPage';
import { buildRelayDetailPath } from '../../settings/relay-detail-routing';
import { useSettingsRouteContext } from './settings-route-context';
import { useRelaysSettingsController } from './controllers/useRelaysSettingsController';

export function SettingsRelaysRoute() {
    const navigate = useNavigate();
    const {
        ownerPubkey,
        suggestedRelays,
        suggestedRelaysByType,
        relayConnectionProbe,
        relayConnectionRefreshIntervalMs,
    } = useSettingsRouteContext();
    const relays = useRelaysSettingsController({
        ...(ownerPubkey ? { ownerPubkey } : {}),
        ...(suggestedRelays ? { suggestedRelays } : {}),
        ...(suggestedRelaysByType ? { suggestedRelaysByType } : {}),
        ...(relayConnectionProbe ? { relayConnectionProbe } : {}),
        ...(relayConnectionRefreshIntervalMs !== undefined ? { relayConnectionRefreshIntervalMs } : {}),
    });

    return (
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
    );
}
