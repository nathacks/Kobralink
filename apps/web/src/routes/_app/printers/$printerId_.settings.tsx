import { ipv4, printerSettingsSchema } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, type PrinterWithLive } from '@/lib/api';
import { printerQuery } from '@/lib/queries';

const SLOT_CHOICES = [0, 1, 2, 3, 4, 5, 6, 7];

const settingsFormSchema = z.object({
    name: z.string().trim().min(1, 'Nom requis').max(64, '64 caractères maximum'),
    ip: ipv4,
    httpPort: z.number({ error: 'Port invalide' }).int().min(1024, 'Minimum 1024').max(65535, 'Maximum 65535'),
    settings: printerSettingsSchema.required().extend({
        pollIntervalSec: z.number({ error: 'Valeur invalide' }).int().min(1, 'Minimum 1 s').max(60, 'Maximum 60 s'),
    }),
});
type SettingsValues = z.infer<typeof settingsFormSchema>;

export const Route = createFileRoute('/_app/printers/$printerId_/settings')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(printerQuery(params.printerId)),
    component: PrinterSettings,
});

function PrinterSettings() {
    const { printerId } = Route.useParams();
    const qc = useQueryClient();
    const navigate = useNavigate();
    const { data: printer } = useQuery(printerQuery(printerId));
    if (!printer) return null;
    return (
        <SettingsForm
            key={printer.id}
            printer={printer}
            onSaved={() => qc.invalidateQueries({ queryKey: ['printers'] })}
            onDeleted={() => navigate({ to: '/printers' })}
        />
    );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <div>
                <Label>{label}</Label>
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
            {children}
        </div>
    );
}

function SettingsForm({
    printer,
    onSaved,
    onDeleted,
}: {
    printer: PrinterWithLive;
    onSaved: () => void;
    onDeleted: () => void;
}) {
    const save = useMutation({
        mutationFn: (value: SettingsValues) =>
            api.printers.update(printer.id, {
                name: value.name.trim(),
                ip: value.ip.trim(),
                httpPort: value.httpPort,
                settings: value.settings,
            }),
        onSuccess: () => {
            toast.success('Réglages enregistrés');
            onSaved();
        },
        onError: (e) => toast.error(e.message),
    });
    const refresh = useMutation({
        mutationFn: () => api.printers.refreshCredentials(printer.id),
        onSuccess: () => {
            toast.success("Identifiants rafraîchis depuis l'imprimante");
            onSaved();
        },
        onError: (e) => toast.error(e.message),
    });
    const remove = useMutation({
        mutationFn: () => api.printers.remove(printer.id),
        onSuccess: () => {
            toast.success('Imprimante supprimée');
            onSaved();
            onDeleted();
        },
        onError: (e) => toast.error(e.message),
    });

    const form = useForm({
        defaultValues: {
            name: printer.name,
            ip: printer.ip,
            httpPort: printer.httpPort,
            settings: printer.settings,
        } as z.input<typeof settingsFormSchema>,
        validators: { onSubmit: settingsFormSchema },
        onSubmit: ({ value }) => save.mutateAsync(value).catch(() => undefined),
    });

    return (
        <form
            className="max-w-2xl space-y-4"
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <h2 className="px-2 text-xl font-medium">Réglages · {printer.name}</h2>

            <Card className="rounded-3xl border-0 shadow-none">
                <CardHeader>
                    <CardTitle>Connexion</CardTitle>
                    <CardDescription>
                        Identifiant {printer.deviceId.slice(0, 8)}… · utilisateur {printer.username} · modèle{' '}
                        {printer.model}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <form.Field name="name">
                        {(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor={field.name}>Nom</Label>
                                <Input
                                    id={field.name}
                                    name={field.name}
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
                    <div className="grid gap-4 sm:grid-cols-2">
                        <form.Field name="ip">
                            {(field) => (
                                <div className="grid gap-2">
                                    <Label htmlFor={field.name}>Adresse IP</Label>
                                    <Input
                                        id={field.name}
                                        name={field.name}
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
                        <form.Field name="httpPort">
                            {(field) => (
                                <div className="grid gap-2">
                                    <Label htmlFor={field.name}>Port Moonraker</Label>
                                    <Input
                                        id={field.name}
                                        name={field.name}
                                        className="rounded-full px-4"
                                        type="number"
                                        min={1024}
                                        max={65535}
                                        value={Number.isNaN(field.state.value) ? '' : field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                        aria-invalid={fieldInvalid(field.state.meta)}
                                    />
                                    <FieldError meta={field.state.meta} />
                                </div>
                            )}
                        </form.Field>
                    </div>
                    <div>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="rounded-full"
                            onClick={() => refresh.mutate()}
                            disabled={refresh.isPending}
                        >
                            Rafraîchir les identifiants
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-none">
                <CardHeader>
                    <CardTitle>Impression</CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                    <form.Field name="settings.autoLeveling">
                        {(field) => (
                            <Row label="Auto-nivellement" hint="Avant chaque impression">
                                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                            </Row>
                        )}
                    </form.Field>
                    <form.Field name="settings.vibrationCompensation">
                        {(field) => (
                            <Row label="Compensation des vibrations">
                                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                            </Row>
                        )}
                    </form.Field>
                    <form.Field name="settings.cameraOnPrint">
                        {(field) => (
                            <Row label="Caméra au démarrage" hint="Active le flux caméra quand une impression commence">
                                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                            </Row>
                        )}
                    </form.Field>
                    <form.Field name="settings.defaultAmsSlot">
                        {(field) => (
                            <Row label="Slot AMS par défaut" hint="auto = tous les slots utilisés par le GCode">
                                <Select
                                    value={String(field.state.value)}
                                    onValueChange={(v) => field.handleChange(v === 'auto' ? 'auto' : Number(v))}
                                >
                                    <SelectTrigger className="w-32">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="auto">auto</SelectItem>
                                        {SLOT_CHOICES.map((i) => (
                                            <SelectItem key={`slot-${i}`} value={String(i)}>
                                                Slot {i + 1}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Row>
                        )}
                    </form.Field>
                    <form.Field name="settings.pollIntervalSec">
                        {(field) => (
                            <Row label="Intervalle de sondage" hint="Secondes entre deux requêtes d'état MQTT">
                                <div className="grid gap-1">
                                    <Input
                                        type="number"
                                        min={1}
                                        max={60}
                                        className="w-24"
                                        value={Number.isNaN(field.state.value) ? '' : field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                        aria-invalid={fieldInvalid(field.state.meta)}
                                    />
                                    <FieldError meta={field.state.meta} />
                                </div>
                            </Row>
                        )}
                    </form.Field>
                </CardContent>
            </Card>

            <div className="flex items-center gap-2">
                <form.Subscribe selector={(s) => s.isSubmitting}>
                    {(isSubmitting) => (
                        <Button type="submit" className="rounded-full px-6" disabled={isSubmitting}>
                            Enregistrer
                        </Button>
                    )}
                </form.Subscribe>
                <Button
                    type="button"
                    variant="destructive"
                    className="ml-auto rounded-full"
                    onClick={() => {
                        if (window.confirm(`Supprimer ${printer.name} ? Les fichiers stockés sont conservés.`))
                            remove.mutate();
                    }}
                >
                    Supprimer l'imprimante
                </Button>
            </div>
        </form>
    );
}
