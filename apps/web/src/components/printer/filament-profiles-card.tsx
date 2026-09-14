import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { userProfilesQuery } from '@/lib/queries';

export function FilamentProfilesCard() {
    const qc = useQueryClient();
    const user = useQuery(userProfilesQuery);
    const fileRef = useRef<HTMLInputElement>(null);
    const invalidate = () => qc.invalidateQueries({ queryKey: ['filament'] });
    const onError = (e: Error) => toast.error(e.message);

    const importMut = useMutation({
        mutationFn: (files: File[]) => api.filament.importProfiles(files),
        onSuccess: (r) => {
            toast.success(
                r.added
                    ? `${m.profiles_imported({ added: r.added })}${r.skipped ? ` ${m.profiles_skipped({ skipped: r.skipped })}` : ''}`
                    : m.profiles_none_recognized(),
            );
            void invalidate();
        },
        onError,
    });
    const remove = useMutation({
        mutationFn: (p: { vendor: string; name: string }) => api.filament.deleteUserProfile(p.vendor, p.name),
        onSuccess: () => void invalidate(),
        onError,
    });

    const pick = (list: FileList | null) => {
        const files = Array.from(list ?? []).filter((f) => /\.(zip|json)$/i.test(f.name));
        if (files.length) importMut.mutate(files);
        if (fileRef.current) fileRef.current.value = '';
    };

    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle>{m.profiles_title()}</CardTitle>
                <CardDescription>
                    {m.profiles_hint_before()}{' '}
                    <code className="rounded bg-secondary px-1">OrcaSlicer/user/&lt;id&gt;/filament/</code>
                    {m.profiles_hint_after()}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <button
                    type="button"
                    className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-muted-foreground/30 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                    disabled={importMut.isPending}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        pick(e.dataTransfer.files);
                    }}
                >
                    <Upload className="size-5" />
                    {importMut.isPending ? m.profiles_importing() : m.profiles_drop()}
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".zip,.json,application/zip,application/json"
                    multiple
                    hidden
                    onChange={(e) => pick(e.target.files)}
                />

                {user.data && user.data.length > 0 ? (
                    <ul className="divide-y">
                        {user.data.map((p) => (
                            <li key={`${p.vendor}|${p.name}`} className="flex items-center gap-3 py-2 text-sm">
                                <span className="w-16 shrink-0 rounded-full bg-secondary px-2 py-0.5 text-center text-xs font-medium">
                                    {p.type || '—'}
                                </span>
                                <span className="min-w-0 flex-1 truncate">
                                    <span className="text-muted-foreground">{p.vendor}</span> · {p.name}
                                </span>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="rounded-full"
                                    disabled={remove.isPending}
                                    onClick={() => remove.mutate({ vendor: p.vendor, name: p.name })}
                                    title={m.profiles_delete()}
                                >
                                    <Trash2 />
                                </Button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">{m.profiles_empty()}</p>
                )}
            </CardContent>
        </Card>
    );
}
