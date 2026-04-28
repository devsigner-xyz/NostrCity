import { useEffect, useMemo, useState } from 'react';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import {
    Command,
    CommandInput,
    CommandList,
} from '@/components/ui/command';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { useI18n } from '@/i18n/useI18n';
import { Spinner } from '@/components/ui/spinner';
import { OverlayPageHeader } from './OverlayPageHeader';
import { OverlaySurface } from './OverlaySurface';
import { PeopleListTab } from './PeopleListTab';
import { type SearchUsersResult, useUserSearchQuery } from '../query/user-search.query';

interface UserSearchPageProps {
    onClose: () => void;
    onSearch: (query: string) => Promise<SearchUsersResult>;
    searchRelaySetKey?: string | undefined;
    onSelectUser: (pubkey: string) => void;
    ownerPubkey?: string | undefined;
    followedPubkeys?: string[];
    verificationByPubkey?: Record<string, Nip05ValidationResult | undefined>;
    onCopyNpub?: (value: string) => void | Promise<void>;
    onFollowUser?: (pubkey: string) => void | Promise<void>;
    onMessageUser?: (pubkey: string) => void | Promise<void>;
}

const SEARCH_DEBOUNCE_MS = 300;

export function UserSearchPage({
    onClose,
    onSearch,
    searchRelaySetKey,
    onSelectUser,
    ownerPubkey,
    followedPubkeys = [],
    verificationByPubkey = {},
    onCopyNpub,
    onFollowUser,
    onMessageUser,
}: UserSearchPageProps) {
    const { t } = useI18n();
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedQuery(query);
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [query]);

    const searchQuery = useUserSearchQuery({
        term: debouncedQuery,
        enabled: true,
        ownerPubkey,
        searchRelaySetKey,
        onSearch,
    });

    const profiles = useMemo<Record<string, NostrProfile>>(() => searchQuery.result.profiles, [searchQuery.result.profiles]);
    const results = searchQuery.result.pubkeys;

    const resultsContent = !query.trim() ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyTitle>{t('userSearch.emptyInitialTitle')}</EmptyTitle>
                <EmptyDescription>{t('userSearch.emptyInitialDescription')}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : searchQuery.isLoading ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <Spinner />
                </EmptyMedia>
                <EmptyTitle>{t('userSearch.loadingTitle')}</EmptyTitle>
                <EmptyDescription>{t('userSearch.loadingDescription')}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : searchQuery.error ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyTitle>{t('userSearch.errorTitle')}</EmptyTitle>
                <EmptyDescription>{searchQuery.error}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : results.length === 0 ? (
        <Empty className="nostr-global-search-empty">
            <EmptyHeader>
                <EmptyTitle>{t('userSearch.emptyResultsTitle')}</EmptyTitle>
                <EmptyDescription>{t('userSearch.emptyResultsDescription')}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    ) : (
        <PeopleListTab
            people={results}
            profiles={profiles}
            emptyText={t('userSearch.emptyResultsDescription')}
            loading={false}
            onSelectPerson={(pubkey) => {
                onSelectUser(pubkey);
                onClose();
            }}
            {...(onCopyNpub ? { onCopyNpub } : {})}
            {...(onMessageUser ? {
                onSendMessage: (pubkey: string) => {
                    void onMessageUser(pubkey);
                    onClose();
                },
            } : {})}
            onViewDetails={(pubkey) => {
                onSelectUser(pubkey);
                onClose();
            }}
            followedPubkeys={followedPubkeys}
            followHiddenPubkeys={ownerPubkey ? [ownerPubkey] : []}
            followCopyScope="userSearch"
            identifierDisplay="full"
            {...(onFollowUser ? { onFollowPerson: onFollowUser } : {})}
            verificationByPubkey={verificationByPubkey}
        />
    );

    return (
        <OverlaySurface ariaLabel={t('userSearch.title')}>
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="nostr-global-search-page nostr-routed-surface-panel nostr-page-layout">
                    <OverlayPageHeader
                        title={t('userSearch.title')}
                        description={t('userSearch.description')}
                    />

                    <section className="grid gap-2.5">
                        <Command shouldFilter={false} className="nostr-global-search-command">
                            <CommandInput
                                value={query}
                                aria-label={t('userSearch.inputAria')}
                                placeholder={t('userSearch.inputPlaceholder')}
                                onValueChange={setQuery}
                            />
                            <CommandList className="nostr-global-search-results">
                                {resultsContent}
                            </CommandList>
                        </Command>
                    </section>
                </div>
            </div>
        </OverlaySurface>
    );
}
