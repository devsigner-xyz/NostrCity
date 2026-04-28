import { useMemo, useState } from 'react';
import { nip19 } from 'nostr-tools';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import type { FormEvent } from 'react';
import type { ProviderResolveInput } from '../../nostr/auth/providers/types';
import { getDefaultRelaySettings, type RelaySettingsState } from '../../nostr/relay-settings';
import { AuthFlowFooter } from './AuthFlowFooter';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/button';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface CreateLocalAccountInput {
    secretKey: Uint8Array;
    passphrase?: string;
    profile?: {
        name?: string;
        about?: string;
        picture?: string;
    };
    relaySettings: RelaySettingsState;
}

interface CreateAccountDialogProps {
    disabled?: boolean;
    initialMethod: 'local' | 'external';
    hasNip07?: boolean;
    onBack: () => void;
    onStartSession: (method: 'nip07' | 'nip46', input: ProviderResolveInput) => Promise<void> | void;
    onCreateLocalAccount: (input: CreateLocalAccountInput) => Promise<void> | void;
    secretKeyFactory?: () => Uint8Array;
    defaultRelaySettings?: RelaySettingsState;
}

type LocalStep = 'backup' | 'profile' | 'relays';

function downloadTextFile(fileName: string, content: string) {
    if (typeof window === 'undefined') {
        return;
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
}

export function CreateAccountDialog({
    disabled = false,
    initialMethod,
    hasNip07 = false,
    onBack,
    onStartSession,
    onCreateLocalAccount,
    secretKeyFactory = generateSecretKey,
    defaultRelaySettings = getDefaultRelaySettings(),
}: CreateAccountDialogProps) {
    const { t } = useI18n();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bunkerUri, setBunkerUri] = useState('');
    const [backupConfirmed, setBackupConfirmed] = useState(false);
    const [profileName, setProfileName] = useState('');
    const [profileAbout, setProfileAbout] = useState('');
    const [profilePicture, setProfilePicture] = useState('');
    const [devicePassphrase, setDevicePassphrase] = useState('');
    const [localStep, setLocalStep] = useState<LocalStep>('backup');
    const localSecretKey = useMemo(
        () => (initialMethod === 'local' ? secretKeyFactory() : undefined),
        [initialMethod, secretKeyFactory]
    );
    const localPubkey = useMemo(
        () => (initialMethod === 'local' && localSecretKey ? getPublicKey(localSecretKey) : undefined),
        [initialMethod, localSecretKey]
    );

    const isBusy = disabled || isSubmitting;
    const npub = useMemo(() => (localPubkey ? nip19.npubEncode(localPubkey) : ''), [localPubkey]);
    const nsec = useMemo(() => (localSecretKey ? nip19.nsecEncode(localSecretKey) : ''), [localSecretKey]);

    const run = async (action: () => Promise<void> | void) => {
        setIsSubmitting(true);
        try {
            await action();
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleExternalBunkerSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const value = bunkerUri.trim();
        if (!value) {
            return;
        }

        await run(async () => {
            await onStartSession('nip46', { bunkerUri: value });
        });
    };

    const handleCreateLocalAccount = async () => {
        const trimmedName = profileName.trim();
        const trimmedAbout = profileAbout.trim();
        const trimmedPicture = profilePicture.trim();
        const trimmedPassphrase = devicePassphrase.trim();
        if (!localSecretKey) {
            return;
        }
        const profile = trimmedName || trimmedAbout || trimmedPicture
            ? {
                ...(trimmedName ? { name: trimmedName } : {}),
                ...(trimmedAbout ? { about: trimmedAbout } : {}),
                ...(trimmedPicture ? { picture: trimmedPicture } : {}),
            }
            : undefined;

        await run(async () => {
            await onCreateLocalAccount({
                secretKey: localSecretKey,
                ...(trimmedPassphrase ? { passphrase: trimmedPassphrase } : {}),
                ...(profile ? { profile } : {}),
                relaySettings: defaultRelaySettings,
            });
        });
    };

    if (initialMethod === 'external') {
        return (
            <>
                <div className="flex flex-col gap-1 px-0">
                    <CardTitle>{t('auth.createDialog.external.title')}</CardTitle>
                    <CardDescription>{t('auth.createDialog.external.description')}</CardDescription>
                </div>
                <div className="flex flex-col gap-4 px-0">
                    {hasNip07 ? (
                        <Button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                                void run(async () => {
                                    await onStartSession('nip07', {});
                                });
                            }}
                        >
                            {t('auth.createDialog.continueExtension')}
                        </Button>
                    ) : null}

                    <form className="flex flex-col gap-3" data-testid="create-account-external-form" onSubmit={handleExternalBunkerSubmit}>
                        <Label htmlFor="create-account-bunker-uri">{t('auth.createDialog.bunkerUri')}</Label>
                        <Input
                            id="create-account-bunker-uri"
                            name="bunker-uri"
                            placeholder="bunker://... o nostrconnect://..."
                            value={bunkerUri}
                            disabled={isBusy}
                            onChange={(event) => setBunkerUri(event.target.value)}
                        />
                        <Button type="submit" variant="outline" disabled={isBusy || bunkerUri.trim().length === 0}>
                            {t('auth.createDialog.connectBunker')}
                        </Button>
                    </form>
                </div>
                <AuthFlowFooter align="start">
                    <Button type="button" variant="ghost" disabled={isBusy} onClick={onBack}>
                        {t('auth.createDialog.back')}
                    </Button>
                </AuthFlowFooter>
            </>
        );
    }

    const canAdvanceFromBackup = backupConfirmed;

    return (
        <>
            <div className="flex flex-col gap-1 px-0">
                <CardTitle>{t('auth.createDialog.local.title')}</CardTitle>
                <CardDescription>{t('auth.createDialog.local.description')}</CardDescription>
            </div>
            <div className="flex flex-col gap-4 px-0">
                {localStep === 'backup' ? (
                    <div className="flex flex-col gap-5" data-testid="create-account-step-backup">
                        <div className="grid w-full gap-2">
                            <Label htmlFor="generated-nsec">{t('auth.createDialog.yourNsec')}</Label>
                            <Textarea id="generated-nsec" value={nsec} readOnly rows={4} />
                            <Button type="button" variant="outline" disabled={isBusy} onClick={() => void navigator.clipboard?.writeText(nsec)}>
                                {t('auth.createDialog.copyNsec')}
                            </Button>
                        </div>
                        <div className="grid w-full gap-2">
                            <Label htmlFor="generated-npub-backup">{t('auth.createDialog.yourNpub')}</Label>
                            <Textarea id="generated-npub-backup" value={npub} readOnly rows={3} />
                            <div className="grid grid-cols-2 gap-2">
                                <Button type="button" variant="outline" disabled={isBusy} onClick={() => void navigator.clipboard?.writeText(npub)}>
                                    {t('auth.createDialog.copyNpub')}
                                </Button>
                                <Button type="button" variant="outline" disabled={isBusy} onClick={() => downloadTextFile(`nostr-${localPubkey ?? 'local-account'}.txt`, `npub=${npub}\nnsec=${nsec}\n`)}>
                                    {t('auth.createDialog.downloadBackup')}
                                </Button>
                            </div>
                        </div>
                        <Label className="flex items-center gap-2" htmlFor="confirm-backup">
                            <input
                                id="confirm-backup"
                                name="confirm-backup"
                                type="checkbox"
                            checked={backupConfirmed}
                            disabled={isBusy}
                            onChange={(event) => setBackupConfirmed(event.target.checked)}
                            />
                            {t('auth.createDialog.confirmBackup')}
                        </Label>
                    </div>
                ) : null}

                {localStep === 'profile' ? (
                    <div className="flex flex-col gap-3" data-testid="create-account-step-profile">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="profile-name">{t('auth.createDialog.profileName')}</Label>
                            <Input id="profile-name" name="profile-name" value={profileName} disabled={isBusy} onChange={(event) => setProfileName(event.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="profile-about">{t('auth.createDialog.profileAbout')}</Label>
                            <Textarea id="profile-about" name="profile-about" value={profileAbout} disabled={isBusy} rows={4} onChange={(event) => setProfileAbout(event.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="profile-picture">{t('auth.createDialog.profileAvatar')}</Label>
                            <Input id="profile-picture" name="profile-picture" placeholder="https://..." value={profilePicture} disabled={isBusy} onChange={(event) => setProfilePicture(event.target.value)} />
                        </div>
                    </div>
                ) : null}

                {localStep === 'relays' ? (
                    <div className="flex flex-col gap-3" data-testid="create-account-step-relays">
                        <p>{t('auth.createDialog.relayDefaults')}</p>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="device-passphrase">{t('auth.createDialog.devicePassphrase')}</Label>
                            <Input
                                id="device-passphrase"
                                name="device-passphrase"
                                type="password"
                                placeholder={t('auth.createDialog.optional')}
                                value={devicePassphrase}
                                disabled={isBusy}
                                onChange={(event) => setDevicePassphrase(event.target.value)}
                            />
                        </div>
                        <Textarea
                            value={JSON.stringify(defaultRelaySettings.byType, null, 2)}
                            readOnly
                            rows={6}
                            className="field-sizing-fixed max-h-56 overflow-auto"
                        />
                    </div>
                ) : null}
            </div>
            <AuthFlowFooter>
                <Button type="button" variant="ghost" disabled={isBusy} onClick={localStep === 'backup' ? onBack : () => setLocalStep(localStep === 'profile' ? 'backup' : 'profile')}>
                    {t('auth.createDialog.back')}
                </Button>
                {localStep !== 'relays' ? (
                    <Button
                        type="button"
                        disabled={isBusy || (localStep === 'backup' && !canAdvanceFromBackup)}
                        onClick={() => setLocalStep(localStep === 'backup' ? 'profile' : 'relays')}
                    >
                        {t('auth.createDialog.continue')}
                    </Button>
                ) : (
                    <Button type="button" disabled={isBusy || !backupConfirmed} onClick={() => void handleCreateLocalAccount()}>
                        {t('auth.createDialog.createNow')}
                    </Button>
                )}
            </AuthFlowFooter>
        </>
    );
}
