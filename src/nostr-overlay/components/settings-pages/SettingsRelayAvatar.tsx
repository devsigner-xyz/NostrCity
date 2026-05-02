import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { sanitizeImageUrl } from '../../media/image-url-policy';
import type { RelayDetails, RelayInformationDocument } from './types';

interface SettingsRelayAvatarProps {
    details: RelayDetails;
    document: RelayInformationDocument | undefined;
    fallback: string;
    className?: string | undefined;
    size?: 'default' | 'sm' | 'lg' | undefined;
}

export function SettingsRelayAvatar({ details, document, fallback, className, size }: SettingsRelayAvatarProps) {
    const safeIcon = sanitizeImageUrl(document?.icon);

    return (
        <Avatar className={className} {...(size ? { size } : {})}>
            {safeIcon ? (
                <img
                    data-slot="avatar-image"
                    src={safeIcon}
                    alt={document?.name || details.host}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 z-10 aspect-square size-full rounded-full object-cover"
                    onError={(event) => {
                        event.currentTarget.hidden = true;
                    }}
                />
            ) : null}
            <AvatarFallback>{fallback}</AvatarFallback>
        </Avatar>
    );
}
