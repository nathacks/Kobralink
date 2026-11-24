import type { AutomationRuleDto, MacroDto, Printer } from '@kobralink/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Play, Plus, Trash2, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import {
    ACTION_LABEL,
    describeAction,
    openRuleForm,
    TRIGGER_LABEL,
    targetedPrinters,
    targetSummary,
} from '@/components/automations/rule-form';
import { EmptyState } from '@/components/printer/panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { usePrinterList } from '@/hooks/use-printers';
import { useCanOperate } from '@/hooks/use-role';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { m } from '@/lib/i18n';
import { automationsQuery, macrosQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { PageHeader } from './page-header';

export function AutomationsPage() {
    const qc = useQueryClient();
    const rules = useQuery(automationsQuery);
    const macros = useQuery(macrosQuery).data ?? [];
    const printers = usePrinterList();
    const canOperate = useCanOperate();
    const invalidate = () => void qc.invalidateQueries({ queryKey: ['automations'] });
    const toggle = useMutation({
        mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.automations.setEnabled(id, enabled),
        onSuccess: invalidate,
    });
    const remove = useMutation({
        mutationFn: (id: string) => api.automations.remove(id),
        onSuccess: invalidate,
    });
    const run = useMutation({
        mutationFn: ({ rule, printer }: { rule: AutomationRuleDto; printer: Printer }) =>
            api.automations.run(rule.id, printer.id),
        onSuccess: (done, { printer }) => {
            if (done.lastError) toast.error(m.automations_last_error({ error: done.lastError }));
            else toast.success(m.automations_ran({ printer: printer.name }));
            invalidate();
        },
    });
    const list = rules.data ?? [];

    return (
        <div className="grid gap-4">
            <PageHeader title={m.nav_automations()} hint={m.automations_page_hint()}>
                {canOperate && (
                    <Button className="rounded-full" onClick={() => openRuleForm(undefined, invalidate)}>
                        <Plus /> {m.automations_add()}
                    </Button>
                )}
            </PageHeader>
            {rules.isSuccess && list.length === 0 ? (
                <Card className="rounded-3xl border-0 shadow-none">
                    <CardContent>
                        <EmptyState icon={<Workflow />}>{m.automations_empty()}</EmptyState>
                    </CardContent>
                </Card>
            ) : (
                <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {list.map((rule) => (
                        <RuleCard
                            key={rule.id}
                            rule={rule}
                            macros={macros}
                            printers={printers}
                            canOperate={canOperate}
                            onToggle={(enabled) => toggle.mutate({ id: rule.id, enabled })}
                            onEdit={() => openRuleForm(rule, invalidate)}
                            onRun={(printer) => run.mutate({ rule, printer })}
                            onRemove={() =>
                                alertConfirmationDialogStore.actions.openAlertDialog({
                                    title: m.automations_delete_title({ name: rule.name }),
                                    actionLabel: m.common_delete(),
                                    onAction: () => remove.mutateAsync(rule.id),
                                })
                            }
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}

export function RuleCard({
    rule,
    macros,
    printers,
    canOperate,
    onToggle,
    onEdit,
    onRun,
    onRemove,
}: {
    rule: AutomationRuleDto;
    macros: MacroDto[];
    printers: Printer[];
    canOperate: boolean;
    onToggle: (enabled: boolean) => void;
    onEdit: () => void;
    onRun: (printer: Printer) => void;
    onRemove: () => void;
}) {
    const targets = targetedPrinters(rule, printers);
    const when = rule.trigger === 'time' ? `${TRIGGER_LABEL.time()} ${rule.time}` : TRIGGER_LABEL[rule.trigger]();
    return (
        <li className="min-w-0">
            <Card className={cn('h-full rounded-3xl border-0 shadow-none', !rule.enabled && 'opacity-60')}>
                <CardContent className="grid gap-3">
                    <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                            <h3 className="truncate font-medium">{rule.name}</h3>
                            <p className="text-sm text-muted-foreground">
                                {when} · {targetSummary(rule, printers)}
                            </p>
                        </div>
                        <Switch
                            checked={rule.enabled}
                            disabled={!canOperate}
                            onCheckedChange={onToggle}
                            aria-label={m.automations_enabled()}
                        />
                    </div>
                    <ol className="grid grid-cols-1 gap-1 text-sm">
                        {rule.actions.map((a, i) => (
                            <li
                                key={`${a.type}-${String(i)}`}
                                className="flex min-w-0 gap-2 rounded-2xl bg-secondary/60 px-3 py-1.5"
                            >
                                <span className="tabular-nums text-muted-foreground">{i + 1}</span>
                                <span className="font-medium">{ACTION_LABEL[a.type]()}</span>
                                <span className="min-w-0 truncate text-muted-foreground">
                                    {describeAction(a, macros)}
                                </span>
                            </li>
                        ))}
                    </ol>
                    <div className="flex flex-wrap items-center gap-2">
                        <p
                            className={cn(
                                'min-w-0 flex-1 truncate text-xs',
                                rule.lastError ? 'text-destructive' : 'text-muted-foreground',
                            )}
                            title={rule.lastError || undefined}
                        >
                            {rule.lastError
                                ? m.automations_last_error({ error: rule.lastError })
                                : rule.lastRunAt
                                  ? m.automations_last_run({ date: formatDate(rule.lastRunAt) })
                                  : m.automations_never()}
                        </p>
                        {canOperate && (
                            <div className="flex gap-1">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="rounded-full"
                                            disabled={targets.length === 0}
                                        >
                                            <Play /> {m.automations_run()}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="rounded-2xl">
                                        {targets.map((p) => (
                                            <DropdownMenuItem
                                                key={p.id}
                                                className="rounded-xl"
                                                onSelect={() => onRun(p)}
                                            >
                                                {p.name}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="rounded-full"
                                    title={m.automations_edit()}
                                    aria-label={m.automations_edit()}
                                    onClick={onEdit}
                                >
                                    <Pencil />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="rounded-full"
                                    title={m.common_delete()}
                                    aria-label={m.common_delete()}
                                    onClick={onRemove}
                                >
                                    <Trash2 />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </li>
    );
}
