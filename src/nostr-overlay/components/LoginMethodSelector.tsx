import { useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { createNostrConnectUri, generateNip46PairingSecret } from '../../nostr/auth/providers/nip46/runtime';
import type { ProviderResolveInput } from '../../nostr/auth/providers/types';
import type { LoginMethod } from '../../nostr/auth/session';
import { getBootstrapRelays } from '../../nostr/relay-policy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useI18n } from '@/i18n/useI18n';
import { toast } from 'sonner';

interface LoginMethodSelectorProps {
    disabled?: boolean;
    loadingText?: string;
    onStartSession: (method: LoginMethod, input: ProviderResolveInput) => Promise<void> | void;
    initialMethod?: SelectorMethod;
    restrictToNpubOnly?: boolean;
}

type SelectorMethod = 'npub' | 'nip07' | 'nip46';
type Nip46Action = 'bunker' | 'nostrconnect';
type Nip46PairingState = 'idle' | 'pairing' | 'timed-out' | 'error';

const NIP46_PAIRING_QR_SIZE_PX = 172;
const NIP46_PAIRING_RELAYS = getBootstrapRelays().slice(0, 2);

export function LoginMethodSelector({
    disabled = false,
    loadingText,
    onStartSession,
    initialMethod = 'npub',
    restrictToNpubOnly = false,
}: LoginMethodSelectorProps) {
    const { t } = useI18n();
    const [method, setMethod] = useState<SelectorMethod>(restrictToNpubOnly ? 'npub' : initialMethod);
    const [npub, setNpub] = useState('');
    const [bunkerUri, setBunkerUri] = useState('');
    const [nip46Action, setNip46Action] = useState<Nip46Action>('bunker');
    const [nostrConnectUri, setNostrConnectUri] = useState('');
    const [nostrConnectClientSecretKey, setNostrConnectClientSecretKey] = useState<Uint8Array | null>(null);
    const [nip46PairingState, setNip46PairingState] = useState<Nip46PairingState>('idle');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const run = async (action: () => Promise<void> | void, onError?: (error: unknown) => void): Promise<boolean> => {
        setIsSubmitting(true);
        try {
            await action();
            return true;
        } catch (error) {
            onError?.(error);
            const message = error instanceof Error ? error.message : t('auth.selector.genericError');
            toast.error(message, { duration: 2200 });
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNpubSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const credential = npub.trim();
        if (!credential) {
            return;
        }

        await run(async () => {
            await onStartSession('npub', { credential });
        });
    };

    const isBusy = disabled || isSubmitting;
    const busyLabel = loadingText && loadingText.trim().length > 0 ? loadingText : t('auth.selector.loading');

    const selectorMethodLabels: Record<SelectorMethod, string> = {
        npub: t('auth.selector.npub'),
        nip07: t('auth.selector.nip07'),
        nip46: t('auth.selector.nip46'),
    };
    const selectorMethods: SelectorMethod[] = restrictToNpubOnly ? ['npub'] : ['npub', 'nip07', 'nip46'];

    const handleNip46Submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const value = bunkerUri.trim();
        if (!value) {
            return;
        }

        await run(async () => {
            await onStartSession('nip46', { bunkerUri: value });
        });
    };

    const handleGenerateNostrConnect = () => {
        const clientSecretKey = generateSecretKey();
        const clientPubkey = getPublicKey(clientSecretKey);
        setNostrConnectUri(createNostrConnectUri({
            clientPubkey,
            relays: NIP46_PAIRING_RELAYS,
            secret: generateNip46PairingSecret(),
            name: t('auth.selector.nip46ClientName'),
        }));
        setNostrConnectClientSecretKey(clientSecretKey);
        setNip46PairingState('idle');
    };

    const handleCopyNostrConnect = async () => {
        if (!nostrConnectUri || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            return;
        }

        await navigator.clipboard.writeText(nostrConnectUri);
    };

    const handleStartNostrConnectPairing = async () => {
        if (!nostrConnectUri || !nostrConnectClientSecretKey) {
            return;
        }

        setNip46PairingState('pairing');
        await run(async () => {
            await onStartSession('nip46', {
                bunkerUri: nostrConnectUri,
                clientSecretKey: nostrConnectClientSecretKey,
            });
        }, (error) => setNip46PairingState(isTimeoutError(error) ? 'timed-out' : 'error'));
    };

    return (
        <section className="grid gap-3" data-testid="login-method-selector" aria-label={t('auth.selector.aria')}>
            <div className="grid gap-2">
                <Label htmlFor="nostr-login-method-trigger">{t('auth.selector.accessMethod')}</Label>
                <Select value={method} onValueChange={(value) => setMethod(value as SelectorMethod)} disabled={isBusy || restrictToNpubOnly}>
                    <SelectTrigger id="nostr-login-method-trigger" className="w-full" data-testid="login-method-trigger" aria-label={t('auth.selector.loginMethodAria')}>
                        <SelectValue>{selectorMethodLabels[method]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {selectorMethods.map((selectorMethod) => (
                                <SelectItem key={selectorMethod} value={selectorMethod}>{selectorMethodLabels[selectorMethod]}</SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>

            {method === 'npub' ? (
                <form className="grid gap-2" data-testid="login-method-form-npub" onSubmit={handleNpubSubmit}>
                    <Label htmlFor="nostr-npub-input">{t('auth.selector.npubLabel')}</Label>

                    <Input
                        id="nostr-npub-input"
                        name="npub"
                        placeholder="npub1..."
                        value={npub}
                        disabled={isBusy}
                        onChange={(event) => setNpub(event.target.value)}
                    />

                    <Button type="submit" className="mt-2 w-full" data-testid="login-method-submit-npub" disabled={isBusy || npub.trim().length === 0}>
                        {isBusy ? (
                            <>
                                <Spinner data-icon="inline-start" />
                                {busyLabel}
                            </>
                        ) : t('auth.selector.submit')}
                    </Button>
                </form>
            ) : null}

            {method === 'nip07' ? (
                <div className="grid gap-2">
                    <Button
                        type="button"
                        className="mt-2 w-full"
                        data-testid="login-method-submit-nip07"
                        onClick={() => {
                            void run(async () => {
                                await onStartSession('nip07', {});
                            });
                        }}
                        disabled={isBusy}
                    >
                        {isBusy ? (
                            <>
                                <Spinner data-icon="inline-start" />
                                {busyLabel}
                            </>
                        ) : t('auth.selector.continueExtension')}
                    </Button>
                </div>
            ) : null}

            {method === 'nip46' ? (
                <div className="grid gap-3">
                    <ToggleGroup
                        type="single"
                        value={nip46Action}
                        onValueChange={(value) => {
                            if (value !== 'bunker' && value !== 'nostrconnect') {
                                return;
                            }
                            setNip46Action(value);
                            if (value === 'nostrconnect' && !nostrConnectUri) {
                                handleGenerateNostrConnect();
                            }
                        }}
                        disabled={isBusy}
                        variant="outline"
                        className="grid w-full grid-cols-2"
                    >
                        <ToggleGroupItem value="bunker" className="w-full">
                            {t('auth.selector.nip46PasteAction')}
                        </ToggleGroupItem>
                        <ToggleGroupItem value="nostrconnect" className="w-full">
                            {t('auth.selector.nip46NostrConnectAction')}
                        </ToggleGroupItem>
                    </ToggleGroup>

                    {nip46Action === 'bunker' ? (
                        <form className="grid gap-2" data-testid="login-method-form-nip46" onSubmit={handleNip46Submit}>
                            <div className="grid gap-1">
                                <Label htmlFor="nostr-bunker-uri-input">{t('auth.selector.bunkerUri')}</Label>
                                <p className="text-xs text-muted-foreground">{t('auth.selector.nip46PasteDescription')}</p>
                            </div>

                            <Input
                                id="nostr-bunker-uri-input"
                                name="bunker-uri"
                                placeholder={t('auth.selector.bunkerUriPlaceholder')}
                                value={bunkerUri}
                                disabled={isBusy}
                                onChange={(event) => setBunkerUri(event.target.value)}
                            />

                            <Button type="submit" className="mt-2 w-full" data-testid="login-method-submit-nip46" disabled={isBusy || bunkerUri.trim().length === 0}>
                                {isBusy ? (
                                    <>
                                        <Spinner data-icon="inline-start" />
                                        {busyLabel}
                                    </>
                                ) : t('auth.selector.connectBunker')}
                            </Button>
                        </form>
                    ) : null}

                    {nip46Action === 'nostrconnect' ? (
                        <div className="grid gap-3">
                            <p className="text-xs text-muted-foreground">{t('auth.selector.nip46NostrConnectDescription')}</p>
                            <Button type="button" variant="outline" onClick={handleGenerateNostrConnect} disabled={isBusy}>
                                {t('auth.selector.nip46GenerateQr')}
                            </Button>

                            {nostrConnectUri ? (
                                <div className="grid gap-3 rounded-lg border bg-card p-3 text-card-foreground">
                                    {nip46PairingState === 'pairing' ? (
                                        <p className="text-sm text-muted-foreground" role="status">
                                            {t('auth.selector.nip46PairingWaiting')}
                                        </p>
                                    ) : null}
                                    {nip46PairingState === 'error' ? (
                                        <p className="text-sm text-destructive" role="status">
                                            {t('auth.selector.nip46PairingError')}
                                        </p>
                                    ) : null}
                                    {nip46PairingState === 'timed-out' ? (
                                        <p className="text-sm text-destructive" role="status">
                                            {t('auth.selector.nip46PairingTimedOut')}
                                        </p>
                                    ) : null}
                                    <div
                                        data-testid="nip46-nostrconnect-qr"
                                        className="mx-auto rounded-lg bg-white p-2 shadow-xs"
                                        aria-label={t('auth.selector.nip46QrAria')}
                                    >
                                        <QRCodeSVG
                                            value={nostrConnectUri}
                                            size={NIP46_PAIRING_QR_SIZE_PX}
                                            level="M"
                                            marginSize={1}
                                            title={t('auth.selector.nip46QrAria')}
                                        />
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            aria-label={t('auth.selector.nip46CopyAria')}
                                            onClick={() => void handleCopyNostrConnect()}
                                            disabled={isBusy}
                                        >
                                            {t('auth.selector.nip46Copy')}
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() => void handleStartNostrConnectPairing()}
                                            disabled={isBusy || nip46PairingState === 'pairing'}
                                        >
                                            {isBusy || nip46PairingState === 'pairing' ? (
                                                <>
                                                    <Spinner data-icon="inline-start" />
                                                    {t('auth.selector.nip46PairingButtonBusy')}
                                                </>
                                            ) : t('auth.selector.nip46StartPairing')}
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}

        </section>
    );
}

function isTimeoutError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    return /\btime(?:d)?\s*out\b|timeout/i.test(error.message);
}
