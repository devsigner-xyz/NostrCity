import { OverlayPageHeader } from '../OverlayPageHeader';
import { LightningDonationBanner } from '../LightningDonationBanner';
import type { NostrProfile } from '../../../nostr/types';
import { useI18n } from '@/i18n/useI18n';

interface SettingsAboutPageProps {
    donationProfile?: NostrProfile | undefined;
    canDonateWithWallet?: boolean;
    onDonate?: ((input: { pubkey: string; amount: number }) => Promise<void> | void) | undefined;
}

export function SettingsAboutPage({
    donationProfile,
    canDonateWithWallet = false,
    onDonate,
}: SettingsAboutPageProps = {}) {
    const { t } = useI18n();

    return (
        <>
            <OverlayPageHeader
                title={t('settings.about.title')}
                description={t('settings.about.description')}
            />
            <div className="grid min-h-0 gap-2.5 overflow-x-hidden overflow-y-auto pr-px" data-testid="settings-page-body">
                <div className="nostr-shortcuts-content">
                    <div className="nostr-about-section">
                        <h4>{t('settings.about.supportedNips')}</h4>
                        <ul>
                            <li>NIP-19 (npub)</li>
                            <li>NIP-65 (relay list metadata)</li>
                            <li>NIP-17 (DM inbox relays)</li>
                            <li>{t('settings.about.profileMetadata')}</li>
                            <li>{t('settings.about.posts')}</li>
                            <li>{t('settings.about.follows')}</li>
                        </ul>
                    </div>

                    <div className="nostr-about-section">
                        <h4>{t('settings.about.features')}</h4>
                        <ul>
                            <li>{t('settings.about.feature.overlay')}</li>
                            <li>{t('settings.about.feature.focus')}</li>
                            <li>{t('settings.about.feature.progressiveLoad')}</li>
                            <li>{t('settings.about.feature.relaySettings')}</li>
                            <li>{t('settings.about.feature.cityStats')}</li>
                        </ul>
                    </div>

                    <div className="nostr-about-section">
                        <h4>{t('settings.about.attribution')}</h4>
                        <p>
                            {t('settings.about.mapGeneratorAttribution')}{' '}
                            <a
                                href="https://github.com/ProbableTrain/MapGenerator"
                                target="_blank"
                                rel="noreferrer"
                                data-testid="mapgenerator-attribution-link"
                                className="text-primary underline-offset-4 hover:underline"
                            >
                                ProbableTrain/MapGenerator
                            </a>
                        </p>
                    </div>

                    <LightningDonationBanner
                        profile={donationProfile}
                        canDonateWithWallet={canDonateWithWallet}
                        onDonate={onDonate}
                    />
                </div>
            </div>
        </>
    );
}
