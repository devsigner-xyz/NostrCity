import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/utils';

interface UserBotBadgeProps {
    bot?: boolean | undefined;
    className?: string | undefined;
}

export function UserBotBadge({ bot, className }: UserBotBadgeProps) {
    const { t } = useI18n();

    if (bot !== true) {
        return null;
    }

    return (
        <Badge variant="secondary" className={cn('shrink-0 align-middle', className)}>
            {t('profile.info.bot')}
        </Badge>
    );
}
