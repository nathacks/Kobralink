import type { AnyFieldMeta } from '@tanstack/react-form';

export function fieldInvalid(meta: AnyFieldMeta) {
    return meta.isTouched && meta.errors.length > 0;
}

export function FieldError({ meta }: { meta: AnyFieldMeta }) {
    if (!fieldInvalid(meta)) return null;
    const message = meta.errors
        .map((e) => (typeof e === 'string' ? e : (e as { message?: string } | undefined)?.message))
        .filter(Boolean)[0];
    if (!message) return null;
    return <p className="px-4 text-xs text-destructive">{message}</p>;
}
