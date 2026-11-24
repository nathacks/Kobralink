import {
    AUTOMATION_ACTION_TYPES,
    AUTOMATION_TRIGGERS,
    type AutomationAction,
    type AutomationActionType,
    type AutomationRuleDto,
    type AutomationRuleInput,
    type AutomationTrigger,
    automationRuleSchema,
    type MacroDto,
    type Printer,
} from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { usePrinterList } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { macrosQuery, systemInfoQuery } from '@/lib/queries';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';

export const TRIGGER_LABEL: Record<AutomationTrigger, () => string> = {
    print_finished: m.automations_trigger_print_finished,
    print_failed: m.automations_trigger_print_failed,
    bed_cleared: m.automations_trigger_bed_cleared,
    filament_low: m.automations_trigger_filament_low,
    time: m.automations_trigger_time,
};

export const ACTION_LABEL: Record<AutomationActionType, () => string> = {
    macro: m.automations_action_macro,
    light: m.automations_action_light,
    feed: m.automations_action_feed,
    power: m.automations_action_power,
    notify: m.automations_action_notify,
    wait: m.automations_action_wait,
};

const ANY = 'any';
const TAGS = 'tags';

export function defaultAction(type: AutomationActionType, macros: MacroDto[] = []): AutomationAction {
    switch (type) {
        case 'macro':
            return { type, macroId: macros[0]?.id ?? '' };
        case 'light':
            return { type, on: false };
        case 'feed':
            return { type, slotIndex: 0, direction: 'out' };
        case 'power':
            return { type, action: 'off' };
        case 'notify':
            return { type, message: '' };
        case 'wait':
            return { type, seconds: 60 };
    }
}

export function describeAction(a: AutomationAction, macros: MacroDto[] = []): string {
    switch (a.type) {
        case 'macro':
            return macros.find((x) => x.id === a.macroId)?.name ?? '';
        case 'light':
            return a.on ? m.macro_on() : m.macro_off();
        case 'feed':
            return `${m.settings_slot_n({ n: a.slotIndex + 1 })} · ${a.direction === 'in' ? m.slot_load() : m.slot_unload()}`;
        case 'power':
            return a.action === 'on' ? m.automations_power_on() : m.automations_power_off();
        case 'notify':
            return `“${a.message}”`;
        case 'wait':
            return `${a.seconds} ${m.automations_seconds()}`;
    }
}

export function parseTags(text: string): string[] {
    return text
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
}

interface FormValues {
    name: string;
    trigger: AutomationTrigger;
    time: string;
    target: string;
    tagsText: string;
    actions: AutomationAction[];
}

export function toInput(v: FormValues, enabled = true): AutomationRuleInput {
    const printerId = v.target !== ANY && v.target !== TAGS ? v.target : null;
    return {
        name: v.name,
        enabled,
        trigger: v.trigger,
        time: v.trigger === 'time' ? v.time : '',
        printerId,
        targetTags: v.target === TAGS ? parseTags(v.tagsText) : [],
        actions: v.actions,
    };
}

export function openRuleForm(rule?: AutomationRuleDto, onSaved: () => void = () => undefined) {
    confirmationDialogStore.actions.openDialog({
        title: rule ? m.automations_edit() : m.automations_new(),
        description: m.automations_page_hint(),
        content: <RuleForm rule={rule} onSaved={onSaved} />,
        props: { className: 'sm:max-w-2xl rounded-3xl' },
    });
}

export function RuleForm({ rule, onSaved }: { rule?: AutomationRuleDto; onSaved: () => void }) {
    const close = confirmationDialogStore.actions.closeDialog;
    const printers = usePrinterList();
    const macros = useQuery(macrosQuery).data ?? [];
    const timeZone = useQuery(systemInfoQuery).data?.timeZone;
    const save = useMutation({
        mutationFn: (input: AutomationRuleInput) =>
            rule ? api.automations.update(rule.id, input) : api.automations.create(input),
        onSuccess: () => {
            toast.success(m.automations_saved());
            onSaved();
            close();
        },
    });
    const form = useForm({
        defaultValues: {
            name: rule?.name ?? '',
            trigger: rule?.trigger ?? 'print_finished',
            time: rule?.time || '08:00',
            target: rule?.printerId ?? (rule?.targetTags.length ? TAGS : ANY),
            tagsText: rule?.targetTags.join(', ') ?? '',
            actions: rule?.actions ?? [defaultAction('light')],
        } as FormValues,
        validators: {
            onSubmit: ({ value }) => {
                const res = automationRuleSchema.safeParse(toInput(value));
                if (res.success) return undefined;
                const fields: Record<string, string> = {};
                for (const issue of res.error.issues) {
                    const key = String(issue.path[0] ?? 'name');
                    fields[key === 'targetTags' ? 'tagsText' : key] ??= issue.message;
                }
                return { fields };
            },
        },
        onSubmit: ({ value }) => save.mutateAsync(toInput(value, rule?.enabled ?? true)).catch(() => undefined),
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
                <form.Field name="name">
                    {(field) => (
                        <div className="grid gap-2">
                            <Label htmlFor="rule-name">{m.field_name()}</Label>
                            <Input
                                id="rule-name"
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
                <div className="grid gap-4 sm:grid-cols-2">
                    <form.Field name="trigger">
                        {(field) => (
                            <div className="grid gap-2">
                                <Label>{m.automations_trigger()}</Label>
                                <Select
                                    value={field.state.value}
                                    onValueChange={(v) => field.handleChange(v as AutomationTrigger)}
                                >
                                    <SelectTrigger className="w-full rounded-full" aria-label={m.automations_trigger()}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {AUTOMATION_TRIGGERS.map((t) => (
                                            <SelectItem key={t} value={t}>
                                                {TRIGGER_LABEL[t]()}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </form.Field>
                    <form.Subscribe selector={(s) => s.values.trigger}>
                        {(trigger) =>
                            trigger === 'time' ? (
                                <form.Field name="time">
                                    {(field) => (
                                        <div className="grid gap-2">
                                            <Label htmlFor="rule-time">{m.automations_time()}</Label>
                                            <Input
                                                id="rule-time"
                                                type="time"
                                                value={field.state.value}
                                                onBlur={field.handleBlur}
                                                onChange={(e) => field.handleChange(e.target.value)}
                                                aria-invalid={fieldInvalid(field.state.meta)}
                                                className="rounded-full px-4"
                                            />
                                            <FieldError meta={field.state.meta} />
                                            {timeZone && (
                                                <p className="text-xs text-muted-foreground">
                                                    {m.automations_time_zone({ zone: timeZone })}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </form.Field>
                            ) : null
                        }
                    </form.Subscribe>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <form.Field name="target">
                        {(field) => (
                            <div className="grid gap-2">
                                <Label>{m.automations_target()}</Label>
                                <Select value={field.state.value} onValueChange={field.handleChange}>
                                    <SelectTrigger className="w-full rounded-full" aria-label={m.automations_target()}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ANY}>{m.automations_target_any()}</SelectItem>
                                        <SelectItem value={TAGS}>{m.automations_target_tags()}</SelectItem>
                                        {printers.map((p) => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </form.Field>
                    <form.Subscribe selector={(s) => s.values.target}>
                        {(target) =>
                            target === TAGS ? (
                                <form.Field name="tagsText">
                                    {(field) => (
                                        <div className="grid gap-2">
                                            <Label htmlFor="rule-tags">{m.automations_tags()}</Label>
                                            <Input
                                                id="rule-tags"
                                                value={field.state.value}
                                                onBlur={field.handleBlur}
                                                onChange={(e) => field.handleChange(e.target.value)}
                                                aria-invalid={fieldInvalid(field.state.meta)}
                                                className="rounded-full px-4"
                                                placeholder="farm, pla"
                                            />
                                            <FieldError meta={field.state.meta} />
                                        </div>
                                    )}
                                </form.Field>
                            ) : null
                        }
                    </form.Subscribe>
                </div>
                <form.Field name="actions" mode="array">
                    {(field) => (
                        <div className="grid gap-2">
                            <Label>{m.automations_actions()}</Label>
                            {field.state.value.map((action, i) => (
                                <div
                                    key={`a-${String(i)}`}
                                    className="flex flex-wrap items-center gap-2 rounded-2xl bg-secondary/60 p-2"
                                >
                                    <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
                                    <Select
                                        value={action.type}
                                        onValueChange={(v) =>
                                            field.replaceValue(i, defaultAction(v as AutomationActionType, macros))
                                        }
                                    >
                                        <SelectTrigger
                                            className="w-44 rounded-full"
                                            aria-label={`${m.automations_actions()} ${i + 1}`}
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {AUTOMATION_ACTION_TYPES.map((t) => (
                                                <SelectItem key={t} value={t}>
                                                    {ACTION_LABEL[t]()}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <ActionParams
                                        action={action}
                                        macros={macros}
                                        onChange={(a) => field.replaceValue(i, a)}
                                    />
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
                                    {action.type === 'power' && (
                                        <p className="basis-full px-8 text-xs text-muted-foreground">
                                            {m.automations_power_hint()}
                                        </p>
                                    )}
                                </div>
                            ))}
                            <FieldError meta={field.state.meta} />
                            <div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="rounded-full"
                                    disabled={field.state.value.length >= 10}
                                    onClick={() => field.pushValue(defaultAction('notify'))}
                                >
                                    <Plus /> {m.macros_add_action()}
                                </Button>
                            </div>
                        </div>
                    )}
                </form.Field>
            </div>
            <DialogFooter className="gap-2">
                <Button type="button" variant="ghost" className="rounded-full" onClick={close}>
                    {m.common_cancel()}
                </Button>
                <Button type="submit" className="rounded-full px-5" disabled={save.isPending}>
                    {m.common_save()}
                </Button>
            </DialogFooter>
        </form>
    );
}

function ActionParams({
    action,
    macros,
    onChange,
}: {
    action: AutomationAction;
    macros: MacroDto[];
    onChange: (a: AutomationAction) => void;
}) {
    switch (action.type) {
        case 'macro':
            return macros.length ? (
                <Select value={action.macroId} onValueChange={(macroId) => onChange({ ...action, macroId })}>
                    <SelectTrigger className="h-8 w-44 rounded-full" aria-label={m.automations_action_macro()}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {macros.map((x) => (
                            <SelectItem key={x.id} value={x.id}>
                                {x.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : (
                <span className="text-xs text-muted-foreground">{m.automations_no_macro()}</span>
            );
        case 'light':
            return (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {action.on ? m.macro_on() : m.macro_off()}
                    <Switch
                        checked={action.on}
                        onCheckedChange={(on) => onChange({ ...action, on })}
                        aria-label={m.automations_action_light()}
                    />
                </span>
            );
        case 'feed':
            return (
                <>
                    <Num
                        label={m.settings_slot_n({ n: '' }).trim()}
                        value={action.slotIndex + 1}
                        min={1}
                        max={20}
                        onChange={(v) => onChange({ ...action, slotIndex: Math.max(0, v - 1) })}
                    />
                    <Select
                        value={action.direction}
                        onValueChange={(v) => onChange({ ...action, direction: v as 'in' | 'out' })}
                    >
                        <SelectTrigger className="h-8 w-32 rounded-full" aria-label={m.automations_action_feed()}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="in">{m.slot_load()}</SelectItem>
                            <SelectItem value="out">{m.slot_unload()}</SelectItem>
                        </SelectContent>
                    </Select>
                </>
            );
        case 'power':
            return (
                <Select value={action.action} onValueChange={(v) => onChange({ ...action, action: v as 'on' | 'off' })}>
                    <SelectTrigger className="h-8 w-32 rounded-full" aria-label={m.automations_action_power()}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="on">{m.automations_power_on()}</SelectItem>
                        <SelectItem value="off">{m.automations_power_off()}</SelectItem>
                    </SelectContent>
                </Select>
            );
        case 'notify':
            return (
                <Input
                    aria-label={m.automations_message()}
                    placeholder={m.automations_message()}
                    value={action.message}
                    maxLength={200}
                    onChange={(e) => onChange({ ...action, message: e.target.value })}
                    className="h-8 min-w-40 flex-1 rounded-full"
                />
            );
        case 'wait':
            return (
                <Num
                    label={m.automations_seconds()}
                    value={action.seconds}
                    min={1}
                    max={3600}
                    onChange={(seconds) => onChange({ ...action, seconds })}
                />
            );
    }
}

function Num({
    value,
    onChange,
    label,
    min,
    max,
}: {
    value: number;
    onChange: (v: number) => void;
    label: string;
    min: number;
    max: number;
}) {
    return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {label}
            <Input
                aria-label={label}
                type="number"
                min={min}
                max={max}
                value={Number.isNaN(value) ? '' : value}
                onChange={(e) => onChange(e.target.valueAsNumber || min)}
                className="h-8 w-20 rounded-full text-center text-foreground"
            />
        </span>
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

export function targetSummary(
    rule: Pick<AutomationRuleDto, 'printerId' | 'targetTags'>,
    printers: Pick<Printer, 'id' | 'name'>[],
): string {
    if (rule.printerId) return printers.find((p) => p.id === rule.printerId)?.name ?? rule.printerId;
    if (rule.targetTags.length) return `${m.automations_target_tags()} ${rule.targetTags.join(', ')}`;
    return m.automations_target_any();
}

export function targetedPrinters<P extends { id: string; settings: { profile: { tags: string[] } } }>(
    rule: Pick<AutomationRuleDto, 'printerId' | 'targetTags'>,
    printers: P[],
): P[] {
    return printers.filter((p) =>
        rule.printerId ? p.id === rule.printerId : rule.targetTags.every((t) => p.settings.profile.tags.includes(t)),
    );
}
