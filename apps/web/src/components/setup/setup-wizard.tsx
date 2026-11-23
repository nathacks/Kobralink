import {
    APP_LOCALES,
    type AppLocale,
    type LoginFormValues,
    loginFormSchema,
    type PrinterProfile,
    printerSpecs,
} from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { PrinterSpecsCard } from '@/components/printer/printer-specs-card';
import { ProfileFields } from '@/components/printer/profile-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHosts } from '@/hooks/use-hosts';
import { api, type PrinterWithLive } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { LOCALE_LABEL, type Locale, locales, m, setLocale, useLocale } from '@/lib/i18n';
import { appSettingsQuery, printersQuery, setupQuery } from '@/lib/queries';
import { sessionQuery } from '@/lib/session';
import { cn } from '@/lib/utils';

export type SetupStep = 'account' | 'prefs' | 'printer' | 'profile' | 'spoolman' | 'slicer';

export function setupSteps(needsAccount: boolean): SetupStep[] {
    return [...(needsAccount ? (['account'] as const) : []), 'prefs', 'printer', 'profile', 'spoolman', 'slicer'];
}

type StepProps = { onNext: () => void };

function StepHeader({ title, hint }: { title: string; hint?: string }) {
    return (
        <div className="mb-6">
            <h2 className="text-xl font-semibold">{title}</h2>
            {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
        </div>
    );
}

function Footer({
    onNext,
    onSkip,
    nextLabel = m.setup_next(),
    disabled,
    submit,
}: {
    onNext?: () => void;
    onSkip?: () => void;
    nextLabel?: string;
    disabled?: boolean;
    submit?: boolean;
}) {
    return (
        <div className="mt-8 flex flex-wrap items-center justify-end gap-2">
            {onSkip && (
                <Button type="button" variant="ghost" className="rounded-full" onClick={onSkip}>
                    {m.setup_skip()}
                </Button>
            )}
            <Button
                type={submit ? 'submit' : 'button'}
                className="rounded-full px-6"
                disabled={disabled}
                onClick={submit ? undefined : onNext}
            >
                {nextLabel}
            </Button>
        </div>
    );
}

function AccountStep({ onNext }: StepProps) {
    const qc = useQueryClient();
    const signUp = useMutation({
        mutationFn: async ({ name, email, password }: LoginFormValues) => {
            const res = await authClient.signUp.email({ email, password, name: name || email.split('@')[0] });
            if (res.error) throw new Error(res.error.message ?? m.login_failed());
        },
        onSuccess: async () => {
            qc.removeQueries({ queryKey: ['session'] });
            await qc.fetchQuery({ ...sessionQuery, staleTime: 0 });
            await qc.invalidateQueries({ queryKey: setupQuery.queryKey });
            onNext();
        },
        onError: (e) => toast.error(e.message),
    });
    const form = useForm({
        defaultValues: { name: '', email: '', password: '' } as LoginFormValues,
        validators: { onSubmit: loginFormSchema },
        onSubmit: ({ value }) => signUp.mutateAsync(value).catch(() => undefined),
    });
    const fields = [
        { name: 'name', label: m.login_name(), type: 'text', auto: 'name' },
        { name: 'email', label: m.login_email(), type: 'email', auto: 'email' },
        { name: 'password', label: m.login_password(), type: 'password', auto: 'new-password' },
    ] as const;
    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <StepHeader title={m.setup_account_title()} hint={m.setup_account_hint()} />
            <div className="grid gap-4">
                {fields.map((f) => (
                    <form.Field key={f.name} name={f.name}>
                        {(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor={`setup-${f.name}`}>{f.label}</Label>
                                <Input
                                    id={`setup-${f.name}`}
                                    type={f.type}
                                    autoComplete={f.auto}
                                    value={field.state.value ?? ''}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    aria-invalid={fieldInvalid(field.state.meta)}
                                    className="rounded-full px-4"
                                />
                                <FieldError meta={field.state.meta} />
                            </div>
                        )}
                    </form.Field>
                ))}
            </div>
            <Footer submit nextLabel={m.login_create_account()} disabled={signUp.isPending} />
        </form>
    );
}

function PrefsStep({ onNext }: StepProps) {
    const qc = useQueryClient();
    const locale = useLocale();
    const settings = useQuery(appSettingsQuery).data;
    const [currency, setCurrency] = useState(settings?.currency ?? 'EUR');
    const [publicUrl, setPublicUrl] = useState(settings?.publicUrl || window.location.origin);
    const save = useMutation({
        mutationFn: () =>
            api.settings.update({
                currency: currency.trim().toUpperCase() || 'EUR',
                publicUrl: publicUrl.trim(),
                ...(APP_LOCALES.includes(locale as AppLocale) ? { locale: locale as AppLocale } : {}),
            }),
        onSuccess: (next) => {
            qc.setQueryData(appSettingsQuery.queryKey, next);
            onNext();
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <div>
            <StepHeader title={m.setup_prefs_title()} hint={m.setup_prefs_hint()} />
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                    <Label htmlFor="setup-locale">{m.appearance_language()}</Label>
                    <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                        <SelectTrigger id="setup-locale" className="w-full rounded-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {locales.map((l) => (
                                <SelectItem key={l} value={l}>
                                    {LOCALE_LABEL[l]()}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="setup-currency">{m.settings_currency()}</Label>
                    <Input
                        id="setup-currency"
                        value={currency}
                        maxLength={8}
                        onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                        className="rounded-full px-4 font-mono uppercase"
                    />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="setup-public-url">{m.settings_public_url()}</Label>
                    <Input
                        id="setup-public-url"
                        value={publicUrl}
                        onChange={(e) => setPublicUrl(e.target.value)}
                        className="rounded-full px-4"
                    />
                    <p className="px-4 text-xs text-muted-foreground">{m.settings_public_url_hint()}</p>
                </div>
            </div>
            <Footer onNext={() => save.mutate()} disabled={save.isPending} />
        </div>
    );
}

function PrinterStep({ onNext, printer }: StepProps & { printer: PrinterWithLive | undefined }) {
    const qc = useQueryClient();
    const [ip, setIp] = useState('');
    const [name, setName] = useState('');
    const add = useMutation({
        mutationFn: () => api.printers.add({ ip: ip.trim(), name: name.trim() || undefined }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: printersQuery.queryKey });
        },
        onError: (e) => toast.error(e.message),
    });
    if (printer) {
        return (
            <div>
                <StepHeader title={m.setup_printer_title()} />
                <p className="mb-4 flex items-center gap-2 rounded-2xl bg-primary/10 px-4 py-3 text-sm font-medium">
                    <Check className="size-4 text-primary-strong" />
                    {m.setup_printer_found({ model: printer.model || printer.name })}
                </p>
                <PrinterSpecsCard modeId={printer.modeId} className="rounded-3xl border bg-transparent shadow-none" />
                <Footer onNext={onNext} />
            </div>
        );
    }
    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                if (ip.trim()) add.mutate();
            }}
        >
            <StepHeader title={m.setup_printer_title()} hint={m.setup_printer_hint()} />
            <ol className="mb-6 grid gap-2 text-sm">
                {[m.setup_lan_1(), m.setup_lan_2(), m.setup_lan_3()].map((text, i) => (
                    <li key={text} className="flex gap-3 rounded-2xl bg-secondary/60 px-4 py-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                            {i + 1}
                        </span>
                        <span>{text}</span>
                    </li>
                ))}
            </ol>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                    <Label htmlFor="setup-ip">{m.field_ip()}</Label>
                    <Input
                        id="setup-ip"
                        value={ip}
                        inputMode="decimal"
                        placeholder="192.168.1.50"
                        onChange={(e) => setIp(e.target.value)}
                        className="rounded-full px-4"
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="setup-printer-name">{m.add_printer_name_optional()}</Label>
                    <Input
                        id="setup-printer-name"
                        value={name}
                        placeholder={m.add_printer_name_placeholder()}
                        onChange={(e) => setName(e.target.value)}
                        className="rounded-full px-4"
                    />
                </div>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="ghost" className="rounded-full" onClick={onNext}>
                    {m.setup_skip()}
                </Button>
                <Button type="submit" className="rounded-full px-6" disabled={!ip.trim() || add.isPending}>
                    {add.isPending ? m.add_printer_connecting() : m.add_printer_submit()}
                </Button>
            </div>
        </form>
    );
}

export function initialProfile(printer: PrinterWithLive): PrinterProfile {
    const profile = printer.settings.profile;
    if (profile.nozzleMm !== null) return profile;
    return { ...profile, nozzleMm: printerSpecs(printer.modeId)?.defaultNozzleMm ?? null };
}

function ProfileStep({ onNext, printer }: StepProps & { printer: PrinterWithLive }) {
    const qc = useQueryClient();
    const [profile, setProfile] = useState(() => initialProfile(printer));
    const save = useMutation({
        mutationFn: () => api.printers.update(printer.id, { settings: { profile } }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: printersQuery.queryKey });
            onNext();
        },
        onError: (e) => toast.error(e.message),
    });
    return (
        <div>
            <StepHeader title={m.setup_profile_title()} hint={m.setup_profile_hint()} />
            <ProfileFields value={profile} onChange={setProfile} modeId={printer.modeId} />
            <Footer onNext={() => save.mutate()} onSkip={onNext} disabled={save.isPending} />
        </div>
    );
}

function SpoolmanStep({ onNext }: StepProps) {
    const qc = useQueryClient();
    const settings = useQuery(appSettingsQuery).data;
    const [url, setUrl] = useState(settings?.spoolmanUrl ?? '');
    const [reachable, setReachable] = useState<boolean | null>(null);
    const save = useMutation({
        mutationFn: async () => {
            const next = await api.settings.update({ spoolmanUrl: url.trim() });
            qc.setQueryData(appSettingsQuery.queryKey, next);
            return api.spoolman.health();
        },
        onSuccess: (health) => setReachable(health.reachable),
        onError: (e) => toast.error(e.message),
    });
    return (
        <div>
            <StepHeader title={m.setup_spoolman_title()} hint={m.filament_spoolman_recommended()} />
            <div className="grid gap-2">
                <Label htmlFor="setup-spoolman">{m.spoolman_server_url()}</Label>
                <div className="flex flex-wrap gap-2">
                    <Input
                        id="setup-spoolman"
                        value={url}
                        placeholder="http://192.168.1.20:7912"
                        onChange={(e) => {
                            setUrl(e.target.value);
                            setReachable(null);
                        }}
                        className="min-w-0 flex-1 rounded-full px-4"
                    />
                    <Button
                        type="button"
                        variant="secondary"
                        className="rounded-full"
                        disabled={!url.trim() || save.isPending}
                        onClick={() => save.mutate()}
                    >
                        {m.setup_spoolman_test()}
                    </Button>
                </div>
                {reachable !== null && (
                    <p className={cn('px-4 text-sm', reachable ? 'text-primary-strong' : 'text-destructive')}>
                        {reachable ? m.setup_spoolman_ok() : m.setup_spoolman_fail()}
                    </p>
                )}
            </div>
            <Footer onNext={onNext} onSkip={onNext} disabled={!reachable} />
        </div>
    );
}

function SlicerStep({ printers, onFinish }: { printers: PrinterWithLive[]; onFinish: () => void }) {
    const host = useHosts()[0];
    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(m.slicer_copied());
        } catch (e) {
            toast.error((e as Error).message);
        }
    };
    return (
        <div>
            <StepHeader title={m.setup_slicer_title()} hint={m.setup_slicer_hint()} />
            <ul className="grid gap-2">
                {printers.map((p) => {
                    const url = `http://${host}:${p.httpPort}`;
                    return (
                        <li
                            key={p.id}
                            className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/60 px-4 py-3"
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">{p.name}</span>
                                <code className="text-sm text-muted-foreground">{url}</code>
                            </span>
                            <Button size="sm" variant="secondary" className="rounded-full" onClick={() => copy(url)}>
                                <Copy /> {m.slicer_copy()}
                            </Button>
                        </li>
                    );
                })}
            </ul>
            <Footer onNext={onFinish} nextLabel={m.setup_finish()} />
        </div>
    );
}

export function SetupWizard({ needsAccount }: { needsAccount: boolean }) {
    const navigate = useNavigate();
    const steps = setupSteps(needsAccount);
    const [index, setIndex] = useState(0);
    const signedIn = Boolean(useQuery(sessionQuery).data);
    const printers = useQuery({ ...printersQuery, enabled: signedIn }).data ?? [];
    const printer = printers[0];
    const visible = steps.filter((s) => (s === 'profile' || s === 'slicer' ? Boolean(printer) : true));
    const step = visible[Math.min(index, visible.length - 1)];
    const position = visible.indexOf(step);
    const next = () => {
        if (position >= visible.length - 1) void navigate({ to: '/printers' });
        else setIndex(position + 1);
    };
    const back = position > 0 && step !== 'prefs' ? () => setIndex(position - 1) : undefined;

    return (
        <div className="flex min-h-svh items-start justify-center p-4 pt-(--inset-top) sm:items-center sm:p-6">
            <div className="w-full max-w-2xl rounded-3xl bg-card p-6 text-card-foreground sm:p-8">
                <div className="mb-6 flex items-center gap-3">
                    <img src="/logo.svg" alt="" className="size-10 rounded-xl" />
                    <div className="min-w-0 flex-1">
                        <h1 className="text-lg font-semibold">{m.setup_title()}</h1>
                        <p className="text-xs text-muted-foreground">
                            {m.setup_step({ n: position + 1, total: visible.length })}
                        </p>
                    </div>
                    {back && (
                        <Button variant="ghost" size="sm" className="rounded-full" onClick={back}>
                            <ArrowLeft /> {m.common_back()}
                        </Button>
                    )}
                </div>
                <div className="mb-8 flex gap-1.5" aria-hidden>
                    {visible.map((s, i) => (
                        <span
                            key={s}
                            className={cn('h-1.5 flex-1 rounded-full', i <= position ? 'bg-primary' : 'bg-secondary')}
                        />
                    ))}
                </div>
                {step === 'account' && <AccountStep onNext={next} />}
                {step === 'prefs' && <PrefsStep onNext={next} />}
                {step === 'printer' && <PrinterStep onNext={next} printer={printer} />}
                {step === 'profile' && printer && <ProfileStep key={printer.id} onNext={next} printer={printer} />}
                {step === 'spoolman' && <SpoolmanStep onNext={next} />}
                {step === 'slicer' && <SlicerStep printers={printers} onFinish={next} />}
            </div>
        </div>
    );
}
