import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import type { GroupMembershipStatus, NostrGroupSummary } from './GroupsPage';
import { formatGroupDisplayId } from './group-display';

interface GroupListProps {
    groups: NostrGroupSummary[];
    selectedGroupId: string | null;
    onSelectGroup: (groupId: string) => void;
    canWrite: boolean;
    disabledReason: string | null;
    onJoinGroup: (groupId: string) => void;
    emptyTitle?: string;
    emptyDescription?: string;
    onEmptyRetry?: () => Promise<void> | void;
}

function membershipStatus(group: NostrGroupSummary): GroupMembershipStatus {
    return group.membershipStatus ?? (group.isRemembered ? 'pending' : group.isSaved ? 'confirmed' : 'none');
}

export function GroupList({ groups, selectedGroupId, onSelectGroup, canWrite, disabledReason, onJoinGroup, emptyTitle, emptyDescription, onEmptyRetry }: GroupListProps) {
    const { t } = useI18n();
    const selectedGroup = groups.find((group) => group.id === selectedGroupId);
    const joinedGroups = groups.filter((group) => group.isSaved || group.isRemembered);
    const otherGroups = groups.filter((group) => !group.isSaved && !group.isRemembered);
    const selectedTab = selectedGroup && !selectedGroup.isSaved && !selectedGroup.isRemembered ? 'others' : 'joined';
    const [activeTab, setActiveTab] = useState(selectedTab);
    const joinedPanelId = 'groups-joined-panel';
    const othersPanelId = 'groups-others-panel';

    useEffect(() => {
        setActiveTab(selectedTab);
    }, [selectedTab]);

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
            {items.length > 0 ? (
                <ItemGroup className="gap-2">
                    {items.map((group) => {
                        const isSelected = group.id === selectedGroupId;
                        const status = membershipStatus(group);

                        return (
                            <Item
                                key={group.id}
                                role="listitem"
                                variant="outline"
                                size="sm"
                                data-selected={isSelected ? 'true' : undefined}
                                className={cn('relative shrink-0', isSelected ? 'border-primary/50 bg-muted/70' : undefined)}
                            >
                                <ItemContent className="relative min-w-0">
                                    <button
                                        type="button"
                                        className="absolute inset-0 z-10 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        aria-pressed={isSelected}
                                        onClick={() => onSelectGroup(group.id)}
                                    >
                                        <span className="sr-only">{group.name}</span>
                                    </button>
                                    <ItemTitle className="w-full truncate">{group.name}</ItemTitle>
                                    <ItemDescription className="truncate">{formatGroupDisplayId(group.id)}</ItemDescription>
                                    {group.isSaved ? (
                                        <div className="flex flex-wrap gap-1">
                                            <Badge variant="secondary">{t('groups.status.saved')}</Badge>
                                        </div>
                                    ) : null}
                                </ItemContent>
                                {status === 'none' ? (
                                    <ItemActions className="relative z-20">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={!canWrite}
                                            title={disabledReason ?? undefined}
                                            aria-label={t('groups.join.aria', { name: group.name })}
                                            onClick={() => {
                                                if (!canWrite) {
                                                    return;
                                                }

                                                onJoinGroup(group.id);
                                            }}
                                        >
                                            {t('groups.join.action')}
                                        </Button>
                                    </ItemActions>
                                ) : status === 'pending' ? (
                                    <ItemActions className="relative z-20">
                                        <Button type="button" variant="secondary" size="sm" disabled>
                                            {t('groups.join.pending.action')}
                                        </Button>
                                    </ItemActions>
                                ) : null}
                            </Item>
                        );
                    })}
                </ItemGroup>
            ) : null}
        </nav>
    );

    return (
        <Card variant="default" size="sm" className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border border-border/70 py-0 ring-0 shadow-none">
            <CardContent className="min-h-0 flex-1">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'joined' | 'others')} className="h-full min-h-0 pb-3" aria-label={t('groups.list.tabsAria')}>
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
