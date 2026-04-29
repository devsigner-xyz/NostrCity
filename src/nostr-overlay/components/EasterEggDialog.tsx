import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/i18n/useI18n';
import type { EasterEggEntry } from '../easter-eggs/catalog';

interface EasterEggDialogProps {
    entry: EasterEggEntry;
    buildingIndex: number;
    onClose: () => void;
}

export function EasterEggDialog({ entry, buildingIndex, onClose }: EasterEggDialogProps) {
    const { t } = useI18n();
    const textWithSource = entry.kind === 'text'
        ? `${entry.text}\n\n${t('easterEgg.source')}: ${entry.sourceUrl}`
        : '';

    return (
        <Dialog open onOpenChange={(open) => {
            if (!open) {
                onClose();
            }
        }}>
            <DialogContent
                className="nostr-dialog nostr-easter-egg-dialog"
                aria-label={t('easterEgg.aria', { title: entry.title })}
            >
                <DialogTitle className="sr-only">{entry.title}</DialogTitle>
                <DialogDescription className="sr-only">
                    {t('easterEgg.description', { building: String(buildingIndex + 1) })}
                </DialogDescription>
                <div className="nostr-easter-egg-body">
                    <header className="nostr-easter-egg-header">
                        <h3>{entry.title}</h3>
                    </header>

                    {entry.kind === 'pdf' ? (
                        <>
                            <div className="nostr-easter-egg-actions">
                                <a href={entry.pdfPath} download={entry.downloadFileName} className="nostr-easter-egg-action">
                                    {t('easterEgg.downloadPdf')}
                                </a>
                                <a href={entry.pdfPath} target="_blank" rel="noopener noreferrer" className="nostr-easter-egg-action">
                                    {t('easterEgg.openExpand')}
                                </a>
                            </div>
                            <iframe
                                src={entry.pdfPath}
                                title={entry.title}
                                className="nostr-easter-egg-pdf"
                            />
                        </>
                    ) : (
                        <pre className="nostr-easter-egg-text">{textWithSource}</pre>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
