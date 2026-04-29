import type { NostrEvent, NostrProfile } from '../../nostr/types';
import { ProfileEditorPage } from '../components/ProfileEditorPage';

export interface ProfileRouteContainerProps {
    ownerPubkey: string;
    ownerProfile?: NostrProfile;
    canWrite: boolean;
    currentMetadataContent?: string;
    onBack: () => void;
    onUploadProfileImage: (file: File, kind: 'avatar' | 'banner') => Promise<string>;
    onLoadLatestProfileMetadata?: () => Promise<string | undefined>;
    onPublishProfileMetadata: (content: string) => Promise<NostrEvent>;
    onProfileSaved?: (profile: NostrProfile, content: string) => void;
}

export function ProfileRouteContainer(props: ProfileRouteContainerProps) {
    return <ProfileEditorPage {...props} />;
}
