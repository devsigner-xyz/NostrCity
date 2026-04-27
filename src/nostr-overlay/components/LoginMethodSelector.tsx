import { useState } from 'react';
import type { ProviderResolveInput } from '../../nostr/auth/providers/types';
import type { LoginMethod } from '../../nostr/auth/session';
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

export function LoginMethodSelector({
    disabled = false,
    loadingText,
    onStartSession,
    initialMethod = 'npub',
    restrictToNpubOnly = import.meta.env.PROD,
}: LoginMethodSelectorProps) {
    const { t } = useI18n();
    const [method, setMethod] = useState<SelectorMethod>(restrictToNpubOnly ? 'npub' : initialMethod);
    const [npub, setNpub] = useState('');
    const [bunkerUri, setBunkerUri] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const run = async (action: () => Promise<void> | void) => {
        setIsSubmitting(true);
        try {
            await action();
        } catch (error) {
            const message = error instanceof Error ? error.message : t('auth.selector.genericError');
            toast.error(message, { duration: 2200 });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNpubSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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

    const handleNip46Submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const value = bunkerUri.trim();
        if (!value) {
            return;
        }

        await run(async () => {
            await onStartSession('nip46', { bunkerUri: value });
        });
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
                    <p className="text-sm text-muted-foreground">{t('auth.selector.extensionDescription')}</p>
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
                <form className="grid gap-2" data-testid="login-method-form-nip46" onSubmit={handleNip46Submit}>
                    <Label htmlFor="nostr-bunker-uri-input">{t('auth.selector.bunkerUri')}</Label>

                    <Input
                        id="nostr-bunker-uri-input"
                        name="bunker-uri"
                        placeholder="bunker://... o nostrconnect://..."
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

        </section>
    );
}
