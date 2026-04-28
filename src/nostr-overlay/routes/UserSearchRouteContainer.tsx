import type { ComponentProps } from 'react';
import { UserSearchPage } from '../components/UserSearchPage';

type UserSearchPageProps = ComponentProps<typeof UserSearchPage>;

export interface UserSearchRouteContainerProps {
    onClose: UserSearchPageProps['onClose'];
    onSearch: UserSearchPageProps['onSearch'];
    searchRelaySetKey?: UserSearchPageProps['searchRelaySetKey'];
    onOpenActiveProfile: UserSearchPageProps['onSelectUser'];
    ownerPubkey?: UserSearchPageProps['ownerPubkey'];
    followedPubkeys?: UserSearchPageProps['followedPubkeys'];
    verificationByPubkey?: UserSearchPageProps['verificationByPubkey'];
    onCopyNpub?: UserSearchPageProps['onCopyNpub'];
    canWrite: boolean;
    onFollowUser?: UserSearchPageProps['onFollowUser'];
    canAccessDirectMessages: boolean;
    onMessageUser?: UserSearchPageProps['onMessageUser'];
}

export function UserSearchRouteContainer({
    onClose,
    onSearch,
    searchRelaySetKey,
    onOpenActiveProfile,
    ownerPubkey,
    followedPubkeys,
    verificationByPubkey,
    onCopyNpub,
    canWrite,
    onFollowUser,
    canAccessDirectMessages,
    onMessageUser,
}: UserSearchRouteContainerProps) {
    return (
        <UserSearchPage
            onClose={onClose}
            onSearch={onSearch}
            searchRelaySetKey={searchRelaySetKey}
            onSelectUser={(pubkey) => {
                onOpenActiveProfile(pubkey);
            }}
            {...(ownerPubkey ? { ownerPubkey } : {})}
            {...(followedPubkeys ? { followedPubkeys } : {})}
            {...(verificationByPubkey ? { verificationByPubkey } : {})}
            {...(onCopyNpub ? { onCopyNpub } : {})}
            {...(canWrite && onFollowUser ? { onFollowUser } : {})}
            {...(canAccessDirectMessages && onMessageUser ? { onMessageUser } : {})}
        />
    );
}
