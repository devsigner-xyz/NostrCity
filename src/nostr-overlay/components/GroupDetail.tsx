import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { FieldDescription } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/i18n/useI18n';
import { MoreHorizontalIcon } from 'lucide-react';
import { useState } from 'react';
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

function formatMessageTimestamp(createdAt: number, locale: 'es' | 'en'): string {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-ES', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(createdAt * 1000));
}

function shortPubkey(pubkey: string): string {
    return pubkey.slice(0, 8);
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
    onJoinGroup,
    onLeaveGroup,
}: GroupDetailProps) {
    const { t, locale } = useI18n();
    const [detailsOpen, setDetailsOpen] = useState(false);

    if (!group) {
        return (
            <Card variant="default" size="sm" className="h-full min-h-[18rem] border border-border/70 ring-0 shadow-none" data-testid="groups-empty-detail">
                <CardContent className="flex min-h-0 flex-1">
                    <Empty className="justify-center">
                        <EmptyHeader>
                            <EmptyTitle>{t('groups.detail.emptyTitle')}</EmptyTitle>
                            <EmptyDescription>{t('groups.detail.emptyDescription')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                </CardContent>
            </Card>
        );
    }

    const actionDescription = disabledReason;
    const textareaId = `group-message-${group.id}`;
    const textareaDescriptionId = `${textareaId}-description`;
    const isJoined = Boolean(group.isSaved || group.isRemembered);

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
        <article className="h-full min-h-0" aria-label={t('groups.detail.aria', { name: group.name })}>
            <Card variant="default" size="sm" className="h-full min-h-0 gap-0 overflow-hidden border border-border/70 py-0 ring-0 shadow-none">
                <CardHeader className="border-b pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 flex-col gap-1">
                            <CardTitle>{group.name}</CardTitle>
                            <div className="flex flex-wrap gap-1 pt-1">
                                {group.isSaved ? <Badge variant="secondary">{t('groups.status.saved')}</Badge> : null}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="w-fit">
                                {group.memberCount === 1
                                    ? t('groups.members.one')
                                    : t('groups.members.many', { count: group.memberCount })}
                            </Badge>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={t('groups.menu.open', { name: group.name })}
                                    >
                                        <MoreHorizontalIcon aria-hidden="true" />
                                        <span className="sr-only">{t('groups.menu.open', { name: group.name })}</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>
                                            {t('groups.menu.viewDetails')}
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem disabled={!canWrite} onSelect={handleLeave} aria-label={t('groups.leave.aria', { name: group.name })}>
                                            {t('groups.leave.action')}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem disabled={!canWrite} onSelect={handleSave} aria-label={t('groups.save.aria', { name: group.name })}>
                                            {t('groups.save.action')}
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 py-3">
                    <section data-testid="groups-timeline" aria-label={t('groups.timeline.title')} className="flex h-full min-h-0 flex-col gap-3">
                        {timelineItems.length === 0 ? (
                            <Empty className="min-h-[14rem] justify-center border border-dashed">
                                <EmptyHeader>
                                    <EmptyTitle>{t('groups.timeline.empty')}</EmptyTitle>
                                </EmptyHeader>
                            </Empty>
                        ) : (
                            <ol className="nostr-chat-messages pr-1">
                                {timelineItems.map((event) => (
                                    <li key={event.id} className="nostr-chat-message">
                                        <div className="nostr-chat-message-header">
                                            <strong className="nostr-chat-message-author" title={event.pubkey}>{shortPubkey(event.pubkey)}</strong>
                                            <span className="nostr-chat-message-timestamp">{formatMessageTimestamp(event.created_at, locale)}</span>
                                        </div>
                                        <p className="nostr-chat-message-body">{event.content}</p>
                                        <p className="nostr-chat-message-status">
                                            {t('groups.timeline.meta', { id: event.id.slice(0, 8) })}
                                        </p>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                </CardContent>
                <CardFooter className="flex flex-col items-stretch gap-2">
                    {isJoined ? (
                        <form
                            className="nostr-group-composer"
                            onSubmit={(event) => {
                                event.preventDefault();
                                handlePublish();
                            }}
                        >
                            <Textarea
                                id={textareaId}
                                className="nostr-chat-composer-input"
                                aria-label={t('groups.composer.aria', { name: group.name })}
                                {...(actionDescription ? { 'aria-describedby': textareaDescriptionId } : {})}
                                disabled={!canWrite}
                                value={messageDraft}
                                onChange={(event) => onMessageDraftChange(event.currentTarget.value)}
                                placeholder={t('groups.composer.placeholder')}
                            />
                            <Button
                                type="submit"
                                disabled={!canWrite}
                                title={disabledReason ?? undefined}
                                aria-label={t('groups.publish.aria', { name: group.name })}
                            >
                                {t('groups.publish.action')}
                            </Button>
                        </form>
                    ) : (
                        <Button
                            type="button"
                            className="w-full"
                            disabled={!canWrite}
                            title={disabledReason ?? undefined}
                            aria-label={t('groups.join.aria', { name: group.name })}
                            onClick={handleJoin}
                        >
                            {t('groups.join.action')}
                        </Button>
                    )}
                    {actionDescription ? <FieldDescription id={textareaDescriptionId}>{actionDescription}</FieldDescription> : null}
                </CardFooter>
            </Card>
            <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('groups.detailsDialog.title', { name: group.name })}</DialogTitle>
                        <DialogDescription>{group.description}</DialogDescription>
                    </DialogHeader>
                    <dl className="grid gap-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
                        <dt className="font-medium text-muted-foreground">{t('groups.detailsDialog.identifier')}</dt>
                        <dd className="break-all">{group.id}</dd>
                        <dt className="font-medium text-muted-foreground">{t('groups.detailsDialog.relay')}</dt>
                        <dd className="break-all">{group.relayUrl}</dd>
                        <dt className="font-medium text-muted-foreground">{t('groups.detailsDialog.members')}</dt>
                        <dd>{group.memberCount === 1 ? t('groups.members.one') : t('groups.members.many', { count: group.memberCount })}</dd>
                        <dt className="font-medium text-muted-foreground">{t('groups.detailsDialog.status')}</dt>
                        <dd className="flex flex-wrap gap-1">
                            {group.isSaved ? <Badge variant="secondary">{t('groups.status.saved')}</Badge> : null}
                            {group.metadataVerified === false ? <Badge variant="outline">{t('groups.status.unverified')}</Badge> : null}
                            {!group.isSaved && group.metadataVerified !== false ? t('groups.detailsDialog.noStatus') : null}
                        </dd>
                    </dl>
                </DialogContent>
            </Dialog>
        </article>
    );
}
