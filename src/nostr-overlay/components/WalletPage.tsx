import type { WalletActivityState, WalletSettingsState } from '../../nostr/wallet-types';
import { OverlayPageHeader } from './OverlayPageHeader';
import { useI18n } from '@/i18n/useI18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { OverlaySurface } from './OverlaySurface';
import { WalletZapSettingsSection, type WalletZapSettingsSectionProps } from './WalletZapSettingsSection';
import { Separator } from '@/components/ui/separator';

interface WalletPageProps {
    walletState: WalletSettingsState;
    walletActivity: WalletActivityState;
    nwcUriInput: string;
    onNwcUriInputChange: (value: string) => void;
    onConnectNwc: () => void;
    onConnectWebLn: () => void;
    onDisconnect: () => void;
    onRefresh: () => void;
    zapSettings?: WalletZapSettingsSectionProps;
}

export function WalletPage({
    walletState,
    walletActivity,
    nwcUriInput,
    onNwcUriInputChange,
    onConnectNwc,
    onConnectWebLn,
    onDisconnect,
    onRefresh,
    zapSettings,
}: WalletPageProps) {
    const { t } = useI18n();
    const connection = walletState.activeConnection;
    const isConnected = connection !== null && connection.restoreState === 'connected';
    const statusLabel = connection?.method === 'nwc'
        ? (connection.restoreState === 'connected' ? t('wallet.status.connectedNwc') : t('wallet.status.reconnectNwc'))
        : connection?.method === 'webln'
            ? (connection.restoreState === 'connected' ? t('wallet.status.connectedWebln') : t('wallet.status.reconnectWebln'))
            : t('wallet.status.disconnected');
    const pageTitle = t('wallet.title');
    const formatActivityAmount = (amountMsats: number): string => t('wallet.activity.amountSats', {
        amount: String(Math.round(amountMsats / 1000)),
    });
    const activityStatusLabel = (status: WalletActivityState['items'][number]['status']): string => {
        if (status === 'pending') {
            return t('wallet.activity.status.pending');
        }

        if (status === 'succeeded') {
            return t('wallet.activity.status.succeeded');
        }

        return t('wallet.activity.status.failed');
    };

    return (
        <OverlaySurface ariaLabel={pageTitle}>
            <div data-testid="wallet-page" className="flex min-h-0 flex-1 flex-col">
                <div className="nostr-routed-surface-panel nostr-page-layout gap-3">
                    <OverlayPageHeader
                        title={pageTitle}
                        description={t('wallet.description')}
                    />

                    <div className="grid gap-3">
                        <Card data-testid="wallet-active-section">
                            <CardHeader>
                                {isConnected ? <CardAction><Badge>{statusLabel}</Badge></CardAction> : null}
                                <CardTitle>{isConnected ? t('wallet.active.title') : t('wallet.connect.title')}</CardTitle>
                                {isConnected ? <CardDescription>{statusLabel}</CardDescription> : null}
                            </CardHeader>
                            <Separator />
                            <CardContent className="grid gap-3">
                                {isConnected && connection?.method === 'nwc' ? (
                                    <div className="grid gap-1 text-sm text-muted-foreground">
                                        <span>{connection.relays[0] || ''}</span>
                                    </div>
                                ) : null}
                                {isConnected ? (
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" variant="outline" onClick={onRefresh}>{t('wallet.refresh')}</Button>
                                        <Button type="button" variant="outline" onClick={onDisconnect}>{t('wallet.disconnect')}</Button>
                                        <Button type="button" onClick={connection?.method === 'nwc' ? onConnectWebLn : onConnectNwc}>{t('wallet.change')}</Button>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        <Input
                                            type="text"
                                            aria-label={t('wallet.connect.nwcUri')}
                                            placeholder="nostr+walletconnect://..."
                                            value={nwcUriInput}
                                            onChange={(event) => onNwcUriInputChange(event.target.value)}
                                        />
                                        <p className="w-full text-sm text-muted-foreground">
                                            {t('wallet.connect.warning')}
                                        </p>
                                        <Button type="button" onClick={onConnectNwc}>{t('wallet.connect.nwc')}</Button>
                                        <Button type="button" variant="outline" onClick={onConnectWebLn}>{t('wallet.connect.webln')}</Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {isConnected && zapSettings ? <WalletZapSettingsSection {...zapSettings} /> : null}

                        <Card data-testid="wallet-activity-section">
                            <CardHeader>
                                <CardTitle>{t('wallet.activity.title')}</CardTitle>
                            </CardHeader>
                            <Separator />
                            <CardContent>
                                {walletActivity.items.length === 0 ? (
                                    <span className="text-sm text-muted-foreground">{t('wallet.activity.empty')}</span>
                                ) : (
                                    <ul className="grid gap-2">
                                        {walletActivity.items.map((item) => (
                                            <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                                                <span>{formatActivityAmount(item.amountMsats)}</span>
                                                <Badge variant={item.status === 'failed' ? 'destructive' : 'secondary'}>{activityStatusLabel(item.status)}</Badge>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </OverlaySurface>
    );
}
