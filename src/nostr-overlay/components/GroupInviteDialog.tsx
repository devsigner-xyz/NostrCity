import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/useI18n';
import { useState, type ReactNode } from 'react';
import { parseGroupInviteLink, type ParsedGroupInviteLink } from '../../nostr/group-invite-links';

interface GroupInviteDialogProps {
    onOpenInvite: (invite: ParsedGroupInviteLink) => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: ReactNode | null;
}

export function GroupInviteDialog({ onOpenInvite, open, onOpenChange, trigger }: GroupInviteDialogProps) {
    const { t } = useI18n();
    const [internalOpen, setInternalOpen] = useState(false);
    const [value, setValue] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const inputId = 'group-invite-link';
    const inviteCodeInputId = 'group-invite-code';
    const dialogOpen = open ?? internalOpen;
    const triggerElement = trigger === undefined ? (
        <Button type="button" variant="outline" aria-label={t('groups.invite.openAria')}>
            {t('groups.invite.open')}
        </Button>
    ) : trigger;

    const setDialogOpen = (nextOpen: boolean): void => {
        if (open === undefined) {
            setInternalOpen(nextOpen);
        }

        onOpenChange?.(nextOpen);
    };

    const openInvite = (): void => {
        const invite = parseGroupInviteLink(value, inviteCode);
        if (!invite) {
            setError(t('groups.invite.invalid'));
            return;
        }

        setError(null);
        onOpenInvite(invite);
        setDialogOpen(false);
        setValue('');
        setInviteCode('');
    };

    return (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            {triggerElement ? <DialogTrigger asChild>{triggerElement}</DialogTrigger> : null}
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('groups.invite.title')}</DialogTitle>
                </DialogHeader>
                <FieldGroup>
                    <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor={inputId} className="sr-only">{t('groups.invite.label')}</FieldLabel>
                        <Input
                            id={inputId}
                            aria-label={t('groups.invite.inputAria')}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? `${inputId}-error` : undefined}
                            value={value}
                            onChange={(event) => {
                                setValue(event.currentTarget.value);
                                setError(null);
                            }}
                            placeholder="groups.example'maps"
                        />
                        {error ? (
                            <FieldError id={`${inputId}-error`}>{error}</FieldError>
                        ) : null}
                    </Field>
                    <Field>
                        <FieldLabel htmlFor={inviteCodeInputId} className="sr-only">{t('groups.invite.codeLabel')}</FieldLabel>
                        <Input
                            id={inviteCodeInputId}
                            aria-label={t('groups.invite.codeLabel')}
                            value={inviteCode}
                            onChange={(event) => setInviteCode(event.currentTarget.value)}
                            placeholder={t('groups.invite.codePlaceholder')}
                        />
                    </Field>
                </FieldGroup>
                <DialogFooter>
                    <Button type="button" aria-label={t('groups.invite.submitAria')} onClick={openInvite}>
                        {t('groups.invite.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
