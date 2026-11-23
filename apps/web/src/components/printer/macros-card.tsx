import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus, Settings2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState, Panel } from '@/components/printer/panel';
import { MacrosEditor, openMacroForm } from '@/components/settings/macros-editor';
import { Button } from '@/components/ui/button';
import { usePinnedPrinter } from '@/hooks/use-pinned-printer';
import { useLiveState } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { macrosQuery } from '@/lib/queries';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { MACRO_ICON } from './macro-icon';

const manageClass = 'flex size-9 items-center justify-center rounded-full bg-secondary hover:bg-accent [&_svg]:size-4';

export function MacrosCard({ printerId, className }: { printerId: string; className?: string }) {
    const state = useLiveState(printerId);
    const pinned = usePinnedPrinter();
    const qc = useQueryClient();
    const macros = useQuery(macrosQuery);
    const run = useMutation({
        mutationFn: (macroId: string) => api.macros.run(printerId, macroId),
        onSuccess: (_, id) => toast.success(m.macros_done({ name: macros.data?.find((x) => x.id === id)?.name ?? '' })),
        onError: (e) => toast.error(e.message),
    });
    const list = macros.data ?? [];
    const invalidate = () => qc.invalidateQueries({ queryKey: ['macros'] });
    const openManager = () =>
        confirmationDialogStore.actions.openDialog({
            title: m.macros_title(),
            description: m.macros_hint(),
            props: { className: 'rounded-3xl sm:max-w-2xl' },
            content: <MacrosEditor embedded />,
        });
    return (
        <Panel
            className={className}
            title={m.macros_title()}
            action={
                pinned ? (
                    <button
                        type="button"
                        title={m.macros_manage()}
                        aria-label={m.macros_manage()}
                        className={manageClass}
                        onClick={openManager}
                    >
                        <Settings2 />
                    </button>
                ) : (
                    <Link
                        to="/settings/macros"
                        title={m.macros_manage()}
                        aria-label={m.macros_manage()}
                        className={manageClass}
                    >
                        <Settings2 />
                    </Link>
                )
            }
        >
            <div>
                {list.length === 0 ? (
                    pinned ? (
                        <div className="flex flex-col gap-3">
                            <EmptyState icon={<Zap />}>{m.macros_empty_pinned()}</EmptyState>
                            <Button
                                type="button"
                                className="h-9 self-start rounded-full"
                                onClick={() => openMacroForm(undefined, invalidate)}
                            >
                                <Plus /> {m.macros_add()}
                            </Button>
                        </div>
                    ) : (
                        <EmptyState icon={<Zap />}>{m.macros_empty()}</EmptyState>
                    )
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
                        {list.map((macro) => {
                            const Icon = MACRO_ICON[macro.icon] ?? Zap;
                            return (
                                <button
                                    key={macro.id}
                                    type="button"
                                    disabled={!state.connected || run.isPending}
                                    onClick={() => run.mutate(macro.id)}
                                    className="flex flex-col items-center gap-2 rounded-2xl bg-secondary/60 px-3 py-4 text-sm font-medium transition-colors enabled:hover:bg-primary enabled:hover:text-primary-foreground disabled:opacity-50"
                                >
                                    <Icon className="size-5" />
                                    <span className="w-full truncate text-center">{macro.name}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </Panel>
    );
}
