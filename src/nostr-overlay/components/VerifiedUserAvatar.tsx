import { CircleCheckIcon, TriangleAlertIcon } from 'lucide-react';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import { getNip05DisplayIdentifier } from '../../nostr/nip05';
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useI18n } from '@/i18n/useI18n';
import { sanitizeImageUrl } from '../media/image-url-policy';

interface VerifiedAvatarBadgeState {
    label: string;
    icon: typeof CircleCheckIcon;
    className?: string;
}

interface VerifiedUserAvatarProps {
    picture?: string | undefined;
    imageAlt: string;
    fallback: string;
    nip05?: string | undefined;
    verification?: Nip05ValidationResult | undefined;
    className?: string | undefined;
    fallbackClassName?: string | undefined;
    ariaHidden?: boolean | undefined;
}

function resolveBadgeState(nip05: string | undefined, verification: Nip05ValidationResult | undefined, t: ReturnType<typeof useI18n>['t']): VerifiedAvatarBadgeState | null {
    const display = getNip05DisplayIdentifier(nip05)
        || getNip05DisplayIdentifier(verification?.identifier)
        || verification?.displayIdentifier
        || verification?.identifier;

    if (!display) {
        return null;
    }

    if (verification?.status === 'verified') {
        return {
            label: t('nip05.verified', { display }),
            icon: CircleCheckIcon,
            className: 'bg-green-600 text-white',
        };
    }

    if (verification?.status === 'error') {
        return {
            label: t('nip05.error', { display }),
            icon: TriangleAlertIcon,
            className: 'bg-amber-500 text-white',
        };
    }

    if (verification?.status === 'unverified') {
        return {
            label: t('nip05.unverified', { display }),
            icon: TriangleAlertIcon,
            className: 'bg-amber-500 text-white',
        };
    }

    return {
        label: t('nip05.pending', { display }),
        icon: TriangleAlertIcon,
        className: 'bg-amber-500 text-white',
    };
}

export function VerifiedUserAvatar({
    picture,
    imageAlt,
    fallback,
    nip05,
    verification,
    className,
    fallbackClassName,
    ariaHidden,
}: VerifiedUserAvatarProps) {
    const { t } = useI18n();
    const badgeState = resolveBadgeState(nip05, verification, t);
    const safePicture = sanitizeImageUrl(picture);

    return (
        <Avatar size="lg" className={className} aria-hidden={ariaHidden}>
            {safePicture ? <AvatarImage src={safePicture} alt={imageAlt} /> : null}
            <AvatarFallback className={fallbackClassName}>{fallback}</AvatarFallback>
            {badgeState ? (
                <AvatarBadge className={badgeState.className} title={badgeState.label} aria-label={badgeState.label}>
                    <badgeState.icon aria-hidden="true" />
                </AvatarBadge>
            ) : null}
        </Avatar>
    );
}
