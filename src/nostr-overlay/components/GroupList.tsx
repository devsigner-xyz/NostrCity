import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n/useI18n';
import type { NostrGroupSummary } from './GroupsPage';

interface GroupListProps {
    groups: NostrGroupSummary[];
    selectedGroupId: string | null;
    onSelectGroup: (groupId: string) => void;
}

export function GroupList({ groups, selectedGroupId, onSelectGroup }: GroupListProps) {
    const { t } = useI18n();

    return (
        <Card className="min-h-0 lg:max-h-full">
            <CardHeader>
                <CardTitle>{t('groups.list.title')}</CardTitle>
                <CardDescription>{t('groups.list.description')}</CardDescription>
            </CardHeader>
            <CardContent>
                <nav aria-label={t('groups.list.aria')} className="flex flex-col gap-2">
                    {groups.map((group) => {
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
            </CardContent>
        </Card>
    );
}
