import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n/useI18n';
import { useState } from 'react';
import type { NostrGroupSummary } from './GroupsPage';

interface GroupListProps {
    groups: NostrGroupSummary[];
    selectedGroupId: string | null;
    onSelectGroup: (groupId: string) => void;
    emptyTitle?: string;
    emptyDescription?: string;
    onEmptyRetry?: () => Promise<void> | void;
}

export function GroupList({ groups, selectedGroupId, onSelectGroup, emptyTitle, emptyDescription, onEmptyRetry }: GroupListProps) {
    const { t } = useI18n();
    const selectedGroup = groups.find((group) => group.id === selectedGroupId);
    const joinedGroups = groups.filter((group) => group.isSaved || group.isRemembered);
    const otherGroups = groups.filter((group) => !group.isSaved && !group.isRemembered);
    const selectedTab = selectedGroup && !selectedGroup.isSaved && !selectedGroup.isRemembered ? 'others' : 'joined';
    const [activeTab, setActiveTab] = useState(selectedTab);
    const joinedPanelId = 'groups-joined-panel';
    const othersPanelId = 'groups-others-panel';

    const renderGroups = (items: NostrGroupSummary[]) => (
        <nav aria-label={t('groups.list.aria')} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {items.length === 0 ? (
                <Empty className="min-h-[10rem] justify-center border border-dashed">
                    <EmptyHeader>
                        <EmptyTitle>{emptyTitle ?? t('groups.list.empty')}</EmptyTitle>
                        {emptyDescription ? <EmptyDescription>{emptyDescription}</EmptyDescription> : null}
                    </EmptyHeader>
                    {onEmptyRetry ? (
                        <Button type="button" variant="outline" onClick={() => { void onEmptyRetry(); }}>
                            {t('groups.retry')}
                        </Button>
                    ) : null}
                </Empty>
            ) : null}
            {items.map((group) => {
                const isSelected = group.id === selectedGroupId;

                return (
                    <Button
                        key={group.id}
                        type="button"
                        variant={isSelected ? 'secondary' : 'ghost'}
                        className="h-auto w-full justify-start px-3 py-3 text-left"
                        aria-pressed={isSelected}
                        onClick={() => onSelectGroup(group.id)}
                    >
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="truncate font-medium">{group.name}</span>
                            <span className="truncate text-xs text-muted-foreground">{group.id}</span>
                            <span className="flex flex-wrap gap-1">
                                {group.isSaved ? <Badge variant="secondary">{t('groups.status.saved')}</Badge> : null}
                            </span>
                        </span>
                        <Badge variant="secondary">
                            {group.memberCount === 1
                                ? t('groups.members.one')
                                : t('groups.members.many', { count: group.memberCount })}
                        </Badge>
                    </Button>
                );
            })}
        </nav>
    );

    return (
        <Card variant="default" size="sm" className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border border-border/70 py-0 ring-0 shadow-none">
            <CardContent className="min-h-0 flex-1">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'joined' | 'others')} className="h-full min-h-0 py-3" aria-label={t('groups.list.tabsAria')}>
                    <TabsList variant="line" className="flex h-auto w-full justify-start" aria-label={t('groups.list.tabsAria')}>
                        <TabsTrigger
                            id="groups-joined-tab"
                            value="joined"
                        >
                            {t('groups.list.joinedTab', { count: joinedGroups.length })}
                        </TabsTrigger>
                        <TabsTrigger
                            id="groups-others-tab"
                            value="others"
                        >
                            {t('groups.list.othersTab', { count: otherGroups.length })}
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent id={joinedPanelId} value="joined" className="flex min-h-0 flex-1 flex-col">
                        {renderGroups(joinedGroups)}
                    </TabsContent>
                    <TabsContent id={othersPanelId} value="others" className="flex min-h-0 flex-1 flex-col">
                        {renderGroups(otherGroups)}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
