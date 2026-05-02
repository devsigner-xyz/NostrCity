import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeftIcon, PencilIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useI18n } from '@/i18n/useI18n';
import { buildProfileMetadataContent, parseProfileMetadata } from '../../nostr/profiles';
import type { NostrEvent, NostrProfile, NostrProfileBirthday } from '../../nostr/types';
import { encodeHexToNpub } from '../../nostr/npub';
import { sanitizeImageUrl } from '../media/image-url-policy';
import { processProfileImageFile, type ProfileImageKind } from '../media/profile-image-processing';
import { ImageFilePickerButton } from './media/ImageFilePickerButton';
import { ProfileImageCropDialog } from './media/ProfileImageCropDialog';
import { imageFileRejectionMessageKey } from './ComposerImageAttachment';
import { OverlaySurface } from './OverlaySurface';
import type { ImageFileRejectionReason } from '../media/image-file-policy';

export interface ProfileEditorPageProps {
    ownerPubkey: string;
    ownerProfile?: NostrProfile;
    canWrite: boolean;
    currentMetadataContent?: string;
    onBack: () => void;
    onUploadProfileImage: (file: File, kind: ProfileImageKind) => Promise<string>;
    onLoadLatestProfileMetadata?: () => Promise<string | undefined>;
    onPublishProfileMetadata: (content: string) => Promise<NostrEvent>;
    onProfileSaved?: (profile: NostrProfile, content: string) => void;
}

interface ProfileEditorFormState {
    name: string;
    displayName: string;
    about: string;
    picture: string;
    banner: string;
    website: string;
    nip05: string;
    lud16: string;
    lud06: string;
    birthday: string;
    bot: boolean;
}

interface CropTarget {
    kind: ProfileImageKind;
    file: File;
    previewUrl: string;
}

export function ProfileEditorPage({
    ownerPubkey,
    ownerProfile,
    canWrite,
    currentMetadataContent,
    onBack,
    onUploadProfileImage,
    onLoadLatestProfileMetadata,
    onPublishProfileMetadata,
    onProfileSaved,
}: ProfileEditorPageProps) {
    const { t } = useI18n();
    const [form, setForm] = useState<ProfileEditorFormState>(() => formStateFromProfile(ownerProfile));
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState(canWrite ? '' : t('profileEditor.readOnly'));
    const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);

    useEffect(() => {
        setForm(formStateFromProfile(ownerProfile));
    }, [ownerProfile]);

    useEffect(() => {
        if (!canWrite) {
            setError(t('profileEditor.readOnly'));
        }
    }, [canWrite, t]);

    useEffect(() => () => {
        if (cropTarget) {
            URL.revokeObjectURL(cropTarget.previewUrl);
        }
    }, [cropTarget]);

    const ownerNpub = shortNpub(ownerPubkey);
    const safePicture = sanitizeImageUrl(form.picture);
    const safeBanner = sanitizeImageUrl(form.banner);
    const displayName = form.displayName || form.name || ownerNpub;
    const isBusy = isSaving || isUploading;
    const previewRows = buildPreviewRows(form, t);

    const updateField = (field: keyof ProfileEditorFormState, value: string | boolean): void => {
        setForm((current) => ({ ...current, [field]: value }));
    };

    const openCropDialog = (kind: ProfileImageKind, file: File): void => {
        if (cropTarget) {
            URL.revokeObjectURL(cropTarget.previewUrl);
        }

        setError('');
        setStatus('');
        setCropTarget({ kind, file, previewUrl: URL.createObjectURL(file) });
    };

    const closeCropDialog = (): void => {
        if (cropTarget) {
            URL.revokeObjectURL(cropTarget.previewUrl);
        }
        setCropTarget(null);
    };

    const rejectImage = (reason: ImageFileRejectionReason): void => {
        setStatus('');
        setError(t(imageFileRejectionMessageKey(reason)));
    };

    const applyCropAndUpload = async (): Promise<void> => {
        if (!cropTarget) {
            return;
        }

        setIsUploading(true);
        setError('');
        try {
            const processed = await processProfileImageFile(cropTarget.file, { kind: cropTarget.kind });
            const url = await onUploadProfileImage(processed, cropTarget.kind);
            updateField(cropTarget.kind === 'avatar' ? 'picture' : 'banner', url);
            setStatus(t(cropTarget.kind === 'avatar' ? 'profileEditor.avatarUploaded' : 'profileEditor.bannerUploaded'));
            closeCropDialog();
        } catch {
            setError(t('profileEditor.imageUploadFailed'));
        } finally {
            setIsUploading(false);
        }
    };

    const saveProfile = async (): Promise<void> => {
        if (!canWrite) {
            setError(t('profileEditor.readOnly'));
            return;
        }

        setIsSaving(true);
        setError('');
        setStatus('');
        try {
            const latestContent = await onLoadLatestProfileMetadata?.();
            const birthday = parseBirthday(form.birthday);
            const content = buildProfileMetadataContent(latestContent ?? currentMetadataContent, {
                name: form.name,
                displayName: form.displayName,
                about: form.about,
                picture: form.picture,
                banner: form.banner,
                website: form.website,
                nip05: form.nip05,
                lud16: form.lud16,
                lud06: form.lud06,
                bot: form.bot,
                ...(birthday ? { birthday } : {}),
            });
            const event = await onPublishProfileMetadata(content);
            onProfileSaved?.(parseProfileMetadata({ ...event, pubkey: ownerPubkey, content }), content);
            setStatus(t('profileEditor.saveSuccess'));
            toast.success(t('profileEditor.saveSuccess'), { duration: 1800 });
        } catch {
            setError(t('profileEditor.saveFailed'));
            toast.error(t('profileEditor.saveFailed'), { duration: 2200 });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <OverlaySurface ariaLabel={t('profileEditor.title')}>
        <main className="nostr-routed-surface-panel nostr-page-layout flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-sm text-muted-foreground">{t('profileEditor.subtitle')}</p>
                    <h1 className="text-2xl font-semibold tracking-tight">{t('profileEditor.title')}</h1>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={onBack}>
                    <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
                    {t('profileEditor.back')}
                </Button>
            </div>

            {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
            <div className="sr-only" role="status" aria-live="polite">{status}</div>

            <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('profileEditor.previewTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="overflow-hidden rounded-xl border bg-muted/30" data-testid="profile-editor-preview">
                            <div className={`nostr-profile-dialog-banner-shell relative${safeBanner ? '' : ' is-placeholder'}`}>
                                {safeBanner ? <img className="nostr-profile-dialog-banner" src={safeBanner} alt={t('profileEditor.bannerPreviewAlt')} /> : null}
                                <div className="absolute top-3 right-3">
                                    <ImageFilePickerButton
                                        ariaLabel={t('profileEditor.editBannerImage')}
                                        disabled={isBusy || !canWrite}
                                        inputProps={{ 'data-profile-image-kind': 'banner' }}
                                        onSelect={(file) => openCropDialog('banner', file)}
                                        onReject={rejectImage}
                                    >
                                        <PencilIcon data-icon="inline-start" aria-hidden="true" />
                                    </ImageFilePickerButton>
                                </div>
                            </div>

                            <div className="nostr-dialog-header flex items-center gap-3 px-4 py-3">
                                <div className="relative shrink-0">
                                    <Avatar className="size-14 border border-border/70 shadow-xs">
                                        {safePicture ? <img data-slot="avatar-image" src={safePicture} alt={t('profileEditor.avatarPreviewAlt')} className="aspect-square size-full rounded-full object-cover" /> : null}
                                        {safePicture ? null : <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>}
                                    </Avatar>
                                    <div className="absolute -right-1 -bottom-1">
                                        <ImageFilePickerButton
                                            ariaLabel={t('profileEditor.editAvatarImage')}
                                            disabled={isBusy || !canWrite}
                                            inputProps={{ 'data-profile-image-kind': 'avatar' }}
                                            onSelect={(file) => openCropDialog('avatar', file)}
                                            onReject={rejectImage}
                                        >
                                            <PencilIcon data-icon="inline-start" aria-hidden="true" />
                                        </ImageFilePickerButton>
                                    </div>
                                </div>

                                <div className="flex min-w-0 flex-col gap-0.5">
                                    <p className="nostr-dialog-name inline-flex max-w-full items-center gap-2 text-base font-semibold leading-tight text-foreground">
                                        <span className="truncate">{displayName}</span>
                                    </p>
                                    <p className="nostr-dialog-pubkey min-w-0 truncate text-sm leading-tight text-muted-foreground">{ownerNpub}</p>
                                </div>
                            </div>

                            {previewRows.length > 0 ? (
                                <section className="nostr-profile-info px-4 pb-4">
                                    <dl className="nostr-profile-info-list">
                                        {previewRows.map((row) => (
                                            <div key={row.label} className="nostr-profile-info-row">
                                                <dt>{row.label}</dt>
                                                <dd>{row.value}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                </section>
                            ) : null}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{t('profileEditor.formTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <FieldGroup>
                            <TextField name="name" label={t('profileEditor.nameLabel')} value={form.name} disabled={isBusy || !canWrite} onChange={(value) => updateField('name', value)} />
                            <TextField name="displayName" label={t('profileEditor.displayNameLabel')} value={form.displayName} disabled={isBusy || !canWrite} onChange={(value) => updateField('displayName', value)} />
                            <Field>
                                <FieldLabel htmlFor="profile-about">{t('profileEditor.aboutLabel')}</FieldLabel>
                                <Textarea id="profile-about" name="about" value={form.about} disabled={isBusy || !canWrite} onChange={(event) => updateField('about', event.currentTarget.value)} />
                            </Field>
                            <TextField name="website" label={t('profileEditor.websiteLabel')} value={form.website} disabled={isBusy || !canWrite} onChange={(value) => updateField('website', value)} />
                            <TextField name="nip05" label={t('profileEditor.nip05Label')} value={form.nip05} disabled={isBusy || !canWrite} onChange={(value) => updateField('nip05', value)} />
                            <TextField name="lud16" label={t('profileEditor.lud16Label')} value={form.lud16} disabled={isBusy || !canWrite} onChange={(value) => updateField('lud16', value)} />
                            <TextField name="lud06" label={t('profileEditor.lud06Label')} value={form.lud06} disabled={isBusy || !canWrite} onChange={(value) => updateField('lud06', value)} />
                            <TextField name="birthday" label={t('profileEditor.birthdayLabel')} value={form.birthday} disabled={isBusy || !canWrite} onChange={(value) => updateField('birthday', value)} />
                            <Field orientation="horizontal">
                                <input
                                    id="profile-bot"
                                    name="bot"
                                    type="checkbox"
                                    checked={form.bot}
                                    disabled={isBusy || !canWrite}
                                    onChange={(event) => updateField('bot', event.currentTarget.checked)}
                                />
                                <FieldLabel htmlFor="profile-bot">{t('profileEditor.botLabel')}</FieldLabel>
                            </Field>
                            <Button type="button" disabled={isBusy || !canWrite} onClick={() => void saveProfile()}>
                                {isSaving ? t('profileEditor.saving') : t('profileEditor.save')}
                            </Button>
                        </FieldGroup>
                    </CardContent>
                </Card>
            </div>

            {cropTarget ? (
                <ProfileImageCropDialog
                    open
                    kind={cropTarget.kind}
                    previewUrl={cropTarget.previewUrl}
                    fileName={cropTarget.file.name}
                    onOpenChange={(open) => {
                        if (!open) {
                            closeCropDialog();
                        }
                    }}
                    onApply={() => void applyCropAndUpload()}
                />
            ) : null}
        </main>
        </OverlaySurface>
    );
}

function TextField({
    name,
    label,
    value,
    disabled,
    onChange,
}: {
    name: keyof ProfileEditorFormState;
    label: string;
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    const id = `profile-${name}`;

    return (
        <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Input id={id} name={name} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />
        </Field>
    );
}

function formStateFromProfile(profile: NostrProfile | undefined): ProfileEditorFormState {
    return {
        name: profile?.name ?? '',
        displayName: profile?.displayName ?? '',
        about: profile?.about ?? '',
        picture: profile?.picture ?? '',
        banner: profile?.banner ?? '',
        website: profile?.website ?? '',
        nip05: profile?.nip05 ?? '',
        lud16: profile?.lud16 ?? '',
        lud06: profile?.lud06 ?? '',
        birthday: formatBirthday(profile?.birthday),
        bot: profile?.bot ?? false,
    };
}

function formatBirthday(birthday: NostrProfileBirthday | undefined): string {
    if (!birthday) {
        return '';
    }

    const month = birthday.month ? String(birthday.month).padStart(2, '0') : '';
    const day = birthday.day ? String(birthday.day).padStart(2, '0') : '';
    if (birthday.year && month && day) {
        return `${birthday.year}-${month}-${day}`;
    }

    if (month && day) {
        return `${month}-${day}`;
    }

    return '';
}

function parseBirthday(value: string): NostrProfileBirthday | undefined {
    const normalized = value.trim();
    const fullMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
    if (fullMatch) {
        return {
            year: Number(fullMatch[1]),
            month: Number(fullMatch[2]),
            day: Number(fullMatch[3]),
        };
    }

    const partialMatch = /^(\d{2})-(\d{2})$/.exec(normalized);
    if (partialMatch) {
        return {
            month: Number(partialMatch[1]),
            day: Number(partialMatch[2]),
        };
    }

    return undefined;
}

function buildPreviewRows(form: ProfileEditorFormState, t: ReturnType<typeof useI18n>['t']): Array<{ label: string; value: ReactNode }> {
    const rows: Array<{ label: string; value: ReactNode }> = [];

    addTextRow(rows, t('profileEditor.aboutLabel'), form.about);
    addTextRow(rows, 'NIP-05', form.nip05);
    addTextRow(rows, t('profileEditor.websiteLabel'), form.website);
    addTextRow(rows, 'LUD16', form.lud16);
    addTextRow(rows, 'LUD06', form.lud06);
    addTextRow(rows, t('profileEditor.birthdayLabel'), form.birthday);

    if (form.bot) {
        rows.push({ label: t('profileEditor.botLabel'), value: t('profile.info.yes') });
    }

    return rows;
}

function addTextRow(rows: Array<{ label: string; value: ReactNode }>, label: string, value: string): void {
    const trimmedValue = value.trim();
    if (trimmedValue) {
        rows.push({ label, value: trimmedValue });
    }
}

function shortNpub(pubkey: string): string {
    try {
        const npub = encodeHexToNpub(pubkey);
        return `${npub.slice(0, 14)}...${npub.slice(-6)}`;
    } catch {
        return `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
    }
}
