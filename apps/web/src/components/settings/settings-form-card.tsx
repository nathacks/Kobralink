import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { m } from '@/lib/i18n';

export function SettingsCard({
    title,
    description,
    children,
    onSubmit,
    submitting,
    extra,
}: {
    title: React.ReactNode;
    description?: React.ReactNode;
    children: React.ReactNode;
    onSubmit?: () => void;
    submitting?: boolean;
    extra?: React.ReactNode;
}) {
    const body = (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent className="grid gap-4">
                {children}
                {onSubmit && (
                    <div className="flex items-center gap-2">
                        <Button type="submit" className="rounded-full px-6" disabled={submitting}>
                            {m.common_save()}
                        </Button>
                        {extra}
                    </div>
                )}
            </CardContent>
        </Card>
    );
    if (!onSubmit) return body;
    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
            }}
        >
            {body}
        </form>
    );
}

export function Field({
    label,
    hint,
    htmlFor,
    children,
}: {
    label: string;
    hint?: string;
    htmlFor?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid gap-2">
            <label htmlFor={htmlFor} className="text-sm font-medium">
                {label}
            </label>
            {children}
            {hint && <p className="px-4 text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

export function SwitchRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 py-1">
            <div>
                <div className="text-sm font-medium">{label}</div>
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
            {children}
        </div>
    );
}
