import {
    MACRO_ICONS,
    type MacroAction,
    type MacroActionType,
    type MacroDto,
    type MacroIcon,
    macroSchema,
} from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { MACRO_ICON } from '@/components/printer/macro-icon';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { macrosQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { SettingsCard } from './settings-form-card';

const ACTION_TYPES: MacroActionType[] = [
    'temperature',
    'waitTemp',
    'fan',
    'light',
    'speed',
    'home',
    'move',
    'motorsOff',
    'feed',
    'dry',
    'dryStop',
    'wait',
];

const ACTION_LABEL: Record<MacroActionType, () => string> = {
    temperature: m.macro_action_temperature,
    waitTemp: m.macro_action_wait_temp,
    fan: m.macro_action_fan,
    light: m.macro_action_light,
    speed: m.macro_action_speed,
    home: m.macro_action_home,
    move: m.macro_action_move,
    motorsOff: m.macro_action_motors_off,
    feed: m.macro_action_feed,
    dry: m.macro_action_dry,
    dryStop: m.macro_action_dry_stop,
    wait: m.macro_action_wait,
};

function defaultAction(type: MacroActionType): MacroAction {
    switch (type) {
        case 'temperature':
            return { type, nozzle: 200, bed: 60 };
        case 'waitTemp':
            return { type, nozzle: 200, bed: 60 };
        case 'fan':
            return { type, speed: 100 };
        case 'light':
            return { type, on: true };
        case 'speed':
            return { type, mode: 2 };
        case 'home':
            return { type, axis: 'all' };
        case 'move':
            return { type, axis: 'z', distance: 10 };
        case 'motorsOff':
            return { type };
        case 'feed':
            return { type, slotIndex: 0, direction: 'in' };
        case 'dry':
            return { type, targetTemp: 45, duration: 240 };
        case 'dryStop':
            return { type };
        case 'wait':
            return { type, seconds: 5 };
    }
}

export function describeAction(a: MacroAction): string {
    switch (a.type) {
        case 'temperature':
        case 'waitTemp':
            return [
                a.nozzle !== undefined ? `${m.activity_nozzle()} ${a.nozzle} °C` : '',
                a.bed !== undefined ? `${m.activity_bed()} ${a.bed} °C` : '',
            ]
                .filter(Boolean)
                .join(' · ');
        case 'fan':
            return `${a.speed} %`;
        case 'light':
            return a.on ? m.macro_on() : m.macro_off();
        case 'speed':
            return `${m.macro_mode()} ${a.mode}`;
        case 'home':
            return a.axis.toUpperCase();
        case 'move':
            return `${a.axis.toUpperCase()} ${a.distance > 0 ? '+' : ''}${a.distance} mm`;
        case 'feed':
            return `${m.settings_slot_n({ n: a.slotIndex + 1 })} · ${a.direction === 'in' ? m.slot_load() : m.slot_unload()}`;
        case 'dry':
            return `${a.targetTemp} °C · ${a.duration} min`;
        case 'wait':
            return `${a.seconds} s`;
        default:
            return '';
    }
}

export function openMacroForm(macro: MacroDto | undefined, onSaved: () => void) {
    confirmationDialogStore.actions.openDialog({
        title: macro ? m.macros_edit() : m.macros_add(),
        description: m.macros_form_hint(),
        props: { className: 'rounded-3xl sm:max-w-2xl' },
        content: <MacroForm macro={macro} onSaved={onSaved} />,
    });
}

export function MacrosEditor({ embedded = false }: { embedded?: boolean }) {
    const qc = useQueryClient();
    const macros = useQuery(macrosQuery);
    const invalidate = () => qc.invalidateQueries({ queryKey: ['macros'] });
    const onError = (e: Error) => toast.error(e.message);
    const remove = useMutation({ mutationFn: api.macros.remove, onSuccess: invalidate, onError });
    const reorder = useMutation({
        mutationFn: api.macros.reorder,
        onSuccess: (next) => qc.setQueryData(macrosQuery.queryKey, next),
        onError,
    });
    const list = macros.data ?? [];
    const move = (i: number, dir: -1 | 1) => {
        const ids = list.map((x) => x.id);
        const j = i + dir;
        if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        reorder.mutate(ids);
    };
    const open = (macro?: MacroDto) => openMacroForm(macro, invalidate);
    const body = (
        <>
            {list.length === 0 ? (
                <p className="text-sm text-muted-foreground">{m.macros_empty_pinned()}</p>
            ) : (
                <ul className="grid gap-2">
                    {list.map((macro, i) => {
                        const Icon = MACRO_ICON[macro.icon];
                        return (
                            <li key={macro.id} className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-3">
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background/60 [&_svg]:size-4">
                                    <Icon />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium">{macro.name}</div>
                                    <div className="truncate text-xs text-muted-foreground">
                                        {macro.actions
                                            .map((a) => `${ACTION_LABEL[a.type]()} ${describeAction(a)}`.trim())
                                            .join(' → ')}
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <Small title={m.queue_move_up()} disabled={i === 0} onClick={() => move(i, -1)}>
                                        <ArrowUp />
                                    </Small>
                                    <Small
                                        title={m.queue_move_down()}
                                        disabled={i === list.length - 1}
                                        onClick={() => move(i, 1)}
                                    >
                                        <ArrowDown />
                                    </Small>
                                    <Small title={m.macros_edit()} onClick={() => open(macro)}>
                                        <Pencil />
                                    </Small>
                                    <Small
                                        title={m.common_delete()}
                                        onClick={() =>
                                            alertConfirmationDialogStore.actions.openAlertDialog({
                                                title: m.macros_delete_title({ name: macro.name }),
                                                actionLabel: m.common_delete(),
                                                onAction: () => remove.mutateAsync(macro.id),
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
                    <Plus /> {m.macros_add()}
                </Button>
            </div>
        </>
    );
    if (embedded) return <div className="grid gap-4 py-2">{body}</div>;
    return (
        <SettingsCard title={m.macros_title()} description={m.macros_hint()}>
            {body}
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
            className="flex size-8 items-center justify-center rounded-full bg-background/50 hover:bg-background disabled:opacity-30 [&_svg]:size-3.5"
        />
    );
}

function MacroForm({ macro, onSaved }: { macro?: MacroDto; onSaved: () => void }) {
    const close = confirmationDialogStore.actions.closeDialog;
    const save = useMutation({
        mutationFn: (v: { name: string; icon: MacroIcon; actions: MacroAction[] }) =>
            macro ? api.macros.update(macro.id, v) : api.macros.create(v),
        onSuccess: () => {
            toast.success(m.settings_saved());
            onSaved();
            close();
        },
        onError: (e) => toast.error(e.message),
    });
    const form = useForm({
        defaultValues: {
            name: macro?.name ?? '',
            icon: (macro?.icon ?? 'zap') as MacroIcon,
            actions: (macro?.actions ?? [defaultAction('temperature')]) as MacroAction[],
        },
        validators: { onSubmit: macroSchema.required() },
        onSubmit: ({ value }) => save.mutateAsync(value).catch(() => undefined),
    });
    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <div className="grid gap-4 py-2">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                    <form.Field name="name">
                        {(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor="macro-name">{m.field_name()}</Label>
                                <Input
                                    id="macro-name"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    aria-invalid={fieldInvalid(field.state.meta)}
                                    className="rounded-full px-4"
                                    placeholder="PREHEAT_PLA"
                                />
                                <FieldError meta={field.state.meta} />
                            </div>
                        )}
                    </form.Field>
                    <form.Field name="icon">
                        {(field) => (
                            <div className="grid gap-2">
                                <Label>{m.macros_icon()}</Label>
                                <div className="flex flex-wrap gap-1">
                                    {MACRO_ICONS.map((ic) => {
                                        const Icon = MACRO_ICON[ic];
                                        return (
                                            <button
                                                key={ic}
                                                type="button"
                                                onClick={() => field.handleChange(ic)}
                                                aria-pressed={field.state.value === ic}
                                                className={cn(
                                                    'flex size-9 items-center justify-center rounded-full [&_svg]:size-4',
                                                    field.state.value === ic
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'bg-secondary hover:bg-accent',
                                                )}
                                            >
                                                <Icon />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </form.Field>
                </div>
                <form.Field name="actions" mode="array">
                    {(field) => (
                        <div className="grid gap-2">
                            <Label>{m.macros_actions()}</Label>
                            {field.state.value.map((action, i) => (
                                <div
                                    key={`a-${String(i)}`}
                                    className="flex flex-wrap items-center gap-2 rounded-2xl bg-secondary/60 p-2"
                                >
                                    <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
                                    <Select
                                        value={action.type}
                                        onValueChange={(v) =>
                                            field.replaceValue(i, defaultAction(v as MacroActionType))
                                        }
                                    >
                                        <SelectTrigger className="w-44 rounded-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ACTION_TYPES.map((t) => (
                                                <SelectItem key={t} value={t}>
                                                    {ACTION_LABEL[t]()}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <ActionParams action={action} onChange={(a) => field.replaceValue(i, a)} />
                                    <div className="ml-auto flex gap-1">
                                        <Small
                                            title={m.queue_move_up()}
                                            disabled={i === 0}
                                            onClick={() => field.moveValue(i, i - 1)}
                                        >
                                            <ArrowUp />
                                        </Small>
                                        <Small
                                            title={m.queue_move_down()}
                                            disabled={i === field.state.value.length - 1}
                                            onClick={() => field.moveValue(i, i + 1)}
                                        >
                                            <ArrowDown />
                                        </Small>
                                        <Small
                                            title={m.common_delete()}
                                            disabled={field.state.value.length <= 1}
                                            onClick={() => field.removeValue(i)}
                                        >
                                            <X />
                                        </Small>
                                    </div>
                                </div>
                            ))}
                            <div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="rounded-full"
                                    disabled={field.state.value.length >= 30}
                                    onClick={() => field.pushValue(defaultAction('wait'))}
                                >
                                    <Plus /> {m.macros_add_action()}
                                </Button>
                            </div>
                        </div>
                    )}
                </form.Field>
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

function Num({
    value,
    onChange,
    label,
    min,
    max,
    step = 1,
}: {
    value: number | undefined;
    onChange: (v: number | undefined) => void;
    label: string;
    min: number;
    max: number;
    step?: number;
}) {
    return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {label}
            <Input
                aria-label={label}
                type="number"
                min={min}
                max={max}
                step={step}
                value={value === undefined || Number.isNaN(value) ? '' : value}
                onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)}
                className="h-8 w-20 rounded-full text-center text-foreground"
            />
        </span>
    );
}

function ActionParams({ action, onChange }: { action: MacroAction; onChange: (a: MacroAction) => void }) {
    switch (action.type) {
        case 'temperature':
        case 'waitTemp':
            return (
                <>
                    <Num
                        label={m.activity_nozzle()}
                        value={action.nozzle}
                        min={0}
                        max={320}
                        onChange={(v) => onChange({ ...action, nozzle: v })}
                    />
                    <Num
                        label={m.activity_bed()}
                        value={action.bed}
                        min={0}
                        max={120}
                        onChange={(v) => onChange({ ...action, bed: v })}
                    />
                </>
            );
        case 'fan':
            return (
                <Num
                    label="%"
                    value={action.speed}
                    min={0}
                    max={100}
                    onChange={(v) => onChange({ ...action, speed: v ?? 0 })}
                />
            );
        case 'light':
            return (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {action.on ? m.macro_on() : m.macro_off()}
                    <Switch
                        checked={action.on}
                        onCheckedChange={(on) => onChange({ ...action, on })}
                        aria-label={m.macro_action_light()}
                    />
                </span>
            );
        case 'speed':
            return (
                <Select value={String(action.mode)} onValueChange={(v) => onChange({ ...action, mode: Number(v) })}>
                    <SelectTrigger className="h-8 w-36 rounded-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1">{m.controls_speed_quiet()}</SelectItem>
                        <SelectItem value="2">{m.controls_speed_standard()}</SelectItem>
                        <SelectItem value="3">{m.controls_speed_fast()}</SelectItem>
                    </SelectContent>
                </Select>
            );
        case 'home':
            return (
                <Select
                    value={action.axis}
                    onValueChange={(v) => onChange({ ...action, axis: v as 'all' | 'xy' | 'z' })}
                >
                    <SelectTrigger className="h-8 w-24 rounded-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">XYZ</SelectItem>
                        <SelectItem value="xy">XY</SelectItem>
                        <SelectItem value="z">Z</SelectItem>
                    </SelectContent>
                </Select>
            );
        case 'move':
            return (
                <>
                    <Select
                        value={action.axis}
                        onValueChange={(v) => onChange({ ...action, axis: v as 'x' | 'y' | 'z' })}
                    >
                        <SelectTrigger className="h-8 w-20 rounded-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="x">X</SelectItem>
                            <SelectItem value="y">Y</SelectItem>
                            <SelectItem value="z">Z</SelectItem>
                        </SelectContent>
                    </Select>
                    <Num
                        label="mm"
                        value={action.distance}
                        min={-300}
                        max={300}
                        onChange={(v) => onChange({ ...action, distance: v ?? 0 })}
                    />
                </>
            );
        case 'feed':
            return (
                <>
                    <Num
                        label={m.settings_slot_n({ n: '' }).trim()}
                        value={action.slotIndex + 1}
                        min={1}
                        max={20}
                        onChange={(v) => onChange({ ...action, slotIndex: Math.max(0, (v ?? 1) - 1) })}
                    />
                    <Select
                        value={action.direction}
                        onValueChange={(v) => onChange({ ...action, direction: v as 'in' | 'out' })}
                    >
                        <SelectTrigger className="h-8 w-32 rounded-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="in">{m.slot_load()}</SelectItem>
                            <SelectItem value="out">{m.slot_unload()}</SelectItem>
                        </SelectContent>
                    </Select>
                </>
            );
        case 'dry':
            return (
                <>
                    <Num
                        label="°C"
                        value={action.targetTemp}
                        min={30}
                        max={80}
                        onChange={(v) => onChange({ ...action, targetTemp: v ?? 45 })}
                    />
                    <Num
                        label="min"
                        value={action.duration}
                        min={10}
                        max={1440}
                        step={10}
                        onChange={(v) => onChange({ ...action, duration: v ?? 240 })}
                    />
                </>
            );
        case 'wait':
            return (
                <Num
                    label="s"
                    value={action.seconds}
                    min={0}
                    max={600}
                    onChange={(v) => onChange({ ...action, seconds: v ?? 0 })}
                />
            );
        default:
            return null;
    }
}
