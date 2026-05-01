import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/i18n/useI18n';
import type { NostrEvent } from '../../nostr/types';
import type { NostrGroupSummary } from './GroupsPage';

interface GroupDetailProps {
    group: NostrGroupSummary | null;
    canWrite: boolean;
    disabledReason: string | null;
    messageDraft: string;
    timeline: NostrEvent[];
    onMessageDraftChange: (message: string) => void;
    onPublishMessage: (groupId: string, message: string) => void;
    onSaveGroup: (groupId: string) => void;
    onSyncPublicGroups: () => void;
    onJoinGroup: (groupId: string) => void;
    onLeaveGroup: (groupId: string) => void;
}

function sortedTimeline(timeline: NostrEvent[]): NostrEvent[] {
    return [...timeline].sort((left, right) => {
        if (left.created_at !== right.created_at) {
            return right.created_at - left.created_at;
        }

        return left.id.localeCompare(right.id);
    });
}

export function GroupDetail({
    group,
    canWrite,
    disabledReason,
    messageDraft,
    timeline,
    onMessageDraftChange,
    onPublishMessage,
    onSaveGroup,
    onSyncPublicGroups,
    onJoinGroup,
    onLeaveGroup,
}: GroupDetailProps) {
    const { t } = useI18n();

    if (!group) {
        return (
            <Card className="min-h-[18rem]">
                <CardHeader>
                    <CardTitle>{t('groups.detail.emptyTitle')}</CardTitle>
                    <CardDescription>{t('groups.detail.emptyDescription')}</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const actionDescription = disabledReason ?? t('groups.save.publicWarning');
    const textareaId = `group-message-${group.id}`;

    const handlePublish = (): void => {
        if (!canWrite) {
            return;
        }

        onPublishMessage(group.id, messageDraft);
    };

    const handleSave = (): void => {
        if (!canWrite) {
            return;
        }

        onSaveGroup(group.id);
    };

    const handleSync = (): void => {
        if (!canWrite) {
            return;
        }

        onSyncPublicGroups();
    };

    const handleJoin = (): void => {
        if (!canWrite) {
            return;
        }

        onJoinGroup(group.id);
    };

    const handleLeave = (): void => {
        if (!canWrite) {
            return;
        }

        onLeaveGroup(group.id);
    };

    const timelineItems = sortedTimeline(timeline);

    return (
        <article aria-label={t('groups.detail.aria', { name: group.name })}>
            <Card className="min-h-full">
                <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 flex-col gap-1">
                            <CardTitle>{group.name}</CardTitle>
                            <CardDescription>{group.description}</CardDescription>
                            <div className="flex flex-wrap gap-1 pt-1">
                                {group.isSaved ? <Badge variant="secondary">{t('groups.status.saved')}</Badge> : null}
                                {group.isRemembered ? <Badge variant="outline">{t('groups.status.remembered')}</Badge> : null}
                            </div>
                            {group.metadataVerified === false ? (
                                <p className="pt-1 text-xs text-muted-foreground">{t('groups.status.unverified')}</p>
                            ) : null}
                        </div>
                        <Badge variant="secondary" className="w-fit">
                            {group.memberCount === 1
                                ? t('groups.members.one')
                                : t('groups.members.many', { count: group.memberCount })}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <FieldGroup className="gap-5">
                        <Field data-disabled={!canWrite}>
                            <FieldLabel htmlFor={textareaId}>{t('groups.composer.label')}</FieldLabel>
                            <Textarea
                                id={textareaId}
                                aria-label={t('groups.composer.aria', { name: group.name })}
                                aria-describedby={`${textareaId}-description`}
                                disabled={!canWrite}
                                value={messageDraft}
                                onChange={(event) => onMessageDraftChange(event.currentTarget.value)}
                                placeholder={t('groups.composer.placeholder')}
                            />
                            <FieldDescription id={`${textareaId}-description`}>{actionDescription}</FieldDescription>
                        </Field>
                        <section data-testid="groups-timeline" aria-label={t('groups.timeline.title')} className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-medium">{t('groups.timeline.title')}</h3>
                                <span className="text-xs text-muted-foreground">{group.relayUrl}</span>
                            </div>
                            {timelineItems.length === 0 ? (
                                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                                    {t('groups.timeline.empty')}
                                </p>
                            ) : (
                                <ol className="space-y-2">
                                    {timelineItems.map((event) => (
                                        <li key={event.id} className="rounded-md border bg-card/60 px-3 py-2">
                                            <p className="whitespace-pre-wrap text-sm">{event.content}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {t('groups.timeline.meta', { id: event.id.slice(0, 8) })}
                                            </p>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>
                    </FieldGroup>
                </CardContent>
                <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!canWrite}
                            title={disabledReason ?? undefined}
                            aria-label={t('groups.join.aria', { name: group.name })}
                            onClick={handleJoin}
                        >
                            {t('groups.join.action')}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!canWrite}
                            title={disabledReason ?? undefined}
                            aria-label={t('groups.leave.aria', { name: group.name })}
                            onClick={handleLeave}
                        >
                            {t('groups.leave.action')}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!canWrite}
                            title={disabledReason ?? undefined}
                            aria-label={t('groups.save.aria', { name: group.name })}
                            onClick={handleSave}
                        >
                            {t('groups.save.action')}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!canWrite}
                            title={disabledReason ?? undefined}
                            aria-label={t('groups.sync.aria')}
                            onClick={handleSync}
                        >
                            {t('groups.sync.action')}
                        </Button>
                        <Button
                            type="button"
                            disabled={!canWrite}
                            title={disabledReason ?? undefined}
                            aria-label={t('groups.publish.aria', { name: group.name })}
                            onClick={handlePublish}
                        >
                            {t('groups.publish.action')}
                        </Button>
                    </div>
                </CardFooter>
            </Card>
        </article>
    );
}
