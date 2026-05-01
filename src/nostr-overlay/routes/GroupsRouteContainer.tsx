import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { useI18n } from '@/i18n/useI18n';
import { OverlayPageHeader } from '../components/OverlayPageHeader';
import { OverlaySurface } from '../components/OverlaySurface';

export function GroupsRouteContainer() {
    const { t } = useI18n();

    return (
        <OverlaySurface ariaLabel={t('groups.title')}>
            <div data-testid="groups-route" className="nostr-routed-surface-panel nostr-page-layout flex min-h-0 flex-1 flex-col gap-4">
                <OverlayPageHeader
                    title={t('groups.title')}
                    description={t('groups.description')}
                />

                <Empty className="flex-1 rounded-lg border border-dashed border-border/70 bg-card/60 p-6">
                    <EmptyHeader>
                        <EmptyTitle>{t('groups.placeholder.title')}</EmptyTitle>
                        <EmptyDescription>{t('groups.placeholder.description')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </div>
        </OverlaySurface>
    );
}
