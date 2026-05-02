import type { MouseEvent } from 'react';
import type { RelayType } from '../../../nostr/relay-settings';
import type { RelayConnectionStatus } from '../../hooks/useRelayConnectionSummary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n/useI18n';
import { EllipsisVerticalIcon } from 'lucide-react';
import type { RelayInformationDocument, RelayRow, RelaySource } from './types';

interface SettingsRelayMobileListProps {
    rows: RelayRow[];
    source: RelaySource;
    relayInfoByUrl: Record<string, { data?: RelayInformationDocument }>;
    relayConnectionStatusByRelay: Record<string, RelayConnectionStatus | undefined>;
    relayTypeLabels: Record<RelayType, string>;
    onOpenRelayDetails: (relayUrl: string, source: RelaySource, relayType: RelayType) => void;
    onRemoveRelay?: (relayUrl: string) => void;
    onAddSuggestedRelay?: (relayUrl: string, relayTypes: RelayType[]) => void;
    onSetConfiguredRelayNip65Access?: (relayUrl: string, access: { read: boolean; write: boolean }) => void;
    onOpenRelayActionsMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function compactRelayTypes(relayTypes: RelayType[]): RelayType[] {
    if (relayTypes.includes('search')) {
        return ['search'];
    }

    const hasBoth = relayTypes.includes('nip65Both');
    const hasRead = relayTypes.includes('nip65Read');
    const hasWrite = relayTypes.includes('nip65Write');
    const hasDmInbox = relayTypes.includes('dmInbox');
    const hasGroups = relayTypes.includes('groups');

    const compacted: RelayType[] = [];
    if (hasBoth || (hasRead && hasWrite)) {
        compacted.push('nip65Both');
    } else if (hasRead) {
        compacted.push('nip65Read');
    } else if (hasWrite) {
        compacted.push('nip65Write');
    }

    if (hasDmInbox) {
        compacted.push('dmInbox');
    }

    if (hasGroups) {
        compacted.push('groups');
    }

    return compacted;
}

export function hasNip65ReadAccess(relayTypes: RelayType[]): boolean {
    return relayTypes.includes('nip65Both') || relayTypes.includes('nip65Read');
}

export function hasNip65WriteAccess(relayTypes: RelayType[]): boolean {
    return relayTypes.includes('nip65Both') || relayTypes.includes('nip65Write');
}

export function formatRelayDisplayUrl(relayUrl: string): string {
    return relayUrl.replace(/^wss?:\/\//i, '');
}

export function SettingsRelayMobileList({
    rows,
    source,
    relayInfoByUrl,
    relayConnectionStatusByRelay,
    relayTypeLabels,
    onOpenRelayDetails,
    onRemoveRelay,
    onAddSuggestedRelay,
    onSetConfiguredRelayNip65Access,
    onOpenRelayActionsMenu,
}: SettingsRelayMobileListProps) {
    const { t } = useI18n();

    return (
        <ul className="nostr-relay-mobile-list">
            {rows.map(({ relayUrl, relayTypes, primaryRelayType }) => {
                const document = relayInfoByUrl[relayUrl]?.data;
                const relayConnectionStatus = relayConnectionStatusByRelay[relayUrl];
                const compactedRelayTypes = compactRelayTypes(relayTypes);
                const relayTypeSummary = compactedRelayTypes.map((relayType) => relayTypeLabels[relayType]).join(', ');
                const detailRelayType = compactedRelayTypes[0] ?? primaryRelayType;
                const readEnabled = hasNip65ReadAccess(relayTypes);
                const writeEnabled = hasNip65WriteAccess(relayTypes);
                const showNip65Access = source === 'configured' && onSetConfiguredRelayNip65Access && compactedRelayTypes.some((relayType) => relayType.startsWith('nip65'));

                return (
                    <li className="nostr-relay-mobile-item" key={`${source}-${relayUrl}`}>
                        <div className="nostr-relay-mobile-item-header">
                            <div className="nostr-relay-main-cell">
                                <div className="min-w-0">
                                    <p className="nostr-relay-summary-primary" title={relayUrl}>{document?.name || formatRelayDisplayUrl(relayUrl)}</p>
                                    {compactedRelayTypes.length > 0 ? (
                                        <p className="nostr-relay-mobile-summary-types">
                                            {relayTypeSummary}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon-sm"
                                        aria-label={source === 'suggested'
                                            ? t('settings.relays.openSuggestedActions', { relayUrl, relayTypeSummary })
                                            : t('settings.relays.openActions', { relayUrl, relayTypeSummary })}
                                        onClick={onOpenRelayActionsMenu}
                                    >
                                        <EllipsisVerticalIcon data-icon="inline-start" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem onSelect={() => onOpenRelayDetails(relayUrl, source, detailRelayType)}>
                                            {t('settings.relays.details')}
                                        </DropdownMenuItem>
                                        {source === 'configured' && onRemoveRelay ? (
                                            <DropdownMenuItem variant="destructive" onSelect={() => onRemoveRelay(relayUrl)}>
                                                {t('settings.relays.remove')}
                                            </DropdownMenuItem>
                                        ) : null}
                                    </DropdownMenuGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        <div className="nostr-relay-mobile-meta">
                            <div className="nostr-relay-mobile-meta-row nostr-relay-mobile-status-row">
                                <span className="nostr-relay-mobile-meta-label">{t('settings.relays.table.status')}</span>
                                <Badge variant={relayConnectionStatus === 'connected' ? 'success' : relayConnectionStatus === 'disconnected' ? 'destructive' : 'secondary'}>
                                    {relayConnectionStatus === 'connected'
                                        ? t('settings.relays.status.connected')
                                        : relayConnectionStatus === 'disconnected'
                                            ? t('settings.relays.status.disconnected')
                                            : t('settings.relays.status.checking')}
                                </Badge>
                            </div>
                        </div>

                        {showNip65Access ? (
                            <div className="nostr-relay-mobile-switches">
                                <div className="nostr-relay-mobile-switch-row">
                                    <span>{t('settings.relays.table.read')}</span>
                                    <Switch
                                        aria-label={t('settings.relays.readFor', { relayUrl })}
                                        checked={readEnabled}
                                        onCheckedChange={(checked) => onSetConfiguredRelayNip65Access(relayUrl, { read: checked, write: writeEnabled })}
                                    />
                                </div>
                                <div className="nostr-relay-mobile-switch-row">
                                    <span>{t('settings.relays.table.write')}</span>
                                    <Switch
                                        aria-label={t('settings.relays.writeFor', { relayUrl })}
                                        checked={writeEnabled}
                                        onCheckedChange={(checked) => onSetConfiguredRelayNip65Access(relayUrl, { read: readEnabled, write: checked })}
                                    />
                                </div>
                            </div>
                        ) : null}

                        {source === 'suggested' && onAddSuggestedRelay ? (
                            <Button type="button" variant="secondary" size="sm" className="nostr-relay-mobile-primary-action" onClick={() => onAddSuggestedRelay(relayUrl, relayTypes)}>
                                {t('settings.relays.add')}
                            </Button>
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}
