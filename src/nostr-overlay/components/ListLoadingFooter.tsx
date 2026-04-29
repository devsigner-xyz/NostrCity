import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/utils';

interface ListLoadingFooterProps {
    loading: boolean;
    label?: string;
    className?: string;
}

export function ListLoadingFooter({ loading, label = 'Cargando mas...', className }: ListLoadingFooterProps) {
    const { t } = useI18n();
    if (!loading) {
        return null;
    }

    return (
        <div className={cn('nostr-list-loading-footer flex w-full justify-center', className)} role="status" aria-live="polite">
            <Spinner />
            <span>{label === 'Cargando mas...' ? t('listLoadingFooter.default') : label}</span>
        </div>
    );
}
