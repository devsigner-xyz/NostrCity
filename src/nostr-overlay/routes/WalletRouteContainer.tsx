import { useEffect, useState } from 'react';
import type { WalletActivityState, WalletSettingsState } from '../../nostr/wallet-types';
import { addZapAmount, removeZapAmount, updateDefaultZapAmount, updateZapAmount, type ZapSettingsState } from '../../nostr/zap-settings';
import { WalletPage } from '../components/WalletPage';
import { useZapSettingsController } from '../controllers/use-zap-settings-controller';

export interface WalletRouteContainerProps {
    canWrite: boolean;
    ownerPubkey?: string;
    walletSettings: WalletSettingsState;
    walletActivity: WalletActivityState;
    walletNwcUriInput: string;
    setWalletNwcUriInput: (value: string) => void;
    connectNwcWallet: () => Promise<void>;
    connectWebLnWallet: () => Promise<boolean>;
    disconnectWallet: () => void;
    refreshWallet: () => Promise<void>;
    zapSettings: ZapSettingsState;
    onZapSettingsChange: (nextState: ZapSettingsState) => void;
}

export function WalletRouteContainer({
    walletSettings,
    walletActivity,
    walletNwcUriInput,
    ownerPubkey,
    setWalletNwcUriInput,
    connectNwcWallet,
    connectWebLnWallet,
    disconnectWallet,
    refreshWallet,
    zapSettings,
    onZapSettingsChange,
}: WalletRouteContainerProps) {
    const { zapSettingsState, persistZapSettings } = useZapSettingsController({
        ...(ownerPubkey ? { ownerPubkey } : {}),
        zapSettings,
        onZapSettingsChange,
    });
    const [newZapAmountInput, setNewZapAmountInput] = useState('');
    const [defaultZapAmountInput, setDefaultZapAmountInput] = useState(String(zapSettingsState.defaultAmount));
    const isConnected = walletSettings.activeConnection?.restoreState === 'connected';

    useEffect(() => {
        setDefaultZapAmountInput(String(zapSettingsState.defaultAmount));
    }, [zapSettingsState.defaultAmount]);

    const zapSettingsSection = isConnected ? {
        zapSettings: zapSettingsState,
        newZapAmountInput,
        defaultZapAmountInput,
        onNewZapAmountInputChange: setNewZapAmountInput,
        onDefaultZapAmountInputChange: (value: string) => {
            setDefaultZapAmountInput(value);
            const nextValue = Number(value.trim());
            if (!Number.isFinite(nextValue)) {
                return;
            }

            persistZapSettings(updateDefaultZapAmount(zapSettingsState, nextValue));
        },
        onUpdateZapAmount: (index: number, value: number) => {
            persistZapSettings(updateZapAmount(zapSettingsState, index, value));
        },
        onRemoveZapAmount: (index: number) => {
            persistZapSettings(removeZapAmount(zapSettingsState, index));
        },
        onAddZapAmount: () => {
            const nextValue = Number(newZapAmountInput.trim());
            if (!Number.isFinite(nextValue)) {
                return;
            }

            persistZapSettings(addZapAmount(zapSettingsState, nextValue));
            setNewZapAmountInput('');
        },
    } : undefined;

    return (
        <WalletPage
            walletState={walletSettings}
            walletActivity={walletActivity}
            nwcUriInput={walletNwcUriInput}
            {...(zapSettingsSection ? { zapSettings: zapSettingsSection } : {})}
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
