import { createUserSchema, USER_ROLES, type UserDto, type UserRole } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { m } from '@/lib/i18n';
import { usersQuery } from '@/lib/queries';
import { sessionQuery } from '@/lib/session';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { SettingsCard } from './settings-form-card';

export const ROLE_LABEL: Record<UserRole, () => string> = {
    admin: m.role_admin,
    operator: m.role_operator,
    viewer: m.role_viewer,
};

export function UsersCard() {
    const qc = useQueryClient();
    const users = useQuery(usersQuery);
    const session = useQuery(sessionQuery);
    const me = session.data?.user.id;
    const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });
    const onError = (e: Error) => toast.error(e.message);
    const setRole = useMutation({
        mutationFn: (v: { id: string; role: UserRole }) => api.users.update(v.id, { role: v.role }),
        onSuccess: invalidate,
        onError,
    });
    const remove = useMutation({ mutationFn: api.users.remove, onSuccess: invalidate, onError });
    const openCreate = () =>
        confirmationDialogStore.actions.openDialog({
            title: m.users_add(),
            content: <UserForm onSaved={invalidate} />,
        });
    const openPassword = (u: UserDto) =>
        confirmationDialogStore.actions.openDialog({
            title: m.users_password_title({ name: u.name }),
            content: <PasswordForm user={u} />,
        });
    return (
        <SettingsCard title={m.users_title()} description={m.users_hint()}>
            <ul className="grid gap-2">
                {(users.data ?? []).map((u) => (
                    <li key={u.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/60 p-3">
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">
                                {u.name}
                                {u.id === me && (
                                    <span className="ml-2 text-xs text-muted-foreground">{m.users_you()}</span>
                                )}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                                {u.email} · {formatDate(u.createdAt)}
                            </div>
                        </div>
                        <Select
                            value={u.role}
                            disabled={setRole.isPending}
                            onValueChange={(v) => setRole.mutate({ id: u.id, role: v as UserRole })}
                        >
                            <SelectTrigger className="w-40 rounded-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {USER_ROLES.map((r) => (
                                    <SelectItem key={r} value={r}>
                                        {ROLE_LABEL[r]()}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="flex gap-1">
                            <Small title={m.users_change_password()} onClick={() => openPassword(u)}>
                                <KeyRound />
                            </Small>
                            <Small
                                title={m.common_delete()}
                                disabled={u.id === me}
                                onClick={() =>
                                    alertConfirmationDialogStore.actions.openAlertDialog({
                                        title: m.users_delete_title({ name: u.name }),
                                        description: m.users_delete_hint(),
                                        actionLabel: m.common_delete(),
                                        onAction: () => remove.mutateAsync(u.id),
                                    })
                                }
                            >
                                <Trash2 />
                            </Small>
                        </div>
                    </li>
                ))}
            </ul>
            <div>
                <Button type="button" size="sm" className="rounded-full" onClick={openCreate}>
                    <Plus /> {m.users_add()}
                </Button>
            </div>
        </SettingsCard>
    );
}

function Small({ title, ...props }: React.ComponentProps<'button'> & { title: string }) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            {...props}
            className="flex size-8 items-center justify-center rounded-full bg-background/50 hover:bg-background disabled:opacity-30 [&_svg]:size-3.5"
        />
    );
}

function UserForm({ onSaved }: { onSaved: () => void }) {
    const close = confirmationDialogStore.actions.closeDialog;
    const create = useMutation({
        mutationFn: api.users.create,
        onSuccess: () => {
            toast.success(m.users_created());
            onSaved();
            close();
        },
        onError: (e) => toast.error(e.message),
    });
    const form = useForm({
        defaultValues: { name: '', email: '', password: '', role: 'operator' as UserRole },
        validators: { onSubmit: createUserSchema.required() },
        onSubmit: ({ value }) => create.mutateAsync(value).catch(() => undefined),
    });
    const text = (name: 'name' | 'email' | 'password', label: string, type = 'text') => (
        <form.Field name={name}>
            {(field) => (
                <div className="grid gap-2">
                    <Label htmlFor={`user-${name}`}>{label}</Label>
                    <Input
                        id={`user-${name}`}
                        type={type}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={fieldInvalid(field.state.meta)}
                        className="rounded-full px-4"
                        autoComplete="off"
                    />
                    <FieldError meta={field.state.meta} />
                </div>
            )}
        </form.Field>
    );
    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <div className="grid gap-4 py-2">
                {text('name', m.field_name())}
                {text('email', m.login_email(), 'email')}
                {text('password', m.login_password(), 'password')}
                <form.Field name="role">
                    {(field) => (
                        <div className="grid gap-2">
                            <Label>{m.users_role()}</Label>
                            <Select value={field.state.value} onValueChange={(v) => field.handleChange(v as UserRole)}>
                                <SelectTrigger className="rounded-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {USER_ROLES.map((r) => (
                                        <SelectItem key={r} value={r}>
                                            {ROLE_LABEL[r]()}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="px-4 text-xs text-muted-foreground">{m.users_role_hint()}</p>
                        </div>
                    )}
                </form.Field>
            </div>
            <DialogFooter>
                <form.Subscribe selector={(s) => s.isSubmitting}>
                    {(isSubmitting) => (
                        <Button type="submit" className="rounded-full px-5" disabled={isSubmitting}>
                            {m.users_add()}
                        </Button>
                    )}
                </form.Subscribe>
            </DialogFooter>
        </form>
    );
}

function PasswordForm({ user }: { user: UserDto }) {
    const close = confirmationDialogStore.actions.closeDialog;
    const update = useMutation({
        mutationFn: (password: string) => api.users.update(user.id, { password }),
        onSuccess: () => {
            toast.success(m.users_password_changed());
            close();
        },
        onError: (e) => toast.error(e.message),
    });
    const form = useForm({
        defaultValues: { password: '' },
        validators: { onSubmit: z.object({ password: z.string().min(8).max(128) }) },
        onSubmit: ({ value }) => update.mutateAsync(value.password).catch(() => undefined),
    });
    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <div className="grid gap-4 py-2">
                <form.Field name="password">
                    {(field) => (
                        <div className="grid gap-2">
                            <Label htmlFor="new-password">{m.users_new_password()}</Label>
                            <Input
                                id="new-password"
                                type="password"
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => field.handleChange(e.target.value)}
                                aria-invalid={fieldInvalid(field.state.meta)}
                                className="rounded-full px-4"
                                autoComplete="new-password"
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
                            {m.common_save()}
                        </Button>
                    )}
                </form.Subscribe>
            </DialogFooter>
        </form>
    );
}
