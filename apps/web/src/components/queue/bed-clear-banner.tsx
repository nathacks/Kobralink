import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ThumbsDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { secondsLeft } from './auto-start-countdown';

export function BedClearBanner({ printerId, name }: { printerId: string; name?: string }) {
    const qc = useQueryClient();
    const confirm = useMutation({
        mutationFn: (outcome: 'good' | 'bad') => api.queue.bedClear(printerId, outcome),
        onSuccess: ({ started, startsAt }) => {
            if (started) toast.success(m.files_print_started({ name: started.filename }));
            else if (startsAt) toast.info(m.queue_starts_in({ seconds: secondsLeft(startsAt) }));
            void qc.invalidateQueries({ queryKey: ['printers', printerId] });
            void qc.invalidateQueries({ queryKey: ['printers'] });
            void qc.invalidateQueries({ queryKey: ['queue'] });
            void qc.invalidateQueries({ queryKey: ['history'] });
        },
        onError: (e: Error) => toast.error(e.message),
    });
    return (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl bg-chart-2/15 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
                <div className="font-medium">{name ? `${name} · ${m.queue_bed_waiting()}` : m.queue_bed_waiting()}</div>
                <div className="text-xs text-muted-foreground">{m.queue_bed_waiting_hint()}</div>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button
                    size="sm"
                    variant="secondary"
                    className="rounded-full"
                    title={m.queue_bed_bad_hint()}
                    disabled={confirm.isPending}
                    onClick={() => confirm.mutate('bad')}
                >
                    <ThumbsDown className="size-3.5" /> {m.queue_bed_bad()}
                </Button>
                <Button
                    size="sm"
                    className="rounded-full"
                    disabled={confirm.isPending}
                    onClick={() => confirm.mutate('good')}
                >
                    <Check className="size-3.5" /> {m.queue_bed_good()}
                </Button>
            </div>
        </div>
    );
}
