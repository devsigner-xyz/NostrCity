import { useState } from 'react';
import type { ProviderResolveInput } from '../../nostr/auth/providers/types';
import type { AuthSessionState, LoginMethod } from '../../nostr/auth/session';
import { CreateAccountMethodSelector, type CreateAccountMethod } from './CreateAccountMethodSelector';
import { CreateAccountDialog, type CreateLocalAccountInput } from './CreateAccountDialog';
import { LoginMethodSelector } from './LoginMethodSelector';
import { AuthFlowFooter } from './AuthFlowFooter';
import { useI18n } from '@/i18n/useI18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

interface LoginGateScreenProps {
    authSession?: AuthSessionState | undefined;
    savedLocalAccount?: { pubkey: string; mode: 'device' | 'passphrase' } | undefined;
    disabled?: boolean;
    mapLoaderText?: string | null;
    overlayTheme: 'light' | 'dark';
    restoringSession?: boolean;
    onStartSession: (method: LoginMethod, input: ProviderResolveInput) => Promise<void> | void;
}

export function LoginGateScreen({
    authSession,
    savedLocalAccount,
    disabled = false,
    mapLoaderText,
    overlayTheme,
    restoringSession = false,
    onStartSession,
}: LoginGateScreenProps) {
    const { t } = useI18n();
    const [panel, setPanel] = useState<'login' | 'create-account-selector' | 'create-account-flow'>('login');
    const [selectedCreateAccountMethod, setSelectedCreateAccountMethod] = useState<CreateAccountMethod | undefined>(undefined);
    const [unlockPassphrase, setUnlockPassphrase] = useState('');

    const handleCreateAccountMethod = (method: CreateAccountMethod) => {
        setSelectedCreateAccountMethod(method);
        setPanel('create-account-flow');
    };
    const loginMethodSelectorProps = {
        disabled,
        ...(mapLoaderText === null || mapLoaderText === undefined ? {} : { loadingText: mapLoaderText }),
        onStartSession: async (method: LoginMethod, input: ProviderResolveInput) => {
            await onStartSession(method, input);
        },
    };

    const isBusy = disabled;
    const showUnlockLocalAccount = Boolean(authSession && authSession.method === 'local' && authSession.locked);
    const lockedLocalPubkey = authSession?.method === 'local' && authSession.locked ? authSession.pubkey : undefined;
    const [savedLocalPassphrase, setSavedLocalPassphrase] = useState('');
    const restorationSubtitle = mapLoaderText && mapLoaderText.trim().length > 0 ? mapLoaderText : t('auth.login.preparingAccess');
    const loginLogo = overlayTheme === 'dark' ? '/logo-v2-dark.png' : '/logo-v2-light.png';

    return (
        <div className="nostr-login-screen nostr-login-screen-dialog" data-testid="login-gate-screen" role="main" aria-label={t('auth.login.screen')}>
            <div className="nostr-login-screen-center">
                <Card variant="elevated" className="nostr-login-screen-card w-full max-w-[448px] gap-0 py-0">
                    <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
                        <div className="nostr-login-cover-wrap">
                            <img src={loginLogo} alt={t('auth.login.coverAlt')} className="nostr-login-cover h-auto w-auto max-w-full" />
                        </div>

                        {restoringSession ? (
                            <>
                                <Empty className="min-h-48 border-0 p-0" role="status" aria-live="polite">
                                    <EmptyHeader>
                                        <EmptyMedia variant="icon">
                                            <Spinner />
                                        </EmptyMedia>
                                        <EmptyTitle>{t('auth.login.restoringSession')}</EmptyTitle>
                                        <EmptyDescription>{restorationSubtitle}</EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                                <Badge variant="outline" asChild className="mx-auto h-auto gap-1.5 py-1 pl-1 pr-2">
                                    <a
                                        href="https://github.com/strhodler"
                                        target="_blank"
                                        rel="noreferrer"
                                        data-testid="devsigner-attribution-link"
                                    >
                                        <img src="/strhodler.jpg" alt="" className="size-5 rounded-full object-cover" />
                                        {t('auth.login.devsignerByline')}
                                    </a>
                                </Badge>
                            </>
                        ) : showUnlockLocalAccount ? (
                            <form
                                data-testid="unlock-local-account-form"
                                className="flex flex-col gap-4"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (!lockedLocalPubkey) {
                                        return;
                                    }

                                    void onStartSession('local', {
                                        pubkey: lockedLocalPubkey,
                                        passphrase: unlockPassphrase.trim(),
                                    });
                                }}
                            >
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="unlock-passphrase">{t('auth.login.localPassphrase')}</Label>
                                    <Input
                                        id="unlock-passphrase"
                                        name="unlock-passphrase"
                                        type="password"
                                        value={unlockPassphrase}
                                        disabled={isBusy}
                                        onChange={(event) => setUnlockPassphrase(event.target.value)}
                                    />
                                </div>
                                <Button type="submit" disabled={isBusy || unlockPassphrase.trim().length === 0}>
                                    {t('auth.login.unlockAccount')}
                                </Button>
                            </form>
                        ) : panel === 'create-account-selector' ? (
                            <>
                                <CreateAccountMethodSelector disabled={disabled} onSelectMethod={handleCreateAccountMethod} />
                                <AuthFlowFooter align="start">
                                    <Button type="button" variant="ghost" disabled={disabled} onClick={() => setPanel('login')}>
                                        {t('auth.login.backToLogin')}
                                    </Button>
                                </AuthFlowFooter>
                            </>
                        ) : panel === 'create-account-flow' && selectedCreateAccountMethod ? (
                            <CreateAccountDialog
                                disabled={disabled}
                                initialMethod={selectedCreateAccountMethod}
                                hasNip07={Boolean((window as unknown as { nostr?: unknown }).nostr)}
                                onBack={() => {
                                    setPanel('create-account-selector');
                                }}
                                onStartSession={async (method, input) => {
                                    await onStartSession(method, input);
                                }}
                                onCreateLocalAccount={async (input: CreateLocalAccountInput) => {
                                    await onStartSession('local', {
                                        secretKey: input.secretKey,
                                        ...(input.passphrase ? { passphrase: input.passphrase } : {}),
                                        ...(input.profile ? { profile: input.profile } : {}),
                                        relaySettings: input.relaySettings,
                                    } as ProviderResolveInput);
                                }}
                            />
                        ) : (
                            <>
                                {savedLocalAccount ? (
                                    <LoginMethodSelector {...loginMethodSelectorProps} />
                                ) : (
                                    <div className="nostr-login-gate-actions grid gap-3" data-testid="login-gate-actions">
                                        <LoginMethodSelector {...loginMethodSelectorProps} />
                                        <Button type="button" variant="outline" disabled={disabled} onClick={() => setPanel('create-account-selector')}>
                                            {t('auth.login.createAccount')}
                                        </Button>
                                    </div>
                                )}
                                {savedLocalAccount?.mode === 'device' ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={disabled}
                                        onClick={() => {
                                            void onStartSession('local', { pubkey: savedLocalAccount.pubkey });
                                        }}
                                    >
                                        {t('auth.login.continueSavedLocal')}
                                    </Button>
                                ) : null}
                                {savedLocalAccount?.mode === 'passphrase' ? (
                                    <form
                                        className="flex flex-col gap-3"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            void onStartSession('local', {
                                                pubkey: savedLocalAccount.pubkey,
                                                passphrase: savedLocalPassphrase.trim(),
                                            });
                                        }}
                                        >
                                            <div className="flex flex-col gap-2">
                                                <Label htmlFor="saved-local-passphrase">{t('auth.login.unlockSavedLocal')}</Label>
                                                <Input
                                                id="saved-local-passphrase"
                                                name="saved-local-passphrase"
                                                type="password"
                                                value={savedLocalPassphrase}
                                                disabled={disabled}
                                                onChange={(event) => setSavedLocalPassphrase(event.target.value)}
                                            />
                                        </div>
                                        <Button type="submit" variant="outline" disabled={disabled || savedLocalPassphrase.trim().length === 0}>
                                            {t('auth.login.unlockSavedLocal')}
                                        </Button>
                                    </form>
                                ) : null}
                                {savedLocalAccount ? (
                                    <Button type="button" variant="outline" disabled={disabled} onClick={() => setPanel('create-account-selector')}>
                                        {t('auth.login.createAccount')}
                                    </Button>
                                ) : null}
                            </>
                        )}

                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
