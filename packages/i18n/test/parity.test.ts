import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

type Message = string | { match: Record<string, string> }[];

const dir = path.resolve(import.meta.dir, '../messages');
const projectLocales = JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dir, '../project.inlang/settings.json'), 'utf8'),
) as { baseLocale: string; locales: string[] };
const read = (locale: string) =>
    JSON.parse(fs.readFileSync(path.join(dir, `${locale}.json`), 'utf8')) as Record<string, Message>;
const base = read(projectLocales.baseLocale);
const others = projectLocales.locales.filter((l) => l !== projectLocales.baseLocale);

function placeholders(value: Message): string[] {
    const found = new Set<string>();
    const scan = (s: string) => {
        for (const match of s.matchAll(/\{(\w+)\}/g)) found.add(match[1]);
    };
    if (typeof value === 'string') scan(value);
    else for (const variant of value) for (const s of Object.values(variant.match)) scan(s);
    return [...found].sort();
}

describe('message files', () => {
    it('exist for every locale of the inlang project and nothing else', () => {
        const files = fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.json'))
            .map((f) => f.replace(/\.json$/, ''))
            .sort();
        expect(files).toEqual([...projectLocales.locales].sort());
        expect(projectLocales.baseLocale).toBe('fr');
    });

    for (const locale of others) {
        it(`${locale} has every key of the base locale and no extra one`, () => {
            const keys = Object.keys(read(locale));
            const baseKeys = Object.keys(base);
            expect(baseKeys.filter((k) => !keys.includes(k))).toEqual([]);
            expect(keys.filter((k) => !baseKeys.includes(k))).toEqual([]);
        });

        it(`${locale} keeps the placeholders of every message`, () => {
            const messages = read(locale);
            const broken = Object.keys(base).filter(
                (k) => k in messages && placeholders(messages[k]).join() !== placeholders(base[k]).join(),
            );
            expect(broken).toEqual([]);
        });

        it(`${locale} has no empty translation`, () => {
            const messages = read(locale);
            const empty = Object.entries(messages)
                .filter(([, v]) => (typeof v === 'string' ? v.trim() === '' : v.length === 0))
                .map(([k]) => k);
            expect(empty).toEqual([]);
        });
    }
});
