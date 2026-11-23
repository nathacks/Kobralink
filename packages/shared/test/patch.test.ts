import { describe, expect, it } from 'bun:test';
import type { z } from 'zod';
import { mergePatch, patchSchema } from '../src/patch';
import { printerSettingsSchema, updatePrinterSchema } from '../src/printer';
import { appSettingsSchema, updateAppSettingsSchema } from '../src/settings';
import { localSpoolSchema, updateLocalSpoolSchema } from '../src/spools';

type Settings = Record<string, unknown>;

function alter(value: unknown): unknown {
    if (typeof value === 'boolean') return !value;
    if (typeof value === 'number') return value === 0 ? 1 : value - 1;
    if (typeof value === 'string') return value === '' ? 'changed' : value === 'auto' ? 0 : `${value}x`;
    if (Array.isArray(value)) return value.length ? value.slice(1) : [];
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, alter(v)]));
    }
    return value;
}

function storedVariant(schema: z.ZodObject, defaults: Settings, overrides: Settings = {}): Settings {
    const changed = Object.fromEntries(
        Object.entries(defaults).map(([k, v]) => {
            const candidate = { ...defaults, [k]: alter(v) };
            return [k, schema.safeParse(candidate).success ? alter(v) : v];
        }),
    );
    return schema.parse({ ...changed, ...overrides }) as Settings;
}

function nestedPaths(value: Settings): string[][] {
    return Object.entries(value).flatMap(([k, v]) =>
        v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v as Settings).map((inner) => [k, inner]) : [[k]],
    );
}

function patchFor(path: string[], value: unknown): Settings {
    return path.length === 1 ? { [path[0]]: value } : { [path[0]]: { [path[1]]: value } };
}

function read(obj: Settings, path: string[]): unknown {
    return path.reduce<unknown>((acc, k) => (acc as Settings)[k], obj);
}

function expectOnlyChanged(before: Settings, after: Settings, path: string[]) {
    for (const other of nestedPaths(before)) {
        if (other.join('.') === path.join('.')) continue;
        expect({ field: other.join('.'), value: read(after, other) }).toEqual({
            field: other.join('.'),
            value: read(before, other),
        });
    }
}

describe.each([
    {
        name: 'printer settings',
        schema: printerSettingsSchema,
        parsePatch: (patch: Settings) => updatePrinterSchema.parse({ settings: patch }).settings as Settings,
    },
    {
        name: 'app settings',
        schema: appSettingsSchema,
        parsePatch: (patch: Settings) => updateAppSettingsSchema.parse(patch) as Settings,
    },
])('$name', ({ schema, parsePatch }) => {
    const defaults = schema.parse({}) as Settings;
    const stored = storedVariant(schema as z.ZodObject, defaults);
    const paths = nestedPaths(defaults);

    it('has a stored variant that differs from the defaults', () => {
        expect(stored).not.toEqual(defaults);
    });

    it.each(paths.map((p) => [p.join('.'), p] as const))('saving only %s keeps every other field', (_, path) => {
        const value = read(defaults, path);
        const patch = parsePatch(patchFor(path, value));
        expect(nestedPaths(patch).map((p) => p.join('.'))).toEqual([path.join('.')]);
        const next = schema.parse(mergePatch(stored, patch)) as Settings;
        expect(read(next, path)).toEqual(value);
        expectOnlyChanged(stored, next, path);
    });
});

describe('local spools', () => {
    const sample = localSpoolSchema.parse({ name: 'Rapid PETG', material: 'PETG' }) as Settings;

    it.each(Object.keys(sample))('updating only %s sends nothing else', (key) => {
        const patch = updateLocalSpoolSchema.parse({ [key]: sample[key] }) as Settings;
        expect(Object.keys(patch)).toEqual([key]);
    });

    it('accepts an empty update', () => {
        expect(updateLocalSpoolSchema.parse({})).toEqual({});
    });
});

describe('patchSchema', () => {
    it('still validates the values that are sent', () => {
        expect(patchSchema(printerSettingsSchema).safeParse({ pollIntervalSec: 0 }).success).toBe(false);
        expect(patchSchema(printerSettingsSchema).safeParse({ alerts: { bedMaxC: -1 } }).success).toBe(false);
    });
});

describe('mergePatch', () => {
    it('merges nested objects and replaces arrays', () => {
        const merged = mergePatch({ a: { x: 1, y: 2 }, list: [1, 2] }, { a: { y: 3 }, list: [9] });
        expect(merged).toEqual({ a: { x: 1, y: 3 }, list: [9] });
    });

    it('ignores undefined values', () => {
        expect(mergePatch({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
    });
});
