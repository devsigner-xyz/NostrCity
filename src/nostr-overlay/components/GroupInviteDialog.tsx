import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/useI18n';
import { useState } from 'react';
import { parseGroupInviteLink, type ParsedGroupInviteLink } from '../../nostr/group-invite-links';

interface GroupInviteDialogProps {
    onOpenInvite: (invite: ParsedGroupInviteLink) => void;
}

export function GroupInviteDialog({ onOpenInvite }: GroupInviteDialogProps) {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const inputId = 'group-invite-link';

    const openInvite = (): void => {
        const invite = parseGroupInviteLink(value);
        if (!invite) {
            setError(t('groups.invite.invalid'));
            return;
        }

        setError(null);
        onOpenInvite(invite);
        setOpen(false);
        setValue('');
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button type="button" variant="outline" aria-label={t('groups.invite.openAria')}>
                    {t('groups.invite.open')}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('groups.invite.title')}</DialogTitle>
                    <DialogDescription>{t('groups.invite.description')}</DialogDescription>
                </DialogHeader>
                <FieldGroup>
                    <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor={inputId}>{t('groups.invite.label')}</FieldLabel>
                        <Input
                            id={inputId}
                            aria-label={t('groups.invite.inputAria')}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? `${inputId}-error` : `${inputId}-description`}
                            value={value}
                            onChange={(event) => {
                                setValue(event.currentTarget.value);
                                setError(null);
                            }}
                            placeholder="/groups?relay=wss://groups.example&group=Maps"
                        />
                        {error ? (
                            <FieldError id={`${inputId}-error`}>{error}</FieldError>
                        ) : (
                            <FieldDescription id={`${inputId}-description`}>{t('groups.invite.help')}</FieldDescription>
                        )}
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
