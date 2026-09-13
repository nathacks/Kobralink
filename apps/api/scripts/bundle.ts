import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const apiRoot = path.resolve(__dirname, '..');
const outDir = path.join(apiRoot, 'bundle');
const externals = ['@libsql/client', 'express', 'qs', '@ffmpeg-installer/ffmpeg'];
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
        { name: 'kobralink-api-bundle', private: true, main: 'dist/server/main.js', dependencies: deps },
        null,
        2,
    ),
);
execSync('bun install --production --no-save', { cwd: outDir, stdio: 'inherit' });
console.log(`Bundle API prêt: ${outDir}`);
