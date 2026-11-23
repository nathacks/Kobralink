import { z } from 'zod';

type Patch<T> =
    T extends z.ZodDefault<infer I> ? Patch<I> : T extends z.ZodObject<infer S> ? z.ZodObject<PatchShape<S>> : T;

export type PatchShape<S extends z.ZodRawShape> = { [K in keyof S]: z.ZodOptional<Patch<S[K]>> };

function patchField(field: z.ZodType): z.ZodType {
    const inner = field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : field;
    return inner instanceof z.ZodObject ? z.object(patchShape(inner.shape)) : inner;
}

export function patchShape<S extends z.ZodRawShape>(shape: S): PatchShape<S> {
    return Object.fromEntries(
        Object.entries(shape).map(([key, field]) => [key, z.optional(patchField(field as z.ZodType))]),
    ) as PatchShape<S>;
}

export function patchSchema<S extends z.ZodRawShape>(schema: z.ZodObject<S>) {
    return z.object(patchShape(schema.shape));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function mergePatch<T>(current: T, patch: unknown): T {
    if (!isPlainObject(current) || !isPlainObject(patch)) return (patch === undefined ? current : patch) as T;
    const out: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergePatch(out[key], value) : value;
    }
    return out as T;
}
