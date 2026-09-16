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
import { usePrinter } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { hexToRgb, rgbToHex } from '@/lib/color';
import { m } from '@/lib/i18n';
import {
    filamentProfilesQuery,
    filamentSlotsQuery,
    spoolAssignmentsQuery,
    spoolmanSpoolsQuery,
    spoolmanStatusQuery,
    spoolsQuery,
} from '@/lib/queries';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';

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
    const spoolman = useQuery(spoolmanStatusQuery(printerId));
    const spoolmanOn = Boolean(spoolman.data?.configured);
    const spools = useQuery(spoolmanSpoolsQuery(spoolmanOn));
    const currentSpool = spoolman.data?.slotSpools[String(slot.globalIndex)] ?? 0;
    const localSpools = useQuery(spoolsQuery());
    const localAssign = useQuery(spoolAssignmentsQuery(printerId));
    const currentLocal = localAssign.data?.slotSpools[String(slot.globalIndex)] ?? '';
    const loaded = live?.amsLoadedSlot === slot.globalIndex;
    const busy = live?.printState === 'printing';
    const onClose = confirmationDialogStore.actions.closeDialog;
    const onError = (e: Error) => toast.error(e.message);
    const save = useMutation({
        mutationFn: async (v: AmsSlotFormValues & { profile: string; spoolId: number; localSpoolId: string }) => {
            const [vendor = '', name = ''] = v.profile ? v.profile.split('|||') : [];
            const overrideKey = current?.override ? profileKey(current.override) : '';
            const tasks: Promise<unknown>[] = [
                api.ams.setSlot(printerId, { index: slot.globalIndex, type: v.type, color: hexToRgb(v.color) }),
            ];
            if (v.profile !== overrideKey) {
                tasks.push(api.filament.setSlotProfile(printerId, slot.globalIndex, { vendor, name }));
            }
            if (spoolmanOn && v.spoolId !== currentSpool) {
                const map = { ...(spoolman.data?.slotSpools ?? {}) };
                if (v.spoolId > 0) map[String(slot.globalIndex)] = v.spoolId;
                else delete map[String(slot.globalIndex)];
                tasks.push(api.spoolman.setSlots(printerId, map));
            }
            if (v.localSpoolId !== currentLocal) {
                tasks.push(api.spools.assign(printerId, { [String(slot.globalIndex)]: v.localSpoolId || null }));
            }
            await Promise.all(tasks);
        },
        onSuccess: () => {
            toast.success(m.slot_updated({ n: slot.index + 1 }));
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'filament-slots'] });
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'spoolman'] });
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'spools'] });
            onClose();
        },
        onError,
    });
    const feed = useMutation({
        mutationFn: (type: 1 | 2) => api.ams.feed(printerId, { slotIndex: slot.globalIndex, type }),
        onSuccess: (_, type) => {
            toast.success(type === 1 ? m.slot_loading() : m.slot_unloading());
            onClose();
        },
        onError,
    });
    const form = useForm({
        defaultValues: {
            type: slot.type || 'PLA',
            color: rgbToHex(slot.color),
            profile: current?.override ? profileKey(current.override) : '',
            spoolId: currentSpool,
            localSpoolId: currentLocal,
        },
        validators: {
            onSubmit: amsSlotFormSchema.extend({
                profile: z.string(),
                spoolId: z.number().int().min(0),
                localSpoolId: z.string(),
            }),
        },
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
                                <Label htmlFor="slot-type">{m.slot_material()}</Label>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <Select
                                        value={custom ? '__custom' : field.state.value}
                                        onValueChange={(v) => field.handleChange(v === '__custom' ? '' : v)}
                                    >
                                        <SelectTrigger className="rounded-full">
                                            <SelectValue placeholder={m.slot_choose()} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {AMS_MATERIALS.map((m) => (
                                                <SelectItem key={m} value={m}>
                                                    {m}
                                                </SelectItem>
                                            ))}
                                            <SelectItem value="__custom">{m.slot_other()}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {custom && (
                                        <Input
                                            id="slot-type"
                                            placeholder={m.slot_custom_placeholder()}
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
                            <Label htmlFor="slot-color">{m.slot_color()}</Label>
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
                                        <Label htmlFor="slot-profile">{m.slot_profile()}</Label>
                                        <Select
                                            value={field.state.value || '__none'}
                                            onValueChange={(v) => field.handleChange(v === '__none' ? '' : v)}
                                        >
                                            <SelectTrigger id="slot-profile" className="rounded-full">
                                                <SelectValue placeholder={m.slot_generic()} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none">
                                                    {auto
                                                        ? m.slot_auto_rfid({ vendor: auto.vendor, name: auto.name })
                                                        : m.slot_generic_family({ family: family || type })}
                                                </SelectItem>
                                                {options.map((p) => (
                                                    <SelectItem key={profileKey(p)} value={profileKey(p)}>
                                                        {p.isUser ? '★ ' : ''}
                                                        {p.vendor} · {p.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="px-4 text-xs text-muted-foreground">{m.slot_profile_hint()}</p>
                                    </div>
                                );
                            }}
                        </form.Subscribe>
                    )}
                </form.Field>
                {spoolmanOn && (
                    <form.Field name="spoolId">
                        {(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor="slot-spool">{m.slot_spool()}</Label>
                                <Select
                                    value={String(field.state.value)}
                                    onValueChange={(v) => field.handleChange(Number(v))}
                                    disabled={spools.isPending}
                                >
                                    <SelectTrigger id="slot-spool" className="rounded-full">
                                        <SelectValue
                                            placeholder={
                                                spools.isError ? m.slot_spool_unreachable() : m.slot_spool_none()
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">{m.slot_spool_none()}</SelectItem>
                                        {(spools.data ?? [])
                                            .filter((sp) => !sp.archived)
                                            .map((sp) => (
                                                <SelectItem key={sp.id} value={String(sp.id)}>
                                                    #{sp.id} ·{' '}
                                                    {sp.filament.vendor?.name ? `${sp.filament.vendor.name} ` : ''}
                                                    {sp.filament.name ?? sp.filament.material ?? ''}
                                                    {sp.remaining_weight !== undefined
                                                        ? ` · ${Math.round(sp.remaining_weight)} g`
                                                        : ''}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                                <p className="px-4 text-xs text-muted-foreground">{m.slot_spool_hint()}</p>
                            </div>
                        )}
                    </form.Field>
                )}
                {(localSpools.data?.length ?? 0) > 0 && (
                    <form.Field name="localSpoolId">
                        {(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor="slot-local-spool">{m.slot_local_spool()}</Label>
                                <Select
                                    value={field.state.value || '__none'}
                                    onValueChange={(v) => field.handleChange(v === '__none' ? '' : v)}
                                >
                                    <SelectTrigger id="slot-local-spool" className="rounded-full">
                                        <SelectValue placeholder={m.slot_spool_none()} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none">{m.slot_spool_none()}</SelectItem>
                                        {(localSpools.data ?? []).map((sp) => (
                                            <SelectItem key={sp.id} value={sp.id}>
                                                <span
                                                    className="mr-2 inline-block size-2.5 rounded-full ring-1 ring-black/10"
                                                    style={{ background: sp.colorHex }}
                                                />
                                                {sp.vendor ? `${sp.vendor} ` : ''}
                                                {sp.name} · {sp.material} · {Math.round(sp.remainingG)} g
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="px-4 text-xs text-muted-foreground">{m.slot_local_spool_hint()}</p>
                            </div>
                        )}
                    </form.Field>
                )}
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
                        <ArrowDownToLine /> {m.slot_load()}
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        className="rounded-full"
                        disabled={busy || feed.isPending || !loaded}
                        onClick={() => feed.mutate(2)}
                    >
                        <ArrowUpFromLine /> {m.slot_unload()}
                    </Button>
                </div>
                <form.Subscribe selector={(s) => s.isSubmitting}>
                    {(isSubmitting) => (
                        <Button type="submit" className="rounded-full px-5" disabled={isSubmitting}>
                            {m.common_save()}
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
