import type { MouseEvent, ReactElement } from 'react';
import type { RelayType } from '../../../nostr/relay-settings';
import type { RelayConnectionStatus } from '../../hooks/useRelayConnectionSummary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { useI18n } from '@/i18n/useI18n';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EllipsisVerticalIcon } from 'lucide-react';
import { OverlayPageHeader } from '../OverlayPageHeader';
import { SettingsDmRelaysSection } from './SettingsDmRelaysSection';
import { SettingsGroupRelaysSection } from './SettingsGroupRelaysSection';
import { SettingsMainRelaysSection } from './SettingsMainRelaysSection';
import { SettingsRelayMobileList, compactRelayTypes, formatRelayDisplayUrl } from './SettingsRelayMobileList';
import type { RelayDetails, RelayInformationDocument, RelayRow, RelaySource } from './types';

interface SettingsRelaysPageProps {
    configuredRows: RelayRow[];
    suggestedRows: RelayRow[];
    dmConfiguredRows: RelayRow[];
    dmSuggestedRows: RelayRow[];
    searchConfiguredRows: RelayRow[];
    searchSuggestedRows: RelayRow[];
    groupConfiguredRows: RelayRow[];
    groupSuggestedRows: RelayRow[];
    connectedConfiguredRelays: number;
    disconnectedConfiguredRelays: number;
    relayInfoByUrl: Record<string, { data?: RelayInformationDocument }>;
    configuredRelayConnectionStatusByRelay: Record<string, RelayConnectionStatus | undefined>;
    relayConnectionStatusByRelay: Record<string, RelayConnectionStatus | undefined>;
    relayTypeLabels: Record<RelayType, string>;
    newRelayInput: string;
    newDmRelayInput: string;
    newSearchRelayInput: string;
    newGroupRelayInput: string;
    invalidRelayInputs: string[];
    invalidDmRelayInputs: string[];
    invalidSearchRelayInputs: string[];
    invalidGroupRelayInputs: string[];
    onNewRelayInputChange: (value: string) => void;
    onNewDmRelayInputChange: (value: string) => void;
    onNewSearchRelayInputChange: (value: string) => void;
    onNewGroupRelayInputChange: (value: string) => void;
    onAddRelays: () => void;
    onOpenRelayDetails: (relayUrl: string, source: RelaySource, relayType: RelayType) => void;
    onRemoveRelay: (relayUrl: string) => void;
    onSetConfiguredRelayNip65Access: (relayUrl: string, access: { read: boolean; write: boolean }) => void;
    onAddSuggestedRelay: (relayUrl: string, relayTypes: RelayType[]) => void;
    onAddAllSuggestedRelays: () => void;
    onResetRelaysToDefault: () => void;
    onAddDmRelays: () => void;
    onRemoveDmRelay: (relayUrl: string) => void;
    onAddSuggestedDmRelay: (relayUrl: string, relayTypes: RelayType[]) => void;
    onAddAllSuggestedDmRelays: () => void;
    onResetDmRelaysToDefault: () => void;
    onAddGroupRelays: () => void;
    onRemoveGroupRelay: (relayUrl: string) => void;
    onAddSuggestedGroupRelay: (relayUrl: string, relayTypes: RelayType[]) => void;
    onAddAllSuggestedGroupRelays: () => void;
    onResetGroupRelaysToDefault: () => void;
    onAddSearchRelays: () => void;
    onRemoveSearchRelay: (relayUrl: string) => void;
    onAddSuggestedSearchRelay: (relayUrl: string, relayTypes: RelayType[]) => void;
    onAddAllSuggestedSearchRelays: () => void;
    onResetSearchRelaysToDefault: () => void;
    onOpenRelayActionsMenu: (event: MouseEvent<HTMLButtonElement>) => void;
    describeRelay: (relayUrl: string, source: RelaySource) => RelayDetails;
    relayAvatarFallback: (details: RelayDetails, document?: RelayInformationDocument) => string;
    relayConnectionBadge: (status: RelayConnectionStatus | undefined) => ReactElement;
}

export function SettingsRelaysPage({
    configuredRows,
    suggestedRows,
    dmConfiguredRows,
    dmSuggestedRows,
    searchConfiguredRows,
    searchSuggestedRows,
    groupConfiguredRows,
    groupSuggestedRows,
    connectedConfiguredRelays,
    disconnectedConfiguredRelays,
    relayInfoByUrl,
    configuredRelayConnectionStatusByRelay,
    relayConnectionStatusByRelay,
    relayTypeLabels,
    newRelayInput,
    newDmRelayInput,
    newSearchRelayInput,
    newGroupRelayInput,
    invalidRelayInputs,
    invalidDmRelayInputs,
    invalidSearchRelayInputs,
    invalidGroupRelayInputs,
    onNewRelayInputChange,
    onNewDmRelayInputChange,
    onNewSearchRelayInputChange,
    onNewGroupRelayInputChange,
    onAddRelays,
    onOpenRelayDetails,
    onRemoveRelay,
    onSetConfiguredRelayNip65Access,
    onAddSuggestedRelay,
    onAddAllSuggestedRelays,
    onResetRelaysToDefault,
    onAddDmRelays,
    onRemoveDmRelay,
    onAddSuggestedDmRelay,
    onAddAllSuggestedDmRelays,
    onResetDmRelaysToDefault,
    onAddGroupRelays,
    onRemoveGroupRelay,
    onAddSuggestedGroupRelay,
    onAddAllSuggestedGroupRelays,
    onResetGroupRelaysToDefault,
    onAddSearchRelays,
    onRemoveSearchRelay,
    onAddSuggestedSearchRelay,
    onAddAllSuggestedSearchRelays,
    onResetSearchRelaysToDefault,
    onOpenRelayActionsMenu,
    relayConnectionBadge,
}: SettingsRelaysPageProps) {
    const { t } = useI18n();
    const searchRelayInputErrorId = 'search-relay-input-error';
    const hasInvalidSearchRelayInputs = invalidSearchRelayInputs.length > 0;

    return (
        <>
            <OverlayPageHeader
                title={t('settings.relays.title')}
                description={t('settings.relays.description')}
            />
            <div className="grid min-h-0 gap-2.5 overflow-x-hidden overflow-y-auto px-1" data-testid="settings-page-body">
                <div className="nostr-relays-content">
                    <div className="space-y-2.5">
                        <SettingsMainRelaysSection
                            configuredRows={configuredRows}
                            suggestedRows={suggestedRows}
                            connectedConfiguredRelays={connectedConfiguredRelays}
                            disconnectedConfiguredRelays={disconnectedConfiguredRelays}
                            relayInfoByUrl={relayInfoByUrl}
                            configuredRelayConnectionStatusByRelay={configuredRelayConnectionStatusByRelay}
                            relayConnectionStatusByRelay={relayConnectionStatusByRelay}
                            relayTypeLabels={relayTypeLabels}
                            newRelayInput={newRelayInput}
                            invalidRelayInputs={invalidRelayInputs}
                            onNewRelayInputChange={onNewRelayInputChange}
                            onAddRelays={onAddRelays}
                            onOpenRelayDetails={onOpenRelayDetails}
                            onRemoveRelay={onRemoveRelay}
                            onSetConfiguredRelayNip65Access={onSetConfiguredRelayNip65Access}
                            onAddSuggestedRelay={onAddSuggestedRelay}
                            onAddAllSuggestedRelays={onAddAllSuggestedRelays}
                            onResetRelaysToDefault={onResetRelaysToDefault}
                            onOpenRelayActionsMenu={onOpenRelayActionsMenu}
                            relayConnectionBadge={relayConnectionBadge}
                        />

                            <SettingsDmRelaysSection
                                configuredRows={dmConfiguredRows}
                                suggestedRows={dmSuggestedRows}
                                relayInfoByUrl={relayInfoByUrl}
                                relayConnectionStatusByRelay={relayConnectionStatusByRelay}
                                relayTypeLabels={relayTypeLabels}
                                newRelayInput={newDmRelayInput}
                                invalidRelayInputs={invalidDmRelayInputs}
                                onNewRelayInputChange={onNewDmRelayInputChange}
                                onAddRelays={onAddDmRelays}
                                onOpenRelayDetails={onOpenRelayDetails}
                                onRemoveRelay={onRemoveDmRelay}
                                onAddSuggestedRelay={onAddSuggestedDmRelay}
                                onAddAllSuggestedRelays={onAddAllSuggestedDmRelays}
                                onResetRelaysToDefault={onResetDmRelaysToDefault}
                                onOpenRelayActionsMenu={onOpenRelayActionsMenu}
                                relayConnectionBadge={relayConnectionBadge}
                            />

                            <SettingsGroupRelaysSection
                                configuredRows={groupConfiguredRows}
                                suggestedRows={groupSuggestedRows}
                                relayInfoByUrl={relayInfoByUrl}
                                relayConnectionStatusByRelay={relayConnectionStatusByRelay}
                                relayTypeLabels={relayTypeLabels}
                                newRelayInput={newGroupRelayInput}
                                invalidRelayInputs={invalidGroupRelayInputs}
                                onNewRelayInputChange={onNewGroupRelayInputChange}
                                onAddRelays={onAddGroupRelays}
                                onOpenRelayDetails={onOpenRelayDetails}
                                onRemoveRelay={onRemoveGroupRelay}
                                onAddSuggestedRelay={onAddSuggestedGroupRelay}
                                onAddAllSuggestedRelays={onAddAllSuggestedGroupRelays}
                                onResetRelaysToDefault={onResetGroupRelaysToDefault}
                                onOpenRelayActionsMenu={onOpenRelayActionsMenu}
                            />

                        <Card size="sm" className="nostr-relay-search nostr-relays-panel gap-0 py-0">
                                <CardHeader className="border-b px-3 py-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <CardTitle>{t('settings.relays.search.title')}</CardTitle>
                                        <Button type="button" variant="ghost" size="sm" onClick={onResetSearchRelaysToDefault}>
                                            {t('settings.relays.resetDefault')}
                                        </Button>
                                    </div>
                                    <CardDescription>{t('settings.relays.search.description')}</CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-3 px-3 py-3">
                                    <label htmlFor="search-relay-urls-input" className="text-sm font-medium">
                                        {t('settings.relays.addRelay')}
                                    </label>
                                    <InputGroup>
                                        <InputGroupInput
                                            id="search-relay-urls-input"
                                            aria-label={t('settings.relays.search.urls')}
                                            type="url"
                                            inputMode="url"
                                            name="searchRelayUrls"
                                            autoComplete="off"
                                            spellCheck={false}
                                            aria-invalid={hasInvalidSearchRelayInputs}
                                            aria-describedby={hasInvalidSearchRelayInputs ? searchRelayInputErrorId : undefined}
                                            placeholder="wss://search.example"
                                            value={newSearchRelayInput}
                                            onChange={(event) => onNewSearchRelayInputChange(event.target.value)}
                                        />
                                        <InputGroupAddon align="inline-end">
                                            <InputGroupButton variant="secondary" onClick={onAddSearchRelays}>
                                                {t('settings.relays.add')}
                                            </InputGroupButton>
                                        </InputGroupAddon>
                                    </InputGroup>

                                    {hasInvalidSearchRelayInputs ? (
                                        <p id={searchRelayInputErrorId} role="alert" className="nostr-settings-error">
                                            {t('settings.relays.invalidInputs', { inputs: invalidSearchRelayInputs.join(', ') })}
                                        </p>
                                    ) : null}

                                        <div className="flex flex-col gap-3">
                                            <div>
                                                <div className="nostr-relay-suggested-header mb-2">
                                                    <h3 id="search-relays-configured-heading" className="text-sm font-semibold">{t('settings.relays.section.configured')}</h3>
                                                </div>
                                                <div className="nostr-relay-table-scroll nostr-relay-desktop-table">
                                                    <Table className="nostr-relay-table" aria-labelledby="search-relays-configured-heading">
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>{t('settings.relays.table.relay')}</TableHead>
                                                            <TableHead>{t('settings.relays.table.type')}</TableHead>
                                                            <TableHead>{t('settings.relays.table.status')}</TableHead>
                                                            <TableHead className="nostr-relay-actions-head">{t('settings.relays.table.actions')}</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {searchConfiguredRows.map(({ relayUrl, relayTypes, primaryRelayType }) => {
                                                            const info = relayInfoByUrl[relayUrl];
                                                            const document = info?.data;
                                                            const relayConnectionStatus = relayConnectionStatusByRelay[relayUrl];
                                                            const compactedRelayTypes = compactRelayTypes(relayTypes);
                                                            const relayTypeSummary = compactedRelayTypes.map((relayType) => relayTypeLabels[relayType]).join(', ');
                                                            const detailRelayType = compactedRelayTypes[0] ?? primaryRelayType;

                                                            return (
                                                                <TableRow key={`search-configured-${relayUrl}`}>
                                                                    <TableCell className="nostr-relay-url-cell">
                                                                        <div className="nostr-relay-main-cell">
                                                                            <div className="min-w-0">
                                                                                <p className="nostr-relay-summary-primary" title={relayUrl}>{document?.name || formatRelayDisplayUrl(relayUrl)}</p>
                                                                            </div>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <div className="nostr-relay-nip-badges">
                                                                            {compactedRelayTypes.map((relayType) => (
                                                                                <Badge key={`search-configured-type-${relayUrl}-${relayType}`} variant="outline">
                                                                                    {relayTypeLabels[relayType]}
                                                                                </Badge>
                                                                            ))}
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell>{relayConnectionBadge(relayConnectionStatus)}</TableCell>
                                                                    <TableCell className="nostr-relay-actions-cell">
                                                                        <DropdownMenu>
                                                                            <DropdownMenuTrigger asChild>
                                                                                <Button
                                                                                    type="button"
                                                                                    variant="outline"
                                                                                    size="icon-sm"
                                                                                    aria-label={t('settings.relays.openActions', { relayUrl, relayTypeSummary })}
                                                                                    onClick={onOpenRelayActionsMenu}
                                                                                >
                                                                                    <EllipsisVerticalIcon data-icon="inline-start" />
                                                                                </Button>
                                                                            </DropdownMenuTrigger>
                                                                                <DropdownMenuContent align="end">
                                                                                    <DropdownMenuGroup>
                                                                                        <DropdownMenuItem onSelect={() => onOpenRelayDetails(relayUrl, 'configured', detailRelayType)}>
                                                                                            {t('settings.relays.details')}
                                                                                        </DropdownMenuItem>
                                                                                        <DropdownMenuItem variant="destructive" onSelect={() => onRemoveSearchRelay(relayUrl)}>
                                                                                            {t('settings.relays.remove')}
                                                                                        </DropdownMenuItem>
                                                                                    </DropdownMenuGroup>
                                                                                </DropdownMenuContent>
                                                                        </DropdownMenu>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                            <SettingsRelayMobileList
                                                rows={searchConfiguredRows}
                                                source="configured"
                                                relayInfoByUrl={relayInfoByUrl}
                                                relayConnectionStatusByRelay={relayConnectionStatusByRelay}
                                                relayTypeLabels={relayTypeLabels}
                                                onOpenRelayDetails={onOpenRelayDetails}
                                                onRemoveRelay={onRemoveSearchRelay}
                                                onOpenRelayActionsMenu={onOpenRelayActionsMenu}
                                            />
                                        </div>

                                        {searchSuggestedRows.length > 0 ? (
                                            <div>
                                                <div className="nostr-relay-suggested-header mb-2">
                                                    <h3 id="search-relays-suggested-heading" className="text-sm font-semibold">{t('settings.relays.section.suggested')}</h3>
                                                    <Button type="button" variant="outline" className="nostr-relay-add-suggested" onClick={onAddAllSuggestedSearchRelays}>
                                                        {t('settings.relays.addAll')}
                                                    </Button>
                                                </div>
                                                <div className="nostr-relay-table-scroll nostr-relay-desktop-table">
                                                    <Table className="nostr-relay-table" aria-labelledby="search-relays-suggested-heading">
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>{t('settings.relays.table.relay')}</TableHead>
                                                                <TableHead>{t('settings.relays.table.type')}</TableHead>
                                                                <TableHead>{t('settings.relays.table.status')}</TableHead>
                                                                <TableHead className="nostr-relay-actions-head">{t('settings.relays.table.actions')}</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {searchSuggestedRows.map(({ relayUrl, relayTypes, primaryRelayType }) => {
                                                                const info = relayInfoByUrl[relayUrl];
                                                                const document = info?.data;
                                                                const relayConnectionStatus = relayConnectionStatusByRelay[relayUrl];
                                                                const compactedRelayTypes = compactRelayTypes(relayTypes);
                                                                const relayTypeSummary = compactedRelayTypes.map((relayType) => relayTypeLabels[relayType]).join(', ');
                                                                const detailRelayType = compactedRelayTypes[0] ?? primaryRelayType;

                                                                return (
                                                                    <TableRow key={`search-suggested-${relayUrl}`}>
                                                                        <TableCell className="nostr-relay-url-cell">
                                                                            <div className="nostr-relay-main-cell">
                                                                                <div className="min-w-0">
                                                                                    <p className="nostr-relay-summary-primary" title={relayUrl}>{document?.name || formatRelayDisplayUrl(relayUrl)}</p>
                                                                                </div>
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <div className="nostr-relay-nip-badges">
                                                                                {compactedRelayTypes.map((relayType) => (
                                                                                    <Badge key={`search-suggested-type-${relayUrl}-${relayType}`} variant="outline">
                                                                                        {relayTypeLabels[relayType]}
                                                                                    </Badge>
                                                                                ))}
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell>{relayConnectionBadge(relayConnectionStatus)}</TableCell>
                                                                        <TableCell className="nostr-relay-actions-cell">
                                                                            <DropdownMenu>
                                                                                <DropdownMenuTrigger asChild>
                                                                                    <Button
                                                                                        type="button"
                                                                                        variant="outline"
                                                                                        size="icon-sm"
                                                                                        aria-label={t('settings.relays.openSuggestedActions', { relayUrl, relayTypeSummary })}
                                                                                        onClick={onOpenRelayActionsMenu}
                                                                                    >
                                                                                        <EllipsisVerticalIcon data-icon="inline-start" />
                                                                                    </Button>
                                                                                </DropdownMenuTrigger>
                                                                                    <DropdownMenuContent align="end">
                                                                                        <DropdownMenuGroup>
                                                                                            <DropdownMenuItem onSelect={() => onOpenRelayDetails(relayUrl, 'suggested', detailRelayType)}>
                                                                                                {t('settings.relays.details')}
                                                                                            </DropdownMenuItem>
                                                                                            <DropdownMenuItem onSelect={() => onAddSuggestedSearchRelay(relayUrl, relayTypes)}>
                                                                                                {t('settings.relays.add')}
                                                                                            </DropdownMenuItem>
                                                                                        </DropdownMenuGroup>
                                                                                    </DropdownMenuContent>
                                                                            </DropdownMenu>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                );
                                                            })}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                                <SettingsRelayMobileList
                                                    rows={searchSuggestedRows}
                                                    source="suggested"
                                                    relayInfoByUrl={relayInfoByUrl}
                                                    relayConnectionStatusByRelay={relayConnectionStatusByRelay}
                                                    relayTypeLabels={relayTypeLabels}
                                                    onOpenRelayDetails={onOpenRelayDetails}
                                                    onAddSuggestedRelay={onAddSuggestedSearchRelay}
                                                    onOpenRelayActionsMenu={onOpenRelayActionsMenu}
                                                />
                                            </div>
                                        ) : null}
                                    </div>
                                </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </>
    );
}
