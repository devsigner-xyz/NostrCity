import type { ZapSettingsState } from '../../nostr/zap-settings';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { useI18n } from '@/i18n/useI18n';

export interface WalletZapSettingsSectionProps {
    zapSettings: ZapSettingsState;
    newZapAmountInput: string;
    onNewZapAmountInputChange: (value: string) => void;
    onRemoveZapAmount: (index: number) => void;
    onAddZapAmount: () => void;
}

export function WalletZapSettingsSection({
    zapSettings,
    newZapAmountInput,
    onNewZapAmountInputChange,
    onRemoveZapAmount,
    onAddZapAmount,
}: WalletZapSettingsSectionProps) {
    const { t } = useI18n();
    const formatAmount = (amount: number): string => t('zaps.amountSats', { amount: String(amount) });

    return (
        <Card data-testid="wallet-zap-settings">
            <CardHeader>
                <CardTitle>{t('wallet.zaps.title')}</CardTitle>
                <CardDescription>{t('wallet.zaps.description')}</CardDescription>
            </CardHeader>
            <Separator />
            <CardContent>
                <FieldGroup>
                    <FieldSet>
                        <FieldLegend variant="label">{t('wallet.zaps.amounts')}</FieldLegend>
                        <FieldDescription>{t('wallet.zaps.quickAmountsDescription')}</FieldDescription>
                        <div className="flex flex-wrap gap-2">
                            {zapSettings.amounts.map((amount, index) => {
                                const label = formatAmount(amount);

                                return (
                                    <ButtonGroup key={`zap-${index}-${amount}`}>
                                        <ButtonGroupText>{label}</ButtonGroupText>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            aria-label={t('wallet.zaps.removeAmount', { amount: String(amount) })}
                                            onClick={() => onRemoveZapAmount(index)}
                                        >
                                            {t('wallet.zaps.remove')}
                                        </Button>
                                    </ButtonGroup>
                                );
                            })}
                        </div>
                    </FieldSet>

                    <Separator />

                    <Field data-testid="wallet-zap-add-row">
                        <FieldLabel htmlFor="wallet-zap-new-amount">{t('wallet.zaps.newAmount')}</FieldLabel>
                        <FieldDescription>{t('wallet.zaps.addAmountDescription')}</FieldDescription>
                        <InputGroup className="min-w-0">
                            <InputGroupInput
                                id="wallet-zap-new-amount"
                                type="number"
                                min={1}
                                step={1}
                                aria-label={t('wallet.zaps.newAmount')}
                                placeholder="512"
                                value={newZapAmountInput}
                                onChange={(event) => onNewZapAmountInputChange(event.target.value)}
                            />
                            <InputGroupAddon align="inline-end">
                                <InputGroupText>{t('wallet.zaps.amountUnit')}</InputGroupText>
                                <InputGroupButton variant="secondary" className="whitespace-nowrap" onClick={onAddZapAmount}>
                                {t('wallet.zaps.addAmount')}
                                </InputGroupButton>
                            </InputGroupAddon>
                        </InputGroup>
                    </Field>
                </FieldGroup>
            </CardContent>
        </Card>
    );
}
