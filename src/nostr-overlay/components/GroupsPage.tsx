import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n/useI18n';
import { MoreHorizontalIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AuthSessionState } from '../../nostr/auth/session';
import { isWriteEnabled } from '../../nostr/auth/session';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import type { UploadedImageAttachment } from '../media/upload-note-image-attachment';
import { OverlayPageHeader } from './OverlayPageHeader';
import { OverlaySurface } from './OverlaySurface';
import { GroupDetail } from './GroupDetail';
import { GroupInviteDialog } from './GroupInviteDialog';
import { GroupList } from './GroupList';
import { GroupRelaySelect, type NostrGroupRelaySummary } from './GroupRelayList';
import type { ParsedGroupInviteLink } from '../../nostr/group-invite-links';

export interface NostrGroupSummary {
    id: string;
    name: string;
    relayUrl: string;
    description: string;
    memberCount: number;
    isSaved?: boolean;
    isRemembered?: boolean;
    membershipStatus?: GroupMembershipStatus;
    metadataVerified?: boolean;
}

export type GroupMembershipStatus = 'none' | 'pending' | 'confirmed';

const GROUP_DETAIL_PAGE_QUERY = '(max-width: 1023px)';

export interface GroupsPageProps {
    groups: NostrGroupSummary[];
    relays?: NostrGroupRelaySummary[];
    selectedRelayUrl?: string | null;
    selectedGroupId: string | null;
    isLoading: boolean;
    error: string | null;
    isGroupDetailLoading: boolean;
    groupDetailError: string | null;
    session: AuthSessionState | null;
    messageDraft: string;
    timeline: NostrEvent[];
    onSelectRelay?: (relayUrl: string | null) => void;
    onSelectGroup: (groupId: string) => void;
    activeGroupDetailId?: string | null;
    onOpenGroupDetail?: (group: NostrGroupSummary) => void;
    onMessageDraftChange: (message: string) => void;
    onPublishMessage: (groupId: string, message: string, options?: { tags?: string[][] }) => void;
    onUploadImage?: (file: File) => Promise<UploadedImageAttachment | undefined> | UploadedImageAttachment | undefined;
    onSaveGroup: (groupId: string) => void;
    onSyncPublicGroups: () => void;
    onJoinGroup: (groupId: string) => void;
    onLeaveGroup: (groupId: string) => void;
    onAddCustomGroupRelay?: (relayUrl: string) => void;
    onOpenInvite?: (invite: ParsedGroupInviteLink) => void;
    onRetry: () => Promise<void> | void;
    onRetryGroupDetail: () => Promise<void> | void;
    hasGroupRelaysConfigured: boolean;
    onAddSuggestedGroupRelays: () => void;
    onManageGroupRelays: () => void;
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

function selectedGroup(groups: NostrGroupSummary[], selectedGroupId: string | null): NostrGroupSummary | null {
    if (groups.length === 0) {
        return null;
    }

    return groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;
}

function isGroupDetailPageLayout(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    if (typeof window.matchMedia === 'function') {
        return window.matchMedia(GROUP_DETAIL_PAGE_QUERY).matches;
    }

    return window.innerWidth < 1024;
}

function useGroupDetailPageLayout(): boolean {
    const [isDetailPageLayout, setIsDetailPageLayout] = useState(isGroupDetailPageLayout);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (typeof window.matchMedia !== 'function') {
            const handleResize = (): void => setIsDetailPageLayout(window.innerWidth < 1024);

            handleResize();
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
        }

        const mediaQuery = window.matchMedia(GROUP_DETAIL_PAGE_QUERY);
        const handleChange = (): void => setIsDetailPageLayout(mediaQuery.matches);

        handleChange();
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    return isDetailPageLayout;
}

function writeDisabledReason(session: AuthSessionState | null, t: ReturnType<typeof useI18n>['t']): string | null {
    if (isWriteEnabled(session ?? undefined)) {
        return null;
    }

    if (!session || session.method === 'npub') {
        return t('groups.writeDisabled.readOnly');
    }

    if (session.locked) {
        return t('groups.writeDisabled.locked');
    }

    if (!session.capabilities.canSign) {
        return t('groups.writeDisabled.noSign');
    }

    return t('groups.writeDisabled.readOnly');
}

export function GroupsPage({
    groups,
    relays,
    selectedRelayUrl,
    selectedGroupId,
    isLoading,
    error,
    isGroupDetailLoading,
    groupDetailError,
    session,
    messageDraft,
    timeline,
    onSelectRelay = () => {},
    onSelectGroup,
    activeGroupDetailId,
    onOpenGroupDetail,
    onMessageDraftChange,
    onPublishMessage,
    onUploadImage,
    onSaveGroup,
    onSyncPublicGroups,
    onJoinGroup,
    onLeaveGroup,
    onAddCustomGroupRelay = () => {},
    onOpenInvite = () => {},
    onRetry,
    onRetryGroupDetail,
    hasGroupRelaysConfigured,
    onAddSuggestedGroupRelays,
    onManageGroupRelays,
    profilesByPubkey,
    eventReferencesById,
    onSelectProfile,
    onResolveProfiles,
    onSelectEventReference,
    onResolveEventReferences,
}: GroupsPageProps) {
    const { t } = useI18n();
    const relayGroups = selectedRelayUrl ? groups.filter((item) => item.relayUrl === selectedRelayUrl) : groups;
    const group = selectedGroup(relayGroups, selectedGroupId);
    const disabledReason = writeDisabledReason(session, t);
    const canWrite = !disabledReason;
    const isDetailPageLayout = useGroupDetailPageLayout();
    const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
    const selectedRelayHasNoGroups = Boolean(selectedRelayUrl && relayGroups.length === 0);
    const relaySummaries = relays ?? [...new Set(groups.map((item) => item.relayUrl))].map((relayUrl) => ({
        relayUrl,
        groupCount: groups.filter((item) => item.relayUrl === relayUrl).length,
        savedCount: groups.filter((item) => item.relayUrl === relayUrl && item.isSaved).length,
        rememberedCount: groups.filter((item) => item.relayUrl === relayUrl && item.isRemembered).length,
        isConfigured: true,
    }));

    const handleSync = (): void => {
        if (!canWrite) {
            return;
        }

        onSyncPublicGroups();
    };

    const handleSelectGroup = (groupId: string): void => {
        const nextGroup = relayGroups.find((item) => item.id === groupId);

        onSelectGroup(groupId);

        if (isDetailPageLayout) {
            if (nextGroup && onOpenGroupDetail) {
                onOpenGroupDetail(nextGroup);
            }
        }
    };

    const showGroupDetailPage = isDetailPageLayout && Boolean(activeGroupDetailId && group?.id === activeGroupDetailId);
    const showGroupList = !showGroupDetailPage;
    const showGroupDetail = !isDetailPageLayout || showGroupDetailPage;

    const renderGroupDetail = () => (
        <GroupDetail
            group={group}
            canWrite={canWrite}
            disabledReason={disabledReason}
            messageDraft={messageDraft}
            timeline={timeline}
            isGroupDetailLoading={isGroupDetailLoading}
            groupDetailError={groupDetailError}
            onMessageDraftChange={onMessageDraftChange}
            onPublishMessage={onPublishMessage}
            {...(onUploadImage ? { onUploadImage } : {})}
            onSaveGroup={onSaveGroup}
            onLeaveGroup={onLeaveGroup}
            onRetryGroupDetail={onRetryGroupDetail}
            {...(profilesByPubkey !== undefined ? { profilesByPubkey } : {})}
            {...(eventReferencesById !== undefined ? { eventReferencesById } : {})}
            {...(onSelectProfile ? { onSelectProfile } : {})}
            {...(onResolveProfiles ? { onResolveProfiles } : {})}
            {...(onSelectEventReference ? { onSelectEventReference } : {})}
            {...(onResolveEventReferences ? { onResolveEventReferences } : {})}
        />
    );

    return (
        <OverlaySurface ariaLabel={t('groups.title')}>
            <div className="nostr-groups-page nostr-routed-surface-panel nostr-page-layout h-full" data-group-source="query">
                <OverlayPageHeader
                    title={t('groups.title')}
                    description={t('groups.description')}
                />

                {isLoading ? (
                    <Empty className="min-h-[18rem] self-stretch" role="status" aria-label={t('groups.loadingTitle')}>
                        <EmptyHeader>
                            <Spinner role="presentation" aria-hidden="true" />
                            <EmptyTitle>{t('groups.loadingTitle')}</EmptyTitle>
                            <EmptyDescription>{t('groups.loadingDescription')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : error ? (
                    <Empty className="min-h-[18rem] self-stretch" role="alert">
                        <EmptyHeader>
                            <EmptyTitle>{t('groups.errorTitle')}</EmptyTitle>
                            <EmptyDescription>{error}</EmptyDescription>
                        </EmptyHeader>
                        <Button type="button" variant="outline" onClick={() => { void onRetry(); }}>
                            {t('groups.retry')}
                        </Button>
                    </Empty>
                ) : groups.length === 0 && !hasGroupRelaysConfigured ? (
                    <Empty className="min-h-[18rem] self-stretch">
                        <EmptyHeader>
                            <EmptyTitle>{t('groups.onboarding.title')}</EmptyTitle>
                            <EmptyDescription>{t('groups.onboarding.description')}</EmptyDescription>
                        </EmptyHeader>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                                type="button"
                                onClick={onAddSuggestedGroupRelays}
                                aria-label={t('groups.onboarding.addSuggestedAria')}
                            >
                                {t('groups.onboarding.addSuggested')}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onManageGroupRelays}
                                aria-label={t('groups.onboarding.manageAria')}
                            >
                                {t('groups.onboarding.manage')}
                            </Button>
                        </div>
                    </Empty>
                ) : groups.length === 0 && !selectedRelayUrl ? (
                    <Empty className="min-h-[18rem] self-stretch">
                        <EmptyHeader>
                            <EmptyTitle>{t('groups.emptyTitle')}</EmptyTitle>
                            <EmptyDescription>{t('groups.emptyDescription')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    <div
                        data-testid="groups-page-layout"
                        className="nostr-groups-layout"
                    >
                        {showGroupList ? (
                            <div
                                data-testid="groups-controls"
                                className="flex flex-col gap-2 rounded-xl border bg-card/60 p-3 lg:flex-row lg:items-end lg:justify-between"
                            >
                            <div className="flex min-w-0 items-end gap-2 lg:flex-1">
                                <GroupRelaySelect
                                    relays={relaySummaries}
                                    selectedRelayUrl={selectedRelayUrl ?? null}
                                    onSelectRelay={onSelectRelay}
                                    onAddCustomGroupRelay={onAddCustomGroupRelay}
                                />
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon-sm"
                                            className="mb-0 lg:hidden"
                                            aria-label={t('groups.actions.openAria')}
                                        >
                                            <MoreHorizontalIcon aria-hidden="true" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56">
                                        <DropdownMenuItem
                                            disabled={!canWrite}
                                            title={disabledReason ?? undefined}
                                            onSelect={handleSync}
                                        >
                                            {t('groups.sync.action')}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => setInviteDialogOpen(true)}>
                                            {t('groups.invite.open')}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                            <div className="hidden gap-2 lg:flex lg:items-center">
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
                                <GroupInviteDialog
                                    open={inviteDialogOpen}
                                    onOpenChange={setInviteDialogOpen}
                                    onOpenInvite={onOpenInvite}
                                    trigger={isDetailPageLayout ? null : (
                                        <Button type="button" variant="outline" aria-label={t('groups.invite.openAria')}>
                                            {t('groups.invite.open')}
                                        </Button>
                                    )}
                                />
                            </div>
                            </div>
                        ) : null}
                        <div className={cn(
                            'nostr-groups-columns min-h-0 flex-1',
                            showGroupDetailPage ? 'nostr-groups-layout-mobile-detail' : undefined,
                            isDetailPageLayout && showGroupList ? 'nostr-groups-layout-mobile-list' : undefined,
                        )}>
                            {showGroupList ? (
                                <GroupList
                                    groups={relayGroups}
                                    selectedGroupId={group?.id ?? null}
                                    onSelectGroup={handleSelectGroup}
                                    canWrite={canWrite}
                                    disabledReason={disabledReason}
                                    onJoinGroup={onJoinGroup}
                                    {...(selectedRelayHasNoGroups ? {
                                        emptyTitle: t('groups.list.relayEmptyTitle'),
                                        emptyDescription: t('groups.list.relayEmptyDescription'),
                                        onEmptyRetry: onRetry,
                                    } : {})}
                                />
                            ) : null}
                            {showGroupDetail ? renderGroupDetail() : null}
                        </div>
                    </div>
                )}
            </div>
        </OverlaySurface>
    );
}
