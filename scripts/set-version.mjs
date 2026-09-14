import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPaths = [
    join(repoRoot, 'package.json'),
    join(repoRoot, 'apps', 'api', 'package.json'),
    join(repoRoot, 'apps', 'web', 'package.json'),
    join(repoRoot, 'apps', 'desktop', 'package.json'),
    join(repoRoot, 'packages', 'shared', 'package.json'),
    join(repoRoot, 'packages', 'kobra-protocol', 'package.json'),
    join(repoRoot, 'packages', 'i18n', 'package.json'),
];

const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const bumpKinds = ['major', 'minor', 'patch'];

const input = process.argv[2];
if (!input) {
    console.error('usage: bun scripts/set-version.mjs <version|major|minor|patch>');
    process.exit(1);
}

const manifests = manifestPaths.map((path) => {
    const raw = readFileSync(path, 'utf8');
    const match = raw.match(/^(\s*)"version":\s*"([^"]+)"/m);
    if (!match) {
        console.error(`no "version" field in ${relative(repoRoot, path)}`);
        process.exit(1);
    }
    return { path, raw, current: match[2] };
});

function bump(version, kind) {
    const core = version.split('-')[0].split('+')[0];
    const parts = core.split('.').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) {
        console.error(`cannot bump non-semver version "${version}"`);
        process.exit(1);
    }
    const [major, minor, patch] = parts;
    if (kind === 'major') return `${major + 1}.0.0`;
    if (kind === 'minor') return `${major}.${minor + 1}.0`;
    return `${major}.${minor}.${patch + 1}`;
}

let nextVersion;
if (bumpKinds.includes(input)) {
    nextVersion = bump(manifests[0].current, input);
} else {
    nextVersion = input.startsWith('v') ? input.slice(1) : input;
    if (!semverPattern.test(nextVersion)) {
        console.error(`"${input}" is not a valid semver version`);
        process.exit(1);
    }
}

for (const { path, raw, current } of manifests) {
    const updated = raw.replace(/^(\s*)"version":\s*"[^"]+"/m, `$1"version": "${nextVersion}"`);
    writeFileSync(path, updated);
    console.log(`${relative(repoRoot, path)}: ${current} -> ${nextVersion}`);
}
