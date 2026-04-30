import { SettingsAboutPage } from '../settings-pages/SettingsAboutPage';
import type { NostrProfile } from '../../../nostr/types';

interface SettingsAboutRouteProps {
    profile?: NostrProfile | undefined;
    canDonateWithWallet?: boolean;
    onDonate?: ((input: { pubkey: string; amount: number }) => Promise<void> | void) | undefined;
}

export function SettingsAboutRoute({ profile, canDonateWithWallet = false, onDonate }: SettingsAboutRouteProps = {}) {
    return (
        <SettingsAboutPage
            donationProfile={profile}
            canDonateWithWallet={canDonateWithWallet}
            onDonate={onDonate}
        />
    );
}
