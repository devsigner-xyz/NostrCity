import type { ZapSettingsState } from '../../nostr/zap-settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/useI18n';

export interface WalletZapSettingsSectionProps {
    zapSettings: ZapSettingsState;
    newZapAmountInput: string;
    defaultZapAmountInput: string;
    onNewZapAmountInputChange: (value: string) => void;
    onDefaultZapAmountInputChange: (value: string) => void;
    onUpdateZapAmount: (index: number, value: number) => void;
    onRemoveZapAmount: (index: number) => void;
    onAddZapAmount: () => void;
}

export function WalletZapSettingsSection({
    zapSettings,
    newZapAmountInput,
    defaultZapAmountInput,
    onNewZapAmountInputChange,
    onDefaultZapAmountInputChange,
    onUpdateZapAmount,
    onRemoveZapAmount,
    onAddZapAmount,
}: WalletZapSettingsSectionProps) {
    const { t } = useI18n();

    return (
        <Card data-testid="wallet-zap-settings">
            <CardHeader>
                <CardTitle>{t('wallet.zaps.title')}</CardTitle>
                <CardDescription>{t('wallet.zaps.description')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <p className="text-sm font-medium">{t('wallet.zaps.amounts')}</p>

                <div className="flex items-center gap-3" data-testid="wallet-zap-default-row">
                    <Input
                        type="number"
                        min={1}
                        step={1}
                        className="min-w-0 flex-1"
                        aria-label={t('wallet.zaps.defaultAmount')}
                        value={defaultZapAmountInput}
                        onChange={(event) => onDefaultZapAmountInputChange(event.target.value)}
                    />
                </div>

                <div className="nostr-settings-section nostr-zap-list">
                    {zapSettings.amounts.map((amount, index) => (
                        <div key={`zap-${index}-${amount}`} className="nostr-zap-item">
                            <span>{t('zaps.amountSats', { amount: String(amount) })}</span>
                            <div className="nostr-zap-item-actions">
                                <Input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className="min-w-0 flex-1"
                                    aria-label={t('wallet.zaps.amountInput', { index: index + 1 })}
                                    value={String(amount)}
                                    onChange={(event) => {
                                        const nextValue = Number(event.target.value);
                                        if (!Number.isFinite(nextValue)) {
                                            return;
                                        }

                                        onUpdateZapAmount(index, nextValue);
                                    }}
                                />

                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => onRemoveZapAmount(index)}
                                >
                                    {t('wallet.zaps.remove')}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-3" data-testid="wallet-zap-add-row">
                    <Input
                        type="number"
                        min={1}
                        step={1}
                        className="min-w-0 flex-1"
                        aria-label={t('wallet.zaps.newAmount')}
                        placeholder="512"
                        value={newZapAmountInput}
                        onChange={(event) => onNewZapAmountInputChange(event.target.value)}
                    />
                    <Button
                        type="button"
                        className="whitespace-nowrap"
                        onClick={onAddZapAmount}
                    >
                        {t('wallet.zaps.addAmount')}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
