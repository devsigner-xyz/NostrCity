import type { Nip05ValidationResult } from '../../nostr/nip05';
import { getNip05DisplayIdentifier } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import { useI18n } from '@/i18n/useI18n';

interface Nip05IdentifierProps {
    profile?: NostrProfile;
    verification?: Nip05ValidationResult;
    className?: string;
    mode?: 'full' | 'icon';
}

function buildNip05StatusLabel(display: string, t: ReturnType<typeof useI18n>['t'], verification?: Nip05ValidationResult): string {
    if (verification?.status === 'verified') {
        return t('nip05.verified', { display });
    }

    if (verification?.status === 'error') {
        return t('nip05.error', { display });
    }

    if (verification?.status === 'unverified') {
        return t('nip05.unverified', { display });
    }

    return t('nip05.pending', { display });
}

export function Nip05Identifier({ profile, verification, className, mode = 'full' }: Nip05IdentifierProps) {
    const { t } = useI18n();
    const display = getNip05DisplayIdentifier(profile?.nip05);
    if (!display) {
        return null;
    }

    const verified = verification?.status === 'verified';
    const statusLabel = buildNip05StatusLabel(display, t, verification);

    if (mode === 'icon') {
        return (
            <span
                className={`nostr-nip05-status-icon${verified ? ' is-verified' : ' is-unverified'}${className ? ` ${className}` : ''}`}
                title={statusLabel}
                aria-label={statusLabel}
            />
        );
    }

    return (
        <span
            className={`nostr-nip05-text${className ? ` ${className}` : ''}`}
            title={statusLabel}
            aria-label={statusLabel}
        >
            {display}
        </span>
    );
}
