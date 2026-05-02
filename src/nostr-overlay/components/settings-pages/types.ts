import type { RelayType } from '../../../nostr/relay-settings';

export type SettingsView = 'advanced' | 'ui' | 'shortcuts' | 'relays' | 'relay-detail' | 'about';

export type RelaySource = 'configured' | 'suggested';

export interface RelayDetails {
    relayUrl: string;
    source: RelaySource;
    host: string;
}

export interface RelayFee {
    amount?: number;
    unit?: string;
    period?: number;
    kinds?: number[];
}

export interface RelayInformationDocument {
    name?: string;
    description?: string;
    banner?: string;
    icon?: string;
    pubkey?: string;
    self?: string;
    contact?: string;
    supported_nips?: number[];
    software?: string;
    version?: string;
    terms_of_service?: string;
    privacy_policy?: string;
    payments_url?: string;
    limitation?: {
        payment_required?: boolean;
        auth_required?: boolean;
        restricted_writes?: boolean;
        max_limit?: number;
        default_limit?: number;
        max_subscriptions?: number;
    };
    fees?: {
        admission?: RelayFee[];
        subscription?: RelayFee[];
        publication?: RelayFee[];
    };
}

export interface RelayInfoState {
    status: 'loading' | 'ready' | 'error';
    data?: RelayInformationDocument;
}

export interface RelaySelection {
    relayUrl: string;
    source: RelaySource;
    relayType: RelayType;
}

export interface RelayRow {
    relayUrl: string;
    relayTypes: RelayType[];
    primaryRelayType: RelayType;
}
