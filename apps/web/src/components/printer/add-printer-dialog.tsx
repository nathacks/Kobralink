import { addPrinterFormSchema } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { useConfirmationDialogStore } from '@/stores/confirmation-dialog';

export function AddPrinterDialog({ compact = false }: { compact?: boolean }) {
    const openDialog = useConfirmationDialogStore((s) => s.openDialog);
    return (
        <Button
            className="rounded-full px-5"
            size={compact ? 'default' : 'lg'}
            onClick={() =>
                openDialog({
                    title: m.add_printer(),
                    description: m.add_printer_hint(),
                    content: <AddPrinterForm />,
                })
            }
        >
            <Plus /> {m.add_printer()}
        </Button>
    );
}

function AddPrinterForm() {
    const qc = useQueryClient();
    const closeDialog = useConfirmationDialogStore((s) => s.closeDialog);

    const add = useMutation({
        mutationFn: (input: { ip: string; name: string }) =>
            api.printers.add({ ip: input.ip.trim(), name: input.name.trim() || undefined }),
        onSuccess: (p) => {
            toast.success(m.add_printer_added({ name: p.name, port: p.httpPort }));
            closeDialog();
            void qc.invalidateQueries({ queryKey: ['printers'] });
        },
        onError: (e) => toast.error(e.message),
    });

    const form = useForm({
        defaultValues: { ip: '', name: '' },
        validators: { onSubmit: addPrinterFormSchema },
        onSubmit: ({ value }) => add.mutateAsync(value).catch(() => undefined),
    });

    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <div className="grid gap-4 py-4">
                <form.Field name="ip">
                    {(field) => (
                        <div className="grid gap-2">
                            <Label htmlFor={field.name}>{m.field_ip()}</Label>
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
                            <Label htmlFor="pname">{m.add_printer_name_optional()}</Label>
                            <Input
                                id="pname"
                                name={field.name}
                                placeholder={m.add_printer_name_placeholder()}
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
                            {isSubmitting ? m.add_printer_connecting() : m.add_printer_submit()}
                        </Button>
                    )}
                </form.Subscribe>
            </DialogFooter>
        </form>
    );
}
