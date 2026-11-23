export function PageHeader({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-end gap-3 px-2">
            <div className="min-w-64 flex-1">
                <h2 className="text-xl font-medium">{title}</h2>
                {hint && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{hint}</p>}
            </div>
            {children}
        </div>
    );
}
