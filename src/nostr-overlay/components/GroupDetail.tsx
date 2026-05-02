import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { FieldDescription } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/i18n/useI18n';
import { MoreHorizontalIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import { useSelectedImageFile } from '../hooks/useSelectedImageFile';
import type { ImageFileRejectionReason } from '../media/image-file-policy';
import type { UploadedImageAttachment } from '../media/upload-note-image-attachment';
import {
    ComposerImageAttachmentButton,
    ComposerImageAttachmentPreview,
    imageFileRejectionMessageKey,
} from './ComposerImageAttachment';
import type { NostrGroupSummary } from './GroupsPage';
import { RichNostrContent } from './RichNostrContent';
import { formatGroupDisplayId } from './group-display';

interface GroupDetailProps {
    group: NostrGroupSummary | null;
    canWrite: boolean;
    disabledReason: string | null;
    messageDraft: string;
    timeline: NostrEvent[];
    isGroupDetailLoading: boolean;
    groupDetailError: string | null;
    onMessageDraftChange: (message: string) => void;
    onPublishMessage: (groupId: string, message: string, options?: { tags?: string[][] }) => void;
    onUploadImage?: (file: File) => Promise<UploadedImageAttachment | undefined> | UploadedImageAttachment | undefined;
    onSaveGroup: (groupId: string) => void;
    onLeaveGroup: (groupId: string) => void;
    onRetryGroupDetail: () => Promise<void> | void;
    profilesByPubkey?: Record<string, NostrProfile>;
    eventReferencesById?: Record<string, NostrEvent>;
    onSelectProfile?: (pubkey: string) => void;
    onResolveProfiles?: (pubkeys: string[]) => Promise<void> | void;
    onSelectEventReference?: (eventId: string) => void;
    onResolveEventReferences?: (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void;
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

function profileDisplayName(pubkey: string, profile: NostrProfile | undefined): string {
    return profile?.displayName?.trim() || profile?.name?.trim() || shortPubkey(pubkey);
}

function authorProfileButtonClassName(enabled: boolean): string {
    return enabled
        ? 'nostr-chat-message-author cursor-pointer rounded-sm text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        : 'nostr-chat-message-author';
}

function appendImageUrl(content: string, url: string | undefined): string {
    if (!url) {
        return content;
    }

    return content.trim().length > 0 ? `${content.trim()}\n${url}` : url;
}

export function GroupDetail({
    group,
    canWrite,
    disabledReason,
    messageDraft,
    timeline,
    isGroupDetailLoading,
    groupDetailError,
    onMessageDraftChange,
    onPublishMessage,
    onUploadImage,
    onSaveGroup,
    onLeaveGroup,
    onRetryGroupDetail,
    profilesByPubkey,
    eventReferencesById,
    onSelectProfile,
    onResolveProfiles,
    onSelectEventReference,
    onResolveEventReferences,
}: GroupDetailProps) {
    const { t, locale } = useI18n();
    const [detailsOpen, setDetailsOpen] = useState(false);
    const { selectedImage: image, setSelectedImageFile, clearSelectedImage } = useSelectedImageFile();
    const [imageStatus, setImageStatus] = useState('');
    const [imageError, setImageError] = useState('');
    const imageInputRef = useRef<HTMLInputElement | null>(null);

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
    const membershipStatus = group.membershipStatus ?? (group.isRemembered ? 'pending' : 'none');
    const groupDisplayId = formatGroupDisplayId(group.id);

    const handlePublish = async (): Promise<void> => {
        if (!canWrite) {
            return;
        }

        const uploadedImage = image && onUploadImage ? await onUploadImage(image.file) : undefined;
        if (image && !uploadedImage) {
            return;
        }

        if (uploadedImage) {
            onPublishMessage(group.id, appendImageUrl(messageDraft, uploadedImage.url), { tags: uploadedImage.tags });
        } else {
            onPublishMessage(group.id, messageDraft);
        }
        clearSelectedImage();
        setImageStatus('');
        setImageError('');
    };

    const selectImage = (file: File): void => {
        setSelectedImageFile(file);
        setImageError('');
        setImageStatus(t('feed.imageSelected'));
    };

    const removeImage = (): void => {
        clearSelectedImage();
        setImageError('');
        setImageStatus(t('feed.imageRemoved'));
    };

    const rejectImage = (reason: ImageFileRejectionReason): void => {
        setImageStatus('');
        setImageError(t(imageFileRejectionMessageKey(reason)));
    };

    const handleSave = (): void => {
        if (!canWrite) {
            return;
        }

        onSaveGroup(group.id);
    };

    const handleLeave = (): void => {
        if (!canWrite) {
            return;
        }

        onLeaveGroup(group.id);
    };

    const timelineItems = sortedTimeline(timeline);
    const richContentProps = {
        ...(profilesByPubkey !== undefined ? { profilesByPubkey } : {}),
        ...(eventReferencesById !== undefined ? { eventReferencesById } : {}),
        ...(onSelectProfile ? { onSelectProfile } : {}),
        ...(onResolveProfiles ? { onResolveProfiles } : {}),
        ...(onSelectEventReference ? { onSelectEventReference } : {}),
        ...(onResolveEventReferences ? { onResolveEventReferences } : {}),
    };

    return (
        <article className="h-full min-h-0" aria-label={t('groups.detail.aria', { name: group.name })}>
            <Card variant="default" size="sm" className="h-full min-h-0 gap-0 overflow-hidden border border-border/70 py-0 ring-0 shadow-none">
                <CardHeader className="border-b pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 flex-col gap-1">
                            <CardTitle>{group.name}</CardTitle>
                            <p className="break-all text-xs text-muted-foreground">{groupDisplayId}</p>
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
                        {isGroupDetailLoading ? (
                            <Empty className="min-h-[14rem] justify-center border border-dashed" role="status" aria-label={t('groups.timeline.loadingTitle')}>
                                <EmptyHeader>
                                    <Spinner role="presentation" aria-hidden="true" />
                                    <EmptyTitle>{t('groups.timeline.loadingTitle')}</EmptyTitle>
                                    <EmptyDescription>{t('groups.timeline.loadingDescription')}</EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        ) : groupDetailError ? (
                            <Empty className="min-h-[14rem] justify-center border border-dashed" role="alert">
                                <EmptyHeader>
                                    <EmptyTitle>{t('groups.timeline.errorTitle')}</EmptyTitle>
                                    <EmptyDescription>{groupDetailError}</EmptyDescription>
                                </EmptyHeader>
                                <Button type="button" variant="outline" onClick={() => { void onRetryGroupDetail(); }}>
                                    {t('groups.timeline.retry')}
                                </Button>
                            </Empty>
                        ) : timelineItems.length === 0 ? (
                            <Empty className="min-h-[14rem] justify-center border border-dashed">
                                <EmptyHeader>
                                    {membershipStatus === 'pending' ? (
                                        <Button type="button" variant="secondary" disabled>
                                            {t('groups.join.pending.action')}
                                        </Button>
                                    ) : <EmptyTitle>{t('groups.timeline.empty')}</EmptyTitle>}
                                </EmptyHeader>
                            </Empty>
                        ) : (
                            <ul className="nostr-chat-messages pr-1">
                                {timelineItems.map((event) => (
                                    <li key={event.id} className="nostr-chat-message is-incoming">
                                        <div className="nostr-chat-message-header">
                                            {onSelectProfile ? (
                                                <button
                                                    type="button"
                                                    className={authorProfileButtonClassName(true)}
                                                    title={event.pubkey}
                                                    aria-label={t('richContent.openProfile', { label: profileDisplayName(event.pubkey, profilesByPubkey?.[event.pubkey]) })}
                                                    onClick={() => onSelectProfile(event.pubkey)}
                                                >
                                                    {profileDisplayName(event.pubkey, profilesByPubkey?.[event.pubkey])}
                                                </button>
                                            ) : (
                                                <strong className={authorProfileButtonClassName(false)} title={event.pubkey}>{profileDisplayName(event.pubkey, profilesByPubkey?.[event.pubkey])}</strong>
                                            )}
                                            <span className="nostr-chat-message-timestamp">{formatMessageTimestamp(event.created_at, locale)}</span>
                                        </div>
                                        <RichNostrContent
                                            content={event.content}
                                            tags={event.tags}
                                            {...richContentProps}
                                            textClassName="nostr-chat-message-body whitespace-pre-wrap break-words"
                                        />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </CardContent>
                {membershipStatus === 'confirmed' || actionDescription ? (
                    <CardFooter className="flex flex-col items-stretch gap-2">
                        {membershipStatus === 'confirmed' ? (
                            <form
                                className="nostr-group-composer"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void handlePublish();
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
                                {onUploadImage ? (
                                    <>
                                        <ComposerImageAttachmentPreview
                                            value={image}
                                            onChange={(value) => {
                                                if (!value) {
                                                    removeImage();
                                                }
                                            }}
                                            onEdit={() => imageInputRef.current?.click()}
                                            compact
                                            disabled={!canWrite}
                                        />
                                        <div className="sr-only" role="status" aria-live="polite">
                                            {imageStatus}
                                        </div>
                                        {imageError ? (
                                            <p className="text-xs text-destructive" role="alert">
                                                {imageError}
                                            </p>
                                        ) : null}
                                    </>
                                ) : null}
                                <div className="flex items-center justify-between gap-2">
                                    {onUploadImage ? (
                                        <ComposerImageAttachmentButton
                                            inputRef={imageInputRef}
                                            disabled={!canWrite}
                                            onSelect={selectImage}
                                            onReject={rejectImage}
                                        />
                                    ) : <span />}
                                    <Button
                                        type="submit"
                                        disabled={!canWrite || (messageDraft.trim().length === 0 && !image)}
                                        title={disabledReason ?? undefined}
                                        aria-label={t('groups.publish.aria', { name: group.name })}
                                    >
                                        {t('groups.publish.action')}
                                    </Button>
                                </div>
                            </form>
                        ) : null}
                        {actionDescription ? <FieldDescription id={textareaDescriptionId}>{actionDescription}</FieldDescription> : null}
                    </CardFooter>
                ) : null}
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
