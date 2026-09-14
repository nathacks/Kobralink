import { AMS_MATERIALS, DEFAULT_DENSITY, type LocalSpoolDto, localSpoolSchema } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { m } from '@/lib/i18n';
import { spoolsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { SettingsCard } from './settings-form-card';

export function SpoolsCard() {
    const qc = useQueryClient();
    const [archived, setArchived] = useState(false);
    const spools = useQuery(spoolsQuery(archived));
    const invalidate = () => qc.invalidateQueries({ queryKey: ['spools'] });
    const onError = (e: Error) => toast.error(e.message);
    const update = useMutation({
        mutationFn: (v: { id: string; archived: boolean }) => api.spools.update(v.id, { archived: v.archived }),
        onSuccess: invalidate,
        onError,
    });
    const remove = useMutation({ mutationFn: api.spools.remove, onSuccess: invalidate, onError });
    const open = (spool?: LocalSpoolDto) =>
        confirmationDialogStore.actions.openDialog({
            title: spool ? m.spools_edit() : m.spools_add(),
            content: <SpoolForm spool={spool} onSaved={invalidate} />,
        });
    const list = (spools.data ?? []).filter((s) => s.archived === archived);
    return (
        <SettingsCard
            title={
                <>
                    {m.spools_title()}
                    <span className="ml-auto flex gap-1 rounded-full bg-secondary p-1 text-xs font-normal">
                        <button
                            type="button"
                            onClick={() => setArchived(false)}
                            className={cn('rounded-full px-3 py-1', !archived && 'bg-primary text-primary-foreground')}
                        >
                            {m.spools_active()}
                        </button>
                        <button
                            type="button"
                            onClick={() => setArchived(true)}
                            className={cn('rounded-full px-3 py-1', archived && 'bg-primary text-primary-foreground')}
                        >
                            {m.spools_archived()}
                        </button>
                    </span>
                </>
            }
            description={m.spools_hint()}
        >
            {list.length === 0 ? (
                <p className="text-sm text-muted-foreground">{m.spools_empty()}</p>
            ) : (
                <ul className="grid gap-2">
                    {list.map((s) => {
                        const pct = s.initialWeightG ? Math.max(0, Math.min(1, s.remainingG / s.initialWeightG)) : 0;
                        return (
                            <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-3">
                                <span
                                    className="size-8 shrink-0 rounded-full ring-2 ring-background"
                                    style={{ background: s.colorHex }}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">
                                        {s.vendor ? `${s.vendor} · ` : ''}
                                        {s.name} <span className="text-muted-foreground">· {s.material}</span>
                                    </div>
                                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background/60">
                                        <div
                                            className={cn(
                                                'h-full rounded-full',
                                                pct < 0.15 ? 'bg-destructive' : 'bg-primary',
                                            )}
                                            style={{ width: `${pct * 100}%` }}
                                        />
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        {m.spools_remaining({
                                            remaining: Math.round(s.remainingG),
                                            total: Math.round(s.initialWeightG),
                                            meters: (s.usedMm / 1000).toFixed(1),
                                        })}
                                        {s.lastUsedAt
                                            ? ` · ${m.spools_last_used({ date: formatDate(s.lastUsedAt) })}`
                                            : ''}
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <Small title={m.spools_edit()} onClick={() => open(s)}>
                                        <Pencil />
                                    </Small>
                                    <Small
                                        title={s.archived ? m.spools_unarchive() : m.spools_archive()}
                                        onClick={() => update.mutate({ id: s.id, archived: !s.archived })}
                                    >
                                        {s.archived ? <ArchiveRestore /> : <Archive />}
                                    </Small>
                                    <Small
                                        title={m.common_delete()}
                                        onClick={() =>
                                            alertConfirmationDialogStore.actions.openAlertDialog({
                                                title: m.spools_delete_title({ name: s.name }),
                                                description: m.spools_delete_hint(),
                                                actionLabel: m.common_delete(),
                                                onAction: () => remove.mutateAsync(s.id),
                                            })
                                        }
                                    >
                                        <Trash2 />
                                    </Small>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            <div>
                <Button type="button" size="sm" className="rounded-full" onClick={() => open()}>
                    <Plus /> {m.spools_add()}
                </Button>
            </div>
        </SettingsCard>
    );
}

function Small({ title, ...props }: React.ComponentProps<'button'> & { title: string }) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            {...props}
            className="flex size-8 items-center justify-center rounded-full bg-background/50 hover:bg-background [&_svg]:size-3.5"
        />
    );
}

function SpoolForm({ spool, onSaved }: { spool?: LocalSpoolDto; onSaved: () => void }) {
    const close = confirmationDialogStore.actions.closeDialog;
    const save = useMutation({
        mutationFn: (v: ReturnType<typeof localSpoolSchema.parse>) =>
            spool ? api.spools.update(spool.id, v) : api.spools.create(v),
        onSuccess: () => {
            toast.success(m.settings_saved());
            onSaved();
            close();
        },
        onError: (e) => toast.error(e.message),
    });
    const form = useForm({
        defaultValues: {
            name: spool?.name ?? '',
            vendor: spool?.vendor ?? '',
            material: spool?.material ?? 'PLA',
            colorHex: spool?.colorHex ?? '#808080',
            diameterMm: spool?.diameterMm ?? 1.75,
            densityGcm3: spool?.densityGcm3 ?? 1.24,
            initialWeightG: spool?.initialWeightG ?? 1000,
            usedMm: spool?.usedMm ?? 0,
            archived: spool?.archived ?? false,
        },
        validators: { onSubmit: localSpoolSchema.required() },
        onSubmit: ({ value }) => save.mutateAsync(localSpoolSchema.parse(value)).catch(() => undefined),
    });
    const num = (name: 'diameterMm' | 'densityGcm3' | 'initialWeightG' | 'usedMm', label: string, step: number) => (
        <form.Field name={name}>
            {(field) => (
                <div className="grid gap-2">
                    <Label htmlFor={`spool-${name}`}>{label}</Label>
                    <Input
                        id={`spool-${name}`}
                        type="number"
                        step={step}
                        value={Number.isNaN(field.state.value) ? '' : field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                        aria-invalid={fieldInvalid(field.state.meta)}
                        className="rounded-full px-4"
                    />
                    <FieldError meta={field.state.meta} />
                </div>
            )}
        </form.Field>
    );
    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <div className="grid gap-4 py-2 sm:grid-cols-2">
                <form.Field name="name">
                    {(field) => (
                        <div className="grid gap-2">
                            <Label htmlFor="spool-name">{m.field_name()}</Label>
                            <Input
                                id="spool-name"
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => field.handleChange(e.target.value)}
                                aria-invalid={fieldInvalid(field.state.meta)}
                                className="rounded-full px-4"
                            />
                            <FieldError meta={field.state.meta} />
                        </div>
                    )}
                </form.Field>
                <form.Field name="vendor">
                    {(field) => (
                        <div className="grid gap-2">
                            <Label htmlFor="spool-vendor">{m.spools_vendor()}</Label>
                            <Input
                                id="spool-vendor"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                className="rounded-full px-4"
                            />
                        </div>
                    )}
                </form.Field>
                <form.Field name="material">
                    {(field) => (
                        <div className="grid gap-2">
                            <Label htmlFor="spool-material">{m.slot_material()}</Label>
                            <Select
                                value={field.state.value}
                                onValueChange={(v) => {
                                    field.handleChange(v);
                                    const d = DEFAULT_DENSITY[v.split('-')[0]];
                                    if (d) form.setFieldValue('densityGcm3', d);
                                }}
                            >
                                <SelectTrigger id="spool-material" className="rounded-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {AMS_MATERIALS.map((mat) => (
                                        <SelectItem key={mat} value={mat}>
                                            {mat}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </form.Field>
                <form.Field name="colorHex">
                    {(field) => (
                        <div className="grid gap-2">
                            <Label htmlFor="spool-color">{m.slot_color()}</Label>
                            <div className="flex items-center gap-2">
                                <input
                                    id="spool-color"
                                    type="color"
                                    value={field.state.value}
                                    onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
                                    className="size-9 cursor-pointer rounded-full border-0 bg-transparent"
                                />
                                <Input
                                    value={field.state.value}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    aria-invalid={fieldInvalid(field.state.meta)}
                                    className="rounded-full px-4 font-mono"
                                />
                            </div>
                            <FieldError meta={field.state.meta} />
                        </div>
                    )}
                </form.Field>
                {num('initialWeightG', m.spools_initial_weight(), 50)}
                {num('usedMm', m.spools_used_mm(), 100)}
                {num('diameterMm', m.spools_diameter(), 0.05)}
                {num('densityGcm3', m.spools_density(), 0.01)}
            </div>
            <DialogFooter>
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
