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
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n/useI18n';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EllipsisVerticalIcon } from 'lucide-react';
import { SettingsRelayMobileList, compactRelayTypes, formatRelayDisplayUrl, hasNip65ReadAccess, hasNip65WriteAccess } from './SettingsRelayMobileList';
import type { RelayInformationDocument, RelayRow, RelaySource } from './types';

interface SettingsMainRelaysSectionProps {
    configuredRows: RelayRow[];
    suggestedRows: RelayRow[];
    connectedConfiguredRelays: number;
    disconnectedConfiguredRelays: number;
    relayInfoByUrl: Record<string, { data?: RelayInformationDocument }>;
    configuredRelayConnectionStatusByRelay: Record<string, RelayConnectionStatus | undefined>;
    relayConnectionStatusByRelay: Record<string, RelayConnectionStatus | undefined>;
    relayTypeLabels: Record<RelayType, string>;
    newRelayInput: string;
    invalidRelayInputs: string[];
    onNewRelayInputChange: (value: string) => void;
    onAddRelays: () => void;
    onOpenRelayDetails: (relayUrl: string, source: RelaySource, relayType: RelayType) => void;
    onRemoveRelay: (relayUrl: string) => void;
    onSetConfiguredRelayNip65Access: (relayUrl: string, access: { read: boolean; write: boolean }) => void;
    onAddSuggestedRelay: (relayUrl: string, relayTypes: RelayType[]) => void;
    onAddAllSuggestedRelays: () => void;
    onResetRelaysToDefault: () => void;
    onOpenRelayActionsMenu: (event: MouseEvent<HTMLButtonElement>) => void;
    relayConnectionBadge: (status: RelayConnectionStatus | undefined) => ReactElement;
}

export function SettingsMainRelaysSection({
    configuredRows,
    suggestedRows,
    connectedConfiguredRelays,
    disconnectedConfiguredRelays,
    relayInfoByUrl,
    configuredRelayConnectionStatusByRelay,
    relayConnectionStatusByRelay,
    relayTypeLabels,
    newRelayInput,
    invalidRelayInputs,
    onNewRelayInputChange,
    onAddRelays,
    onOpenRelayDetails,
    onRemoveRelay,
    onSetConfiguredRelayNip65Access,
    onAddSuggestedRelay,
    onAddAllSuggestedRelays,
    onResetRelaysToDefault,
    onOpenRelayActionsMenu,
    relayConnectionBadge,
}: SettingsMainRelaysSectionProps) {
    const { t } = useI18n();
    const summaryBadges = [
        t('settings.relays.summary.configured', { count: String(configuredRows.length) }),
        t('settings.relays.summary.connected', { count: String(connectedConfiguredRelays) }),
        t('settings.relays.summary.disconnected', { count: String(disconnectedConfiguredRelays) }),
    ];
    const relayInputErrorId = 'relay-input-error';
    const hasInvalidRelayInputs = invalidRelayInputs.length > 0;

    return (
        <Card size="sm" className="nostr-relays-panel gap-0 py-0">
            <CardHeader className="border-b px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle>{t('settings.relays.configured.title')}</CardTitle>
                    <Button type="button" variant="ghost" size="sm" onClick={onResetRelaysToDefault}>
                        {t('settings.relays.resetDefault')}
                    </Button>
                </div>
                <CardDescription>{t('settings.relays.configured.description')}</CardDescription>
                <div className="nostr-relay-connection-summary" role="status" aria-live="polite">
                    {summaryBadges.map((label) => (
                        <Badge key={label} variant="outline">
                            {label}
                        </Badge>
                    ))}
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-3 py-3">
                <label htmlFor="relay-urls-input" className="text-sm font-medium">
                    {t('settings.relays.addRelay')}
                </label>
                <InputGroup>
                    <InputGroupInput
                        id="relay-urls-input"
                        aria-label={t('settings.relays.urls')}
                        type="url"
                        inputMode="url"
                        name="relayUrls"
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={hasInvalidRelayInputs}
                        aria-describedby={hasInvalidRelayInputs ? relayInputErrorId : undefined}
                        placeholder="wss://relay.example"
                        value={newRelayInput}
                        onChange={(event) => onNewRelayInputChange(event.target.value)}
                    />
                    <InputGroupAddon align="inline-end">
                        <InputGroupButton variant="secondary" onClick={onAddRelays}>
                            {t('settings.relays.add')}
                        </InputGroupButton>
                    </InputGroupAddon>
                </InputGroup>

                {hasInvalidRelayInputs ? (
                    <p id={relayInputErrorId} role="alert" className="nostr-settings-error">
                        {t('settings.relays.invalidInputs', { inputs: invalidRelayInputs.join(', ') })}
                    </p>
                ) : null}

                <div className="flex flex-col gap-3">
                    <div>
                        <div className="nostr-relay-suggested-header mb-2">
                            <h3 id="main-relays-configured-heading" className="text-sm font-semibold">{t('settings.relays.section.configured')}</h3>
                        </div>
                        <div className="nostr-relay-table-scroll nostr-relay-desktop-table">
                            <Table className="nostr-relay-table" aria-label={t('settings.relays.configuredTable')} aria-labelledby="main-relays-configured-heading">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t('settings.relays.table.relay')}</TableHead>
                                        <TableHead>{t('settings.relays.table.read')}</TableHead>
                                        <TableHead>{t('settings.relays.table.write')}</TableHead>
                                        <TableHead>{t('settings.relays.table.status')}</TableHead>
                                        <TableHead className="nostr-relay-actions-head">{t('settings.relays.table.actions')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {configuredRows.map(({ relayUrl, relayTypes, primaryRelayType }) => {
                                        const document = relayInfoByUrl[relayUrl]?.data;
                                        const relayConnectionStatus = configuredRelayConnectionStatusByRelay[relayUrl];
                                        const compactedRelayTypes = compactRelayTypes(relayTypes);
                                        const relayTypeSummary = compactedRelayTypes.map((relayType) => relayTypeLabels[relayType]).join(', ');
                                        const detailRelayType = compactedRelayTypes[0] ?? primaryRelayType;
                                        const readEnabled = hasNip65ReadAccess(relayTypes);
                                        const writeEnabled = hasNip65WriteAccess(relayTypes);

                                        return (
                                            <TableRow key={`configured-${relayUrl}`}>
                                                <TableCell className="nostr-relay-url-cell">
                                                    <div className="nostr-relay-main-cell">
                                                        <div className="min-w-0">
                                                            <p className="nostr-relay-summary-primary" title={relayUrl}>{document?.name || formatRelayDisplayUrl(relayUrl)}</p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Switch
                                                        aria-label={t('settings.relays.readFor', { relayUrl })}
                                                        checked={readEnabled}
                                                        onCheckedChange={(checked) => onSetConfiguredRelayNip65Access(relayUrl, { read: checked, write: writeEnabled })}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Switch
                                                        aria-label={t('settings.relays.writeFor', { relayUrl })}
                                                        checked={writeEnabled}
                                                        onCheckedChange={(checked) => onSetConfiguredRelayNip65Access(relayUrl, { read: readEnabled, write: checked })}
                                                    />
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
                                                                <DropdownMenuItem variant="destructive" onSelect={() => onRemoveRelay(relayUrl)}>
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
                            rows={configuredRows}
                            source="configured"
                            relayInfoByUrl={relayInfoByUrl}
                            relayConnectionStatusByRelay={configuredRelayConnectionStatusByRelay}
                            relayTypeLabels={relayTypeLabels}
                            onOpenRelayDetails={onOpenRelayDetails}
                            onRemoveRelay={onRemoveRelay}
                            onSetConfiguredRelayNip65Access={onSetConfiguredRelayNip65Access}
                            onOpenRelayActionsMenu={onOpenRelayActionsMenu}
                        />
                    </div>

                    {suggestedRows.length > 0 ? (
                        <div>
                            <div className="nostr-relay-suggested-header mb-2">
                                <h3 id="main-relays-suggested-heading" className="text-sm font-semibold">{t('settings.relays.section.suggested')}</h3>
                                <Button type="button" variant="outline" className="nostr-relay-add-suggested" onClick={onAddAllSuggestedRelays}>
                                    {t('settings.relays.addAll')}
                                </Button>
                            </div>
                            <p className="mb-2 text-sm text-muted-foreground">{t('settings.relays.suggested.description')}</p>
                            <div className="nostr-relay-table-scroll nostr-relay-desktop-table">
                                <Table className="nostr-relay-table" aria-label={t('settings.relays.suggestedTable')} aria-labelledby="main-relays-suggested-heading">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t('settings.relays.table.relay')}</TableHead>
                                            <TableHead>{t('settings.relays.table.type')}</TableHead>
                                            <TableHead>{t('settings.relays.table.status')}</TableHead>
                                            <TableHead className="nostr-relay-actions-head">{t('settings.relays.table.actions')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {suggestedRows.map(({ relayUrl, relayTypes, primaryRelayType }) => {
                                            const document = relayInfoByUrl[relayUrl]?.data;
                                            const relayConnectionStatus = relayConnectionStatusByRelay[relayUrl];
                                            const compactedRelayTypes = compactRelayTypes(relayTypes);
                                            const relayTypeSummary = compactedRelayTypes.map((relayType) => relayTypeLabels[relayType]).join(', ');
                                            const detailRelayType = compactedRelayTypes[0] ?? primaryRelayType;

                                            return (
                                                <TableRow key={`suggested-${relayUrl}`}>
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
                                                                <Badge key={`suggested-type-${relayUrl}-${relayType}`} variant="outline">
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
                                                                    <DropdownMenuItem onSelect={() => onAddSuggestedRelay(relayUrl, relayTypes)}>
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
                                rows={suggestedRows}
                                source="suggested"
                                relayInfoByUrl={relayInfoByUrl}
                                relayConnectionStatusByRelay={relayConnectionStatusByRelay}
                                relayTypeLabels={relayTypeLabels}
                                onOpenRelayDetails={onOpenRelayDetails}
                                onAddSuggestedRelay={onAddSuggestedRelay}
                                onOpenRelayActionsMenu={onOpenRelayActionsMenu}
                            />
                        </div>
                    ) : null}
                </div>
            </CardContent>
        </Card>
    );
}
