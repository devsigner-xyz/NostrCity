import type { WalletActivityState, WalletSettingsState } from '../../nostr/wallet-types';
import { WalletPage } from '../components/WalletPage';

export interface WalletRouteContainerProps {
    canWrite: boolean;
    walletSettings: WalletSettingsState;
    walletActivity: WalletActivityState;
    walletNwcUriInput: string;
    setWalletNwcUriInput: (value: string) => void;
    connectNwcWallet: () => Promise<void>;
    connectWebLnWallet: () => Promise<boolean>;
    disconnectWallet: () => void;
    refreshWallet: () => Promise<void>;
}

export function WalletRouteContainer({
    walletSettings,
    walletActivity,
    walletNwcUriInput,
    setWalletNwcUriInput,
    connectNwcWallet,
    connectWebLnWallet,
    disconnectWallet,
    refreshWallet,
}: WalletRouteContainerProps) {
    return (
        <WalletPage
            walletState={walletSettings}
            walletActivity={walletActivity}
            nwcUriInput={walletNwcUriInput}
            onNwcUriInputChange={setWalletNwcUriInput}
            onConnectNwc={() => {
                void connectNwcWallet();
            }}
            onConnectWebLn={() => {
                void connectWebLnWallet();
            }}
            onDisconnect={disconnectWallet}
            onRefresh={() => {
                void refreshWallet();
            }}
        />
    );
}
