import { useId, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { NostrProfile } from '../../nostr/types';
import { buildLightningAddressUrl, encodeLnurl } from '../../nostr/zaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/utils';

interface LightningDonationBannerProps {
    profile?: Pick<NostrProfile, 'pubkey' | 'displayName' | 'name' | 'lud16' | 'lud06'> | undefined;
    canDonateWithWallet: boolean;
    onDonate?: ((input: { pubkey: string; amount: number }) => Promise<void> | void) | undefined;
    className?: string | undefined;
}

const MAX_DONATION_SATS = Math.floor(Number.MAX_SAFE_INTEGER / 1000);
const QR_SIZE_PX = 150;
const QR_AVATAR_SIZE_PX = 38;
const STRHODLER_AVATAR_SRC = '/strhodler.jpg';

function resolveLightningEndpoint(profile: LightningDonationBannerProps['profile']): string | null {
    const endpoint = profile?.lud16?.trim() || profile?.lud06?.trim();
    return endpoint && endpoint.length > 0 ? endpoint : null;
}

function resolveDonationName(profile: LightningDonationBannerProps['profile']): string {
    return profile?.displayName?.trim() || profile?.name?.trim() || 'strhodler';
}

function resolveLightningQrValue(profile: LightningDonationBannerProps['profile'], endpoint: string): string | null {
    if (profile?.lud16?.trim()) {
        try {
            return `lightning:${encodeLnurl(buildLightningAddressUrl(profile.lud16))}`;
        } catch {
            return null;
        }
    }

    return `lightning:${endpoint}`;
}

export function LightningDonationBanner({
    profile,
    canDonateWithWallet,
    onDonate,
    className,
}: LightningDonationBannerProps) {
    const { t } = useI18n();
    const amountInputId = useId();
    const [amount, setAmount] = useState('21');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const endpoint = resolveLightningEndpoint(profile);

    if (!profile || !endpoint) {
        return null;
    }

    const parsedAmount = Number(amount);
    const isValidAmount = /^[1-9]\d*$/.test(amount) && Number.isSafeInteger(parsedAmount) && parsedAmount <= MAX_DONATION_SATS;
    const canSubmit = canDonateWithWallet && typeof onDonate === 'function' && isValidAmount && !isSubmitting;
    const paymentUri = resolveLightningQrValue(profile, endpoint);
    const donationName = resolveDonationName(profile);

    if (!paymentUri) {
        return null;
    }

    return (
        <section
            data-testid="lightning-donation-banner"
            className={cn(
                'nostr-profile-info-section text-sm',
                'grid sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center',
                className,
            )}
            style={{ columnGap: '2rem', rowGap: '1.5rem' }}
            aria-label={t('donation.banner.aria', { name: donationName })}
        >
            <div data-testid="lightning-donation-qr" data-qr-value={paymentUri} className="mx-auto rounded-lg bg-white p-2 shadow-xs sm:mx-0 [&_image]:[clip-path:circle(50%)]">
                <QRCodeSVG
                    value={paymentUri}
                    size={QR_SIZE_PX}
                    level="H"
                    marginSize={1}
                    title={t('donation.banner.aria', { name: donationName })}
                    imageSettings={{
                        src: STRHODLER_AVATAR_SRC,
                        height: QR_AVATAR_SIZE_PX,
                        width: QR_AVATAR_SIZE_PX,
                        excavate: true,
                    }}
                />
            </div>

            <div className="grid min-w-0 gap-4">
                <div className="grid gap-1">
                    <h4 className="text-sm font-semibold text-foreground">{t('donation.banner.title')}</h4>
                    <p className="truncate text-xs font-medium text-primary" title={endpoint}>{endpoint}</p>
                </div>

                {canDonateWithWallet && onDonate ? (
                    <form
                        className="flex flex-col gap-2 sm:flex-row sm:items-end"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (!canSubmit) {
                                return;
                            }

                            setIsSubmitting(true);
                            void Promise.resolve(onDonate({ pubkey: profile.pubkey, amount: parsedAmount }))
                                .catch(() => undefined)
                                .finally(() => setIsSubmitting(false));
                        }}
                    >
                        <div className="grid min-w-0 flex-1 gap-1">
                            <Label htmlFor={amountInputId}>{t('donation.banner.amountLabel')}</Label>
                            <Input
                                id={amountInputId}
                                data-testid="lightning-donation-amount"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={MAX_DONATION_SATS}
                                step={1}
                                value={amount}
                                onChange={(event) => setAmount(event.target.value)}
                            />
                        </div>
                        <Button data-testid="lightning-donation-submit" type="submit" disabled={!canSubmit}>
                            {isSubmitting ? t('donation.banner.sending') : t('donation.banner.submit')}
                        </Button>
                    </form>
                ) : (
                    <p className="text-xs text-muted-foreground">{t('donation.banner.scanQr')}</p>
                )}
            </div>
        </section>
    );
}
