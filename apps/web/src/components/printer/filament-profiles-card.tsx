import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
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
                    ? `${r.added} profil${r.added > 1 ? 's' : ''} importé${r.added > 1 ? 's' : ''}${r.skipped ? ` (${r.skipped} ignoré${r.skipped > 1 ? 's' : ''})` : ''}`
                    : 'Aucun profil filament reconnu dans les fichiers',
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
                <CardTitle>Profils filament OrcaSlicer</CardTitle>
                <CardDescription>
                    Importez vos profils personnalisés (ZIP ou fichiers .json du dossier{' '}
                    <code className="rounded bg-secondary px-1">OrcaSlicer/user/&lt;id&gt;/filament/</code>). Ils
                    apparaissent dans le choix de profil par slot, marqués ★, et servent au matching RFID.
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
                    {importMut.isPending ? 'Import en cours…' : 'Déposer un ZIP ou des .json, ou cliquer pour choisir'}
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
                                    title="Supprimer ce profil"
                                >
                                    <Trash2 />
                                </Button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">Aucun profil personnalisé importé.</p>
                )}
            </CardContent>
        </Card>
    );
}
