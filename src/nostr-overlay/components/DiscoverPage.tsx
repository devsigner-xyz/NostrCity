import type { EasterEggId } from '../../ts/ui/easter_eggs';
import { EASTER_EGG_MISSIONS } from '../easter-eggs/missions';
import { useI18n } from '@/i18n/useI18n';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { OverlayPageHeader } from './OverlayPageHeader';
import { OverlaySurface } from './OverlaySurface';

interface DiscoverPageProps {
    discoveredIds: EasterEggId[];
}

export function DiscoverPage({ discoveredIds }: DiscoverPageProps) {
    const { t } = useI18n();
    const discoveredSet = new Set(discoveredIds);
    const discoveredCount = EASTER_EGG_MISSIONS.reduce(
        (count, mission) => count + (discoveredSet.has(mission.id) ? 1 : 0),
        0
    );

    return (
        <OverlaySurface ariaLabel={t('discover.aria')}>
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="nostr-easter-egg-missions-page nostr-routed-surface-panel nostr-page-layout">
                    <OverlayPageHeader
                        title={t('discover.title')}
                        description={t('discover.description', { count: String(discoveredCount), total: String(EASTER_EGG_MISSIONS.length) })}
                    />
                    <section className="grid gap-2.5">
                        <ul className="nostr-easter-egg-missions-list">
                            {EASTER_EGG_MISSIONS.map((mission) => {
                                const discovered = discoveredSet.has(mission.id);
                                return (
                                    <li key={mission.id}>
                                        <Card size="sm" data-testid="discover-mission-card" className="gap-0 py-0">
                                            <CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                                                <span className="grid min-w-0 gap-0.5">
                                                    <span data-testid="discover-mission-title" className="text-sm font-medium text-card-foreground">
                                                        {t(mission.titleKey)}
                                                    </span>
                                                    <span data-testid="discover-mission-subtitle" className="text-xs text-muted-foreground">
                                                        {t(mission.subtitleKey)}
                                                    </span>
                                                </span>
                                                <Badge variant={discovered ? 'success' : 'outline'}>
                                                    {discovered ? t('discover.status.found') : t('discover.status.pending')}
                                                </Badge>
                                            </CardContent>
                                        </Card>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                </div>
            </div>
        </OverlaySurface>
    );
}
