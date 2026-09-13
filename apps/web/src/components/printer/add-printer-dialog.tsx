import { addPrinterSchema } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

const formSchema = z.object({
    ip: addPrinterSchema.shape.ip,
    name: z.string().trim().max(64, '64 caractères maximum'),
});

export function AddPrinterDialog({ compact = false }: { compact?: boolean }) {
    const qc = useQueryClient();
    const [open, setOpen] = useState(false);

    const add = useMutation({
        mutationFn: (input: { ip: string; name: string }) =>
            api.printers.add({ ip: input.ip.trim(), name: input.name.trim() || undefined }),
        onSuccess: (p) => {
            toast.success(`${p.name} ajoutée (Moonraker sur le port ${p.httpPort})`);
            setOpen(false);
            form.reset();
            void qc.invalidateQueries({ queryKey: ['printers'] });
        },
        onError: (e) => toast.error(e.message),
    });

    const form = useForm({
        defaultValues: { ip: '', name: '' },
        validators: { onSubmit: formSchema },
        onSubmit: ({ value }) => add.mutateAsync(value).catch(() => undefined),
    });

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                setOpen(v);
                if (!v) form.reset();
            }}
        >
            <DialogTrigger asChild>
                <Button className="rounded-full px-5" size={compact ? 'default' : 'lg'}>
                    <Plus /> Ajouter une imprimante
                </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
                <form
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        void form.handleSubmit();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Ajouter une imprimante</DialogTitle>
                        <DialogDescription>
                            Entrez uniquement l'adresse IP (sans port). Le nom d'utilisateur, le mot de passe et
                            l'identifiant sont lus directement sur l'imprimante.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <form.Field name="ip">
                            {(field) => (
                                <div className="grid gap-2">
                                    <Label htmlFor={field.name}>Adresse IP</Label>
                                    <Input
                                        id={field.name}
                                        name={field.name}
                                        placeholder="192.168.1.42"
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.value)}
                                        aria-invalid={fieldInvalid(field.state.meta)}
                                        autoFocus
                                        className="rounded-full px-4"
                                    />
                                    <FieldError meta={field.state.meta} />
                                </div>
                            )}
                        </form.Field>
                        <form.Field name="name">
                            {(field) => (
                                <div className="grid gap-2">
                                    <Label htmlFor="pname">Nom (optionnel)</Label>
                                    <Input
                                        id="pname"
                                        name={field.name}
                                        placeholder="Kobra X atelier"
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
                    </div>
                    <DialogFooter>
                        <form.Subscribe selector={(s) => s.isSubmitting}>
                            {(isSubmitting) => (
                                <Button type="submit" className="rounded-full px-5" disabled={isSubmitting}>
                                    {isSubmitting ? 'Connexion à l’imprimante…' : 'Ajouter'}
                                </Button>
                            )}
                        </form.Subscribe>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
