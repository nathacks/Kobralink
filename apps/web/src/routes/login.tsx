import { type LoginFormValues, loginFormSchema } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { setupQuery } from '@/lib/queries';
import { sessionQuery } from '@/lib/session';

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute('/login')({
    validateSearch: searchSchema,
    beforeLoad: async ({ context, search }) => {
        const session = await context.queryClient.ensureQueryData(sessionQuery);
        if (session) throw redirect({ to: search.redirect ?? '/printers' });
    },
    component: LoginPage,
});

function LoginPage() {
    const { redirect: target } = Route.useSearch();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const setup = useQuery(setupQuery);
    const needsSetup = setup.data?.needsSetup ?? false;

    const submit = useMutation({
        mutationFn: async ({ name, email, password }: LoginFormValues) => {
            const res = needsSetup
                ? await authClient.signUp.email({ email, password, name: name || email.split('@')[0] })
                : await authClient.signIn.email({ email, password });
            if (res.error) throw new Error(res.error.message ?? 'Échec de la connexion');
        },
        onSuccess: async () => {
            qc.removeQueries({ queryKey: ['session'] });
            await qc.fetchQuery({ ...sessionQuery, staleTime: 0 });
            await navigate({ to: target ?? '/printers', replace: true });
        },
        onError: (e) => toast.error(e.message),
    });

    const form = useForm({
        defaultValues: { name: '', email: '', password: '' } as LoginFormValues,
        validators: { onSubmit: loginFormSchema },
        onSubmit: ({ value }) => submit.mutateAsync(value).catch(() => undefined),
    });

    return (
        <div className="flex min-h-svh items-center justify-center p-6 pt-(--inset-top)">
            <div className="w-full max-w-sm rounded-3xl bg-card p-8 text-card-foreground">
                <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold">
                    K
                </div>
                <h1 className="text-2xl font-semibold">{needsSetup ? 'Bienvenue !' : 'Bon retour !'}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {needsSetup
                        ? 'Premier démarrage : créez le compte propriétaire de ce bridge.'
                        : 'Connectez-vous pour piloter vos imprimantes.'}
                </p>
                <form
                    className="mt-6 grid gap-4"
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        void form.handleSubmit();
                    }}
                >
                    {needsSetup && (
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
                                        autoComplete="name"
                                        className="rounded-full px-4"
                                    />
                                    <FieldError meta={field.state.meta} />
                                </div>
                            )}
                        </form.Field>
                    )}
                    <form.Field name="email">
                        {(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor={field.name}>E-mail</Label>
                                <Input
                                    id={field.name}
                                    name={field.name}
                                    type="email"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    aria-invalid={fieldInvalid(field.state.meta)}
                                    autoComplete="email"
                                    className="rounded-full px-4"
                                />
                                <FieldError meta={field.state.meta} />
                            </div>
                        )}
                    </form.Field>
                    <form.Field name="password">
                        {(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor={field.name}>Mot de passe</Label>
                                <Input
                                    id={field.name}
                                    name={field.name}
                                    type="password"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    aria-invalid={fieldInvalid(field.state.meta)}
                                    autoComplete={needsSetup ? 'new-password' : 'current-password'}
                                    className="rounded-full px-4"
                                />
                                <FieldError meta={field.state.meta} />
                            </div>
                        )}
                    </form.Field>
                    <form.Subscribe selector={(s) => s.isSubmitting}>
                        {(isSubmitting) => (
                            <Button
                                type="submit"
                                size="lg"
                                className="mt-2 rounded-full"
                                disabled={isSubmitting || setup.isLoading}
                            >
                                {needsSetup ? 'Créer le compte' : 'Se connecter'}
                            </Button>
                        )}
                    </form.Subscribe>
                </form>
            </div>
        </div>
    );
}
