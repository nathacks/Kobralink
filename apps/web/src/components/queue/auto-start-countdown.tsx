import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';

export function secondsLeft(startsAt: string, now = Date.now()): number {
    return Math.max(0, Math.ceil((Date.parse(startsAt) - now) / 1000));
}

export function AutoStartCountdown({
    printerId,
    startsAt,
    name,
}: {
    printerId: string;
    startsAt: string;
    name?: string;
}) {
    const qc = useQueryClient();
    const [now, setNow] = useState(() => Date.now());
    const left = secondsLeft(startsAt, now);
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
    useEffect(() => {
        if (left > 0) return;
        const timer = setTimeout(() => {
            void qc.invalidateQueries({ queryKey: ['printers'] });
            void qc.invalidateQueries({ queryKey: ['queue'] });
        }, 1500);
        return () => clearTimeout(timer);
    }, [left, qc]);
    const cancel = useMutation({
        mutationFn: () => api.queue.cancelAutoStart(printerId),
        onSuccess: (status) => qc.setQueryData(['printers', printerId, 'queue-status'], status),
        onError: (e: Error) => toast.error(e.message),
    });
    const text = m.queue_starts_in({ seconds: left });
    return (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl bg-primary/15 px-4 py-3 text-sm">
            <Timer className="size-4 shrink-0 text-primary-strong" />
            <span className="min-w-0 flex-1 font-medium tabular-nums">{name ? `${name} · ${text}` : text}</span>
            <Button
                size="sm"
                variant="secondary"
                className="rounded-full"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
            >
                {m.queue_cancel_start()}
            </Button>
        </div>
    );
}
