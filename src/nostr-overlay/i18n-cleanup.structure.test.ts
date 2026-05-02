import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceFiles = [
    'src/nostr-overlay/App.tsx',
    'src/nostr-overlay/controllers/use-wallet-zap-controller.ts',
    'src/nostr-overlay/routes/ChatsRouteContainer.tsx',
    'src/nostr-overlay/shell/OverlayMapInteractionLayer.tsx',
    'src/nostr-overlay/components/NoteCard.tsx',
    'src/nostr-overlay/components/PeopleListTab.tsx',
    'src/nostr-overlay/components/WalletPage.tsx',
    'src/nostr-overlay/components/WalletZapSettingsSection.tsx',
];

const disallowedFragments = [
    'No se pudo actualizar el seguimiento de esta cuenta',
    'npub copiada',
    'ID de nota copiado',
    'Repost eliminado',
    'Repost publicado',
    'No se pudo eliminar el repost',
    'No se pudo publicar el repost',
    'Publicacion enviada',
    'No se pudo publicar la nota',
    'Cita publicada',
    'No se pudo publicar la cita',
    'Pago enviado.',
    'No se pudo completar el pago.',
    'WebLN no esta disponible en este navegador.',
    'WebLN no está disponible en este navegador.',
    'No se pudo reconectar la wallet WebLN.',
    'El provider WebLN no soporta pagos.',
    'Wallet conectada',
    'No se pudo conectar la wallet NWC.',
    'Inicia sesión para enviar mensajes privados.',
    'Tu sesión no permite mensajería privada (requiere firma y NIP-44).',
    '`${amount} sats`',
    '{amount} sats',
    '{item.status}',
];

function sourceFor(filePath: string): string {
    return readFileSync(join(process.cwd(), filePath), 'utf8');
}

describe('Nostr overlay i18n cleanup structure', () => {
    it('keeps known user-visible App cleanup copy behind i18n keys', () => {
        const matches = sourceFiles.flatMap((filePath) => {
            const source = sourceFor(filePath);
            return disallowedFragments
                .filter((fragment) => source.includes(fragment))
                .map((fragment) => `${filePath}: ${fragment}`);
        });

        expect(matches).toEqual([]);
    });
});
