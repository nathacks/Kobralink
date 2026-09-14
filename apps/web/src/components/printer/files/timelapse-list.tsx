import type { TimelapseDto } from '@kobralink/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Film, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/format';
import { m } from '@/lib/i18n';
import { timelapsesQuery } from '@/lib/queries';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { IconButton } from './icon-button';

export function TimelapseList({ printerId }: { printerId: string }) {
    const qc = useQueryClient();
    const list = useQuery(timelapsesQuery(printerId));
    const remove = useMutation({
        mutationFn: api.timelapses.remove,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['timelapses'] }),
        onError: (e) => toast.error(e.message),
    });
    const items = list.data ?? [];
    if (!items.length) {
        return (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <Film className="size-6" />
                {m.timelapse_empty()}
            </div>
        );
    }
    const play = (t: TimelapseDto) =>
        confirmationDialogStore.actions.openDialog({
            title: t.filename,
            description: m.timelapse_meta({
                frames: t.frames,
                duration: t.durationSec.toFixed(1),
                date: formatDate(t.createdAt),
            }),
            props: { className: 'rounded-3xl sm:max-w-3xl' },
            content: (
                <video
                    src={api.timelapses.videoUrl(t.id)}
                    controls
                    autoPlay
                    loop
                    className="w-full rounded-2xl bg-black"
                >
                    <track kind="captions" />
                </video>
            ),
        });
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
            {items.map((t) => (
                <div key={t.id} className="group flex flex-col overflow-hidden rounded-3xl bg-secondary">
                    <button
                        type="button"
                        disabled={t.status !== 'ready'}
                        onClick={() => play(t)}
                        className="relative aspect-video w-full bg-background/40"
                    >
                        {t.status === 'ready' || t.status === 'rendering' ? (
                            <img src={api.timelapses.posterUrl(t.id)} alt="" className="size-full object-cover" />
                        ) : null}
                        <span className="absolute inset-0 flex items-center justify-center">
                            {t.status === 'ready' ? (
                                <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-90 [&_svg]:size-4">
                                    <Play />
                                </span>
                            ) : (
                                <span className="rounded-full bg-background/70 px-3 py-1 text-xs">
                                    {t.status === 'recording'
                                        ? m.timelapse_recording({ frames: t.frames })
                                        : t.status === 'rendering'
                                          ? m.timelapse_rendering()
                                          : m.timelapse_error()}
                                </span>
                            )}
                        </span>
                    </button>
                    <div className="flex items-center gap-2 p-3">
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium" title={t.filename}>
                                {t.filename}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {formatDate(t.createdAt)}
                                {t.sizeBytes ? ` · ${formatBytes(t.sizeBytes)}` : ''}
                            </div>
                        </div>
                        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            {t.status === 'ready' && (
                                <IconButton title={m.common_download()} asChild>
                                    <a href={api.timelapses.videoUrl(t.id)} download={`${t.filename}.mp4`}>
                                        <Download />
                                    </a>
                                </IconButton>
                            )}
                            <IconButton
                                title={m.common_delete()}
                                onClick={() =>
                                    alertConfirmationDialogStore.actions.openAlertDialog({
                                        title: m.timelapse_delete_title(),
                                        description: t.filename,
                                        actionLabel: m.common_delete(),
                                        onAction: () => remove.mutateAsync(t.id),
                                    })
                                }
                            >
                                <Trash2 />
                            </IconButton>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
