import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/useI18n';
import { useState } from 'react';

export interface NostrGroupRelaySummary {
    relayUrl: string;
    groupCount: number;
    savedCount: number;
    rememberedCount: number;
    isConfigured: boolean;
}

interface GroupRelayListProps {
    relays: NostrGroupRelaySummary[];
    selectedRelayUrl: string | null;
    onSelectRelay: (relayUrl: string) => void;
    onAddCustomGroupRelay: (relayUrl: string) => void;
}

export function GroupRelayList({ relays, selectedRelayUrl, onSelectRelay, onAddCustomGroupRelay }: GroupRelayListProps) {
    const { t } = useI18n();
    const [customRelay, setCustomRelay] = useState('');
    const [addRelayOpen, setAddRelayOpen] = useState(false);

    const addCustomRelay = (): void => {
        const relay = customRelay.trim();
        if (!relay) {
            return;
        }

        onAddCustomGroupRelay(relay);
        setCustomRelay('');
        setAddRelayOpen(false);
    };

    return (
        <Card className="flex min-h-0 flex-col lg:max-h-full">
            <CardHeader>
                <CardTitle>{t('groups.relays.title')}</CardTitle>
                <CardDescription>{t('groups.relays.description')}</CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1">
                <div className="flex h-full min-h-0 flex-col gap-4">
                    <nav aria-label={t('groups.relays.aria')} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                        {relays.map((relay) => {
                            const selected = relay.relayUrl === selectedRelayUrl;

                            return (
                                <Button
                                    key={relay.relayUrl}
                                    type="button"
                                    variant={selected ? 'secondary' : 'ghost'}
                                    className="h-auto w-full justify-start px-3 py-3 text-left"
                                    aria-current={selected ? 'true' : undefined}
                                    aria-pressed={selected}
                                    onClick={() => onSelectRelay(relay.relayUrl)}
                                >
                                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                                        <span className="truncate font-medium">{relay.relayUrl}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {relay.isConfigured ? t('groups.relays.configured') : t('groups.relays.discovered')}
                                        </span>
                                    </span>
                                    <Badge variant="secondary">{relay.groupCount}</Badge>
                                </Button>
                            );
                        })}
                    </nav>
                    <Dialog open={addRelayOpen} onOpenChange={setAddRelayOpen}>
                        <DialogTrigger asChild>
                            <Button type="button" className="w-full">
                                {t('groups.relays.addCustom')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{t('groups.relays.addDialogTitle')}</DialogTitle>
                                <DialogDescription>{t('groups.relays.customDescription')}</DialogDescription>
                            </DialogHeader>
                            <FieldGroup>
                                <Field>
                                    <FieldLabel htmlFor="custom-group-relay">{t('groups.relays.customLabel')}</FieldLabel>
                                    <Input
                                        id="custom-group-relay"
                                        aria-label={t('groups.relays.customAria')}
                                        value={customRelay}
                                        onChange={(event) => setCustomRelay(event.currentTarget.value)}
                                        placeholder="wss://groups.example"
                                    />
                                    <FieldDescription>{t('groups.relays.customDescription')}</FieldDescription>
                                </Field>
                            </FieldGroup>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    aria-label={t('groups.relays.addCustomAria')}
                                    onClick={addCustomRelay}
                                >
                                    {t('groups.relays.addCustom')}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardContent>
        </Card>
    );
}
