import {
    AMS_MATERIALS,
    type AmsSlot,
    type AmsSlotFormValues,
    amsSlotFormSchema,
    materialFamily,
    type SlotFilamentInfo,
} from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { hexToRgb, rgbToHex } from '@/lib/color';
import { filamentProfilesQuery, filamentSlotsQuery } from '@/lib/queries';
import { useConfirmationDialogStore } from '@/stores/confirmation-dialog';
import { usePrinter } from '@/stores/printers';

export function SlotForm({ printerId, slot }: { printerId: string; slot: AmsSlot }) {
    const slotInfos = useQuery(filamentSlotsQuery(printerId));
    if (slotInfos.isPending) return <div className="h-64 animate-pulse rounded-2xl bg-secondary/60" />;
    const current = slotInfos.data?.find((x) => x.slotIndex === slot.globalIndex);
    return <SlotFormInner printerId={printerId} slot={slot} current={current} />;
}

function SlotFormInner({
    printerId,
    slot,
    current,
}: {
    printerId: string;
    slot: AmsSlot;
    current: SlotFilamentInfo | undefined;
}) {
    const printer = usePrinter(printerId);
    const live = printer?.live;
    const visibleVendors = printer?.settings.visibleVendors ?? [];
    const qc = useQueryClient();
    const profiles = useQuery(filamentProfilesQuery);
    const loaded = live?.amsLoadedSlot === slot.globalIndex;
    const busy = live?.printState === 'printing';
    const onClose = useConfirmationDialogStore((s) => s.closeDialog);
    const onError = (e: Error) => toast.error(e.message);
    const save = useMutation({
        mutationFn: async (v: AmsSlotFormValues & { profile: string }) => {
            const [vendor = '', name = ''] = v.profile ? v.profile.split('|||') : [];
            const overrideKey = current?.override ? profileKey(current.override) : '';
            await Promise.all([
                api.ams.setSlot(printerId, { index: slot.globalIndex, type: v.type, color: hexToRgb(v.color) }),
                v.profile !== overrideKey
                    ? api.filament.setSlotProfile(printerId, slot.globalIndex, { vendor, name })
                    : Promise.resolve(),
            ]);
        },
        onSuccess: () => {
            toast.success(`Slot ${slot.index + 1} mis à jour`);
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'filament-slots'] });
            onClose();
        },
        onError,
    });
    const feed = useMutation({
        mutationFn: (type: 1 | 2) => api.ams.feed(printerId, { slotIndex: slot.globalIndex, type }),
        onSuccess: (_, type) => {
            toast.success(type === 1 ? 'Chargement du filament…' : 'Retrait du filament…');
            onClose();
        },
        onError,
    });
    const form = useForm({
        defaultValues: {
            type: slot.type || 'PLA',
            color: rgbToHex(slot.color),
            profile: current?.override ? profileKey(current.override) : '',
        },
        validators: { onSubmit: amsSlotFormSchema.extend({ profile: z.string() }) },
        onSubmit: ({ value }) => save.mutateAsync(value).catch(() => undefined),
    });
    const isKnown = (v: string) => (AMS_MATERIALS as readonly string[]).includes(v);

    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <div className="grid gap-4 py-4">
                <form.Field name="type">
                    {(field) => {
                        const custom = !isKnown(field.state.value);
                        return (
                            <div className="grid gap-2">
                                <Label htmlFor="slot-type">Matière</Label>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <Select
                                        value={custom ? '__custom' : field.state.value}
                                        onValueChange={(v) => field.handleChange(v === '__custom' ? '' : v)}
                                    >
                                        <SelectTrigger className="rounded-full">
                                            <SelectValue placeholder="Choisir" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {AMS_MATERIALS.map((m) => (
                                                <SelectItem key={m} value={m}>
                                                    {m}
                                                </SelectItem>
                                            ))}
                                            <SelectItem value="__custom">Autre…</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {custom && (
                                        <Input
                                            id="slot-type"
                                            placeholder="Ex. PLA-SILK"
                                            value={field.state.value}
                                            onBlur={field.handleBlur}
                                            onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
                                            aria-invalid={fieldInvalid(field.state.meta)}
                                            className="rounded-full px-4"
                                            autoFocus
                                        />
                                    )}
                                </div>
                                <FieldError meta={field.state.meta} />
                            </div>
                        );
                    }}
                </form.Field>
                <form.Field name="color">
                    {(field) => (
                        <div className="grid gap-2">
                            <Label htmlFor="slot-color">Couleur</Label>
                            <div className="flex items-center gap-3">
                                <input
                                    id="slot-color"
                                    type="color"
                                    value={field.state.value}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    className="size-10 cursor-pointer rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
                                />
                                <Input
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    aria-invalid={fieldInvalid(field.state.meta)}
                                    className="w-32 rounded-full px-4 font-mono uppercase"
                                    maxLength={7}
                                />
                            </div>
                            <FieldError meta={field.state.meta} />
                        </div>
                    )}
                </form.Field>
                <form.Field name="profile">
                    {(field) => (
                        <form.Subscribe selector={(st) => st.values.type}>
                            {(type) => {
                                const family = materialFamily(type);
                                const options = (profiles.data ?? [])
                                    .filter((p) => !family || materialFamily(p.type) === family)
                                    .filter(
                                        (p) => p.isUser || !visibleVendors.length || visibleVendors.includes(p.vendor),
                                    )
                                    .sort(
                                        (a, b) =>
                                            Number(b.isUser ?? false) - Number(a.isUser ?? false) ||
                                            a.vendor.localeCompare(b.vendor) ||
                                            a.name.localeCompare(b.name),
                                    );
                                const auto = current?.source === 'rfid' ? current.profile : null;
                                return (
                                    <div className="grid gap-2">
                                        <Label htmlFor="slot-profile">Profil OrcaSlicer</Label>
                                        <Select
                                            value={field.state.value || '__none'}
                                            onValueChange={(v) => field.handleChange(v === '__none' ? '' : v)}
                                        >
                                            <SelectTrigger id="slot-profile" className="rounded-full">
                                                <SelectValue placeholder="Générique" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none">
                                                    {auto
                                                        ? `Auto (RFID) · ${auto.vendor} ${auto.name}`
                                                        : `Générique (${family || type})`}
                                                </SelectItem>
                                                {options.map((p) => (
                                                    <SelectItem key={profileKey(p)} value={profileKey(p)}>
                                                        {p.isUser ? '★ ' : ''}
                                                        {p.vendor} · {p.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="px-4 text-xs text-muted-foreground">
                                            Envoyé à OrcaSlicer comme marque + nom de preset pour ce slot.
                                        </p>
                                    </div>
                                );
                            }}
                        </form.Subscribe>
                    )}
                </form.Field>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        className="rounded-full"
                        disabled={busy || feed.isPending || slot.status !== 5 || loaded}
                        onClick={() => feed.mutate(1)}
                    >
                        <ArrowDownToLine /> Charger
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        className="rounded-full"
                        disabled={busy || feed.isPending || !loaded}
                        onClick={() => feed.mutate(2)}
                    >
                        <ArrowUpFromLine /> Retirer
                    </Button>
                </div>
                <form.Subscribe selector={(s) => s.isSubmitting}>
                    {(isSubmitting) => (
                        <Button type="submit" className="rounded-full px-5" disabled={isSubmitting}>
                            Enregistrer
                        </Button>
                    )}
                </form.Subscribe>
            </DialogFooter>
        </form>
    );
}

function profileKey(p: { vendor: string; name: string }): string {
    return `${p.vendor}|||${p.name}`;
}
