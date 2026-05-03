import type { RelaySettingsState } from '../relay-settings';

interface PublishEventLike {
    publishEvent(event: {
        kind: number;
        content: string;
        created_at: number;
        tags: string[][];
    }): Promise<unknown>;
}

interface BootstrapLocalAccountInput {
    publisher: PublishEventLike;
    relaySettings: RelaySettingsState;
    profile?: {
        name?: string;
        about?: string;
        picture?: string;
    };
    now?: () => number;
}

function buildProfileContent(profile?: BootstrapLocalAccountInput['profile']): string | null {
    if (!profile) {
        return null;
    }

    const name = profile.name?.trim();
    const about = profile.about?.trim();
    const picture = profile.picture?.trim();
    const payload = {
        ...(name ? { name } : {}),
        ...(about ? { about } : {}),
        ...(picture ? { picture } : {}),
    };

    return Object.keys(payload).length > 0 ? JSON.stringify(payload) : null;
}

function buildKind10002Tags(relaySettings: RelaySettingsState): string[][] {
    const tags: string[][] = [];
    const bothSet = new Set(relaySettings.byType.nip65Both);

    for (const relayUrl of relaySettings.byType.nip65Both) {
        tags.push(['r', relayUrl]);
    }

    for (const relayUrl of relaySettings.byType.nip65Read) {
        if (!bothSet.has(relayUrl)) {
            tags.push(['r', relayUrl, 'read']);
        }
    }

    for (const relayUrl of relaySettings.byType.nip65Write) {
        if (!bothSet.has(relayUrl)) {
            tags.push(['r', relayUrl, 'write']);
        }
    }

    return tags;
}

function buildKind10050Tags(relaySettings: RelaySettingsState): string[][] {
    return relaySettings.byType.dmInbox.map((relayUrl) => ['relay', relayUrl]);
}

export async function bootstrapLocalAccount(input: BootstrapLocalAccountInput): Promise<void> {
    const now = input.now ?? (() => Math.floor(Date.now() / 1000));
    const createdAt = now();
    const profileContent = buildProfileContent(input.profile);
    const bootstrapEvents = [
        ...(profileContent
            ? [{
                kind: 0,
                content: profileContent,
                created_at: createdAt,
                tags: [],
            }]
            : []),
        {
            kind: 10002,
            content: '',
            created_at: createdAt,
            tags: buildKind10002Tags(input.relaySettings),
        },
        {
            kind: 10050,
            content: '',
            created_at: createdAt,
            tags: buildKind10050Tags(input.relaySettings),
        },
    ];

    let lastError: unknown;
    for (const event of bootstrapEvents) {
        try {
            await input.publisher.publishEvent(event);
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        throw lastError;
    }
}
