import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

type TurboConfig = { tasks: Record<string, { dependsOn?: string[] }> };

const read = (file: string) =>
    JSON.parse(fs.readFileSync(path.resolve(import.meta.dir, '../../..', file), 'utf8')) as TurboConfig;

describe('paraglide compile order', () => {
    const i18n = read('packages/i18n/turbo.json');
    const web = read('apps/web/turbo.json');

    it('type-checks the package after its own build compiled the messages', () => {
        expect(i18n.tasks['check-types'].dependsOn).toContain('build');
    });

    it('waits for the package build before every web task that compiles the same project', () => {
        expect(web.tasks.build.dependsOn).toContain('@kobralink/i18n#build');
        expect(web.tasks.test.dependsOn).toContain('@kobralink/i18n#build');
    });

    it('waits for the package type-check, which compiles again, before the web type-check', () => {
        expect(web.tasks['check-types'].dependsOn).toContain('@kobralink/i18n#check-types');
    });

    it('keeps building the dependencies of the web first', () => {
        for (const task of ['build', 'check-types', 'test']) expect(web.tasks[task].dependsOn).toContain('^build');
    });
});
