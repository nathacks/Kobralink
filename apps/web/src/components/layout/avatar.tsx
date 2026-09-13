export function Avatar({ name, email }: { name?: string | null; email: string }) {
    const source = (name?.trim() || email).trim();
    const initials = source
        .split(/[\s@._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join('');
    return (
        <div
            className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
            title={email}
        >
            {initials || '?'}
        </div>
    );
}
