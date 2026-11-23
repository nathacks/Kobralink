import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { shallow, useSelector } from '@tanstack/react-store';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { PrintReadyForm } from '@/components/printer/files/print-ready-form';
import { api } from '@/lib/api';
import { parseFilename } from '@/lib/filename';
import { formatDate } from '@/lib/format';
import { m } from '@/lib/i18n';
import { filesQuery } from '@/lib/queries';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { type PrintersState, printersStore } from '@/stores/printers';

const DISMISSED_KEY = 'kobralink:print-ready-dismissed';

function readDismissed(): string {
    try {
        return sessionStorage.getItem(DISMISSED_KEY) ?? '';
    } catch {
        return '';
    }
}

function writeDismissed(key: string) {
    try {
        sessionStorage.setItem(DISMISSED_KEY, key);
    } catch {}
}

export async function openPrintReadyDialog(qc: QueryClient, printerId: string, filename: string): Promise<boolean> {
    const files = await qc.fetchQuery({ ...filesQuery(printerId), staleTime: 0 });
    const file = files.find((f) => f.filename === filename);
    if (!file) return false;
    const invalidate = () => {
        void qc.invalidateQueries({ queryKey: ['printers', printerId, 'files'] });
        void qc.invalidateQueries({ queryKey: ['printers', printerId, 'history'] });
    };
    confirmationDialogStore.actions.openDialog({
        title: m.files_print_title({ name: parseFilename(file.filename).name }),
        props: { className: 'sm:max-w-5xl' },
        description: m.print_ready_hint(),
        content: (
            <PrintReadyForm
                printerId={printerId}
                file={file}
                onPrint={(r) =>
                    api.files
                        .print(printerId, { fileId: file.id, ...r })
                        .then((f) => {
                            toast.success(m.files_print_started({ name: f.filename }));
                            invalidate();
                        })
                        .catch((e: Error) => {
                            toast.error(e.message);
                            throw e;
                        })
                }
                onQueue={(r, target) =>
                    api.queue
                        .add({ fileId: file.id, ...r, ...target })
                        .then((item) => {
                            toast.success(m.queue_added({ name: item.filename }));
                            void api.control.clearFileReady(printerId);
                            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'queue'] });
                            void qc.invalidateQueries({ queryKey: ['queue'] });
                        })
                        .catch((e: Error) => toast.error(e.message))
                }
                onSchedule={(r, startAt) =>
                    api.schedule
                        .create(printerId, { fileId: file.id, startAt, ...r })
                        .then((item) => {
                            toast.success(m.schedule_added({ name: item.filename, date: formatDate(item.startAt) }));
                            void api.control.clearFileReady(printerId);
                            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'schedule'] });
                        })
                        .catch((e: Error) => {
                            toast.error(e.message);
                            throw e;
                        })
                }
            />
        ),
    });
    return true;
}

export function pendingFileReady(
    s: Pick<PrintersState, 'order' | 'printers'>,
): { printerId: string; filename: string; ts: number } | null {
    for (const id of s.order) {
        const p = s.printers[id];
        const live = p?.live;
        if (!live?.fileReady || !p.settings.printStartDialog) continue;
        return { printerId: id, filename: live.fileReady, ts: live.fileReadyTs };
    }
    return null;
}

export function PrintReadyWatcher() {
    const qc = useQueryClient();
    const ready = useSelector(printersStore, pendingFileReady, { compare: shallow });
    const dialogOpen = useSelector(confirmationDialogStore, (s) => s.isOpen);
    const opened = useRef<string | null>(null);

    useEffect(() => {
        if (!ready || dialogOpen) return;
        const key = `${ready.printerId}|${ready.filename}|${ready.ts}`;
        if (opened.current === key || readDismissed() === key) return;
        opened.current = key;
        openPrintReadyDialog(qc, ready.printerId, ready.filename)
            .then((shown) => {
                if (!shown) opened.current = null;
            })
            .catch(() => {
                opened.current = null;
            });
    }, [ready, dialogOpen, qc]);

    useEffect(() => {
        if (dialogOpen || !opened.current) return;
        writeDismissed(opened.current);
    }, [dialogOpen]);

    return null;
}
