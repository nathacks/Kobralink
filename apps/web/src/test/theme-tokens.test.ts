import { describe, expect, it } from 'vitest';

const sources = import.meta.glob(['../**/*.tsx', '!../paraglide/**', '!../**/*.test.tsx'], {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

function offenders(pattern: RegExp): string[] {
    return Object.entries(sources)
        .filter(([, code]) => pattern.test(code))
        .map(([file]) => file);
}

describe('colour tokens', () => {
    it('scans the components', () => {
        expect(Object.keys(sources).length).toBeGreaterThan(50);
    });

    it('never uses the pastel primary as a text colour', () => {
        expect(offenders(/text-primary(?![-\w])/)).toEqual([]);
    });

    it('never writes the deep brand colour on the dark primary-foreground fill', () => {
        expect(
            offenders(
                /bg-primary-foreground(?!\/)[^'"\n]*text-primary-strong|text-primary-strong[^'"\n]*bg-primary-foreground(?!\/)/,
            ),
        ).toEqual([]);
    });

    it('never uses the old emerald palette', () => {
        expect(offenders(/emerald-\d|#10b981/i)).toEqual([]);
    });
});
