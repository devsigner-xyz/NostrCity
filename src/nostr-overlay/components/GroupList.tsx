import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n/useI18n';
import { useState } from 'react';
import type { NostrGroupSummary } from './GroupsPage';

interface GroupListProps {
    groups: NostrGroupSummary[];
    selectedGroupId: string | null;
    onSelectGroup: (groupId: string) => void;
}

export function GroupList({ groups, selectedGroupId, onSelectGroup }: GroupListProps) {
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
                            <span className="truncate text-xs text-muted-foreground">{group.relayUrl}</span>
                            <span className="flex flex-wrap gap-1">
                                {group.isSaved ? <Badge variant="secondary">{t('groups.status.saved')}</Badge> : null}
                                {group.isRemembered ? <Badge variant="outline">{t('groups.status.remembered')}</Badge> : null}
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
        <Card className="flex min-h-0 flex-col lg:max-h-full">
            <CardHeader>
                <CardTitle>{t('groups.list.title')}</CardTitle>
                <CardDescription>{t('groups.list.description')}</CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1">
                <div className="flex h-full min-h-0 flex-col gap-2">
                    <div role="tablist" aria-label={t('groups.list.tabsAria')} className="grid grid-cols-2 rounded-lg bg-muted p-[3px] text-muted-foreground">
                        <Button
                            id="groups-joined-tab"
                            type="button"
                            role="tab"
                            variant={activeTab === 'joined' ? 'secondary' : 'ghost'}
                            aria-selected={activeTab === 'joined'}
                            aria-controls={joinedPanelId}
                            className="h-8"
                            onClick={() => setActiveTab('joined')}
                        >
                            {t('groups.list.joinedTab', { count: joinedGroups.length })}
                        </Button>
                        <Button
                            id="groups-others-tab"
                            type="button"
                            role="tab"
                            variant={activeTab === 'others' ? 'secondary' : 'ghost'}
                            aria-selected={activeTab === 'others'}
                            aria-controls={othersPanelId}
                            className="h-8"
                            onClick={() => setActiveTab('others')}
                        >
                            {t('groups.list.othersTab', { count: otherGroups.length })}
                        </Button>
                    </div>
                    <div
                        id={activeTab === 'joined' ? joinedPanelId : othersPanelId}
                        role="tabpanel"
                        aria-labelledby={activeTab === 'joined' ? 'groups-joined-tab' : 'groups-others-tab'}
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        {activeTab === 'joined' ? renderGroups(joinedGroups) : renderGroups(otherGroups)}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
