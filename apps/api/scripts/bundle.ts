import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const apiRoot = path.resolve(__dirname, '..');
const outDir = path.join(apiRoot, 'bundle');
const externals = ['@libsql/client', 'express', 'qs', '@ffmpeg-installer/ffmpeg', 'onnxruntime-node'];
const optionalNest = [
    '@nestjs/microservices',
    '@nestjs/microservices/microservices-module',
    '@nestjs/graphql',
    '@nestjs/platform-socket.io',
    '@fastify/static',
    'class-transformer',
    'class-validator',
];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'dist', 'server'), { recursive: true });

await build({
    entryPoints: [path.join(apiRoot, 'dist', 'main.js')],
    outfile: path.join(outDir, 'dist', 'server', 'main.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: [...externals, ...optionalNest],
    define: { 'import.meta.url': '__kobralinkImportMetaUrl' },
    banner: { js: "const __kobralinkImportMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
    logLevel: 'info',
});

fs.cpSync(path.join(apiRoot, 'certs'), path.join(outDir, 'certs'), { recursive: true });
fs.cpSync(path.join(apiRoot, 'assets'), path.join(outDir, 'assets'), { recursive: true });
fs.cpSync(path.join(apiRoot, 'prisma', 'migrations'), path.join(outDir, 'prisma', 'migrations'), { recursive: true });

const deps = Object.fromEntries(
    externals.map((name) => {
        const pkg = JSON.parse(fs.readFileSync(require.resolve(`${name}/package.json`, { paths: [apiRoot] }), 'utf8'));
        return [name, pkg.version];
    }),
);
fs.writeFileSync(
    path.join(outDir, 'package.json'),
    JSON.stringify(
        {
            name: 'kobralink-api-bundle',
            version: JSON.parse(fs.readFileSync(path.join(apiRoot, 'package.json'), 'utf8')).version,
            private: true,
            main: 'dist/server/main.js',
            dependencies: deps,
        },
        null,
        2,
    ),
);
execSync('bun install --production --no-save', { cwd: outDir, stdio: 'inherit' });

const targetOs = process.env.KOBRALINK_BUNDLE_OS ?? process.platform;
const extraArchs = (process.env.KOBRALINK_BUNDLE_ARCHS ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a && (a !== process.arch || targetOs !== process.platform));
for (const arch of extraArchs) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kobralink-bundle-${targetOs}-${arch}-`));
    fs.copyFileSync(path.join(outDir, 'package.json'), path.join(tmp, 'package.json'));
    execSync(`bun install --production --no-save --os ${targetOs} --cpu ${arch}`, {
        cwd: tmp,
        stdio: 'inherit',
    });
    copyMissing(path.join(tmp, 'node_modules'), path.join(outDir, 'node_modules'));
    fs.rmSync(tmp, { recursive: true, force: true });
}

function copyMissing(from: string, to: string): void {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === '.bin') continue;
        const src = path.join(from, entry.name);
        const dest = path.join(to, entry.name);
        if (entry.name.startsWith('@')) {
            fs.mkdirSync(dest, { recursive: true });
            copyMissing(src, dest);
        } else if (!fs.existsSync(dest)) {
            fs.cpSync(src, dest, { recursive: true });
        }
    }
}
const ortBin = path.join(outDir, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6');
for (const platform of fs.readdirSync(ortBin)) {
    if (platform !== targetOs) fs.rmSync(path.join(ortBin, platform), { recursive: true, force: true });
}
console.log(`Bundle API prêt: ${outDir}`);
