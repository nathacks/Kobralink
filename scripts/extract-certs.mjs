/*
 * Extract the Anycubic Slicer client certificate used for the Kobra X LAN MQTT broker.
 *
 * The printer's broker (port 9883) only accepts the TLS client certificate embedded in
 * Anycubic Slicer Next. This script scans the slicer binaries for the PEM blocks, picks the
 * certificate whose CN is "AnycubicSlicer", finds its matching private key and writes both to
 * apps/api/certs/ (anycubic_slicer.crt + anycubic_slicer.key).
 *
 * When to run it:
 *   - the bundled certificate expires in 2123, so normally never;
 *   - only if an Anycubic firmware or slicer update ships a new certificate (symptom: the
 *     printer refuses the MQTT TLS handshake on port 9883).
 *
 * How to:
 *   1. Install Anycubic Slicer Next (Windows) or locate an existing install.
 *   2. Find cloud_mqtt.dll, usually in the install directory, e.g.
 *        C:\Program Files\AnycubicSlicerNext\cloud_mqtt.dll
 *      Passing the whole install directory also works (it scans .dll/.exe/.so/.dylib).
 *   3. From the repo root:
 *        bun run certs:extract "<path to cloud_mqtt.dll or install dir>"
 *      Options:
 *        --out <dir>   write somewhere else than apps/api/certs (default)
 *        --force       overwrite an existing, different certificate
 *   4. Restart Kobralink (or the Docker container / desktop app) so the bridge reloads the certs.
 *
 * Exit codes: 0 done or already up to date, 1 nothing usable found, 2 existing certificate
 * differs and --force was not given.
 *
 * Only works while the PEM is stored in plain text inside the binaries (true for current
 * releases). If Anycubic starts encrypting it, dump the running process memory instead.
 */

import { createPrivateKey, X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultOut = join(repoRoot, 'apps', 'api', 'certs');
const expectedCn = 'AnycubicSlicer';
const scanExt = new Set(['.dll', '.exe', '.so', '.dylib', '']);
const maxFileSize = 512 * 1024 * 1024;

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args[outIdx + 1] : defaultOut;
const force = args.includes('--force');

if (!input) {
    console.error(
        `Usage: bun scripts/extract-certs.mjs <cloud_mqtt.dll | slicer install dir> [--out ${defaultOut}] [--force]`,
    );
    process.exit(1);
}

const certRe = /-----BEGIN CERTIFICATE-----[\r\n]+[A-Za-z0-9+/=\r\n]+?-----END CERTIFICATE-----/g;
const keyRe =
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=\r\n]+?-----END (?:RSA |EC )?PRIVATE KEY-----/g;

function listFiles(p) {
    const st = statSync(p);
    if (st.isFile()) return [p];
    const out = [];
    for (const entry of readdirSync(p, { withFileTypes: true })) {
        const full = join(p, entry.name);
        if (entry.isDirectory()) out.push(...listFiles(full));
        else if (entry.isFile()) {
            const dot = entry.name.lastIndexOf('.');
            const ext = dot >= 0 ? entry.name.slice(dot).toLowerCase() : '';
            if (scanExt.has(ext)) out.push(full);
        }
    }
    return out;
}

function normalize(pem) {
    return `${pem.replace(/\r\n/g, '\n').trim()}\n`;
}

const certs = [];
const keys = [];
for (const file of listFiles(input)) {
    if (statSync(file).size > maxFileSize) continue;
    const text = readFileSync(file).toString('latin1');
    for (const m of text.matchAll(certRe)) {
        try {
            const x509 = new X509Certificate(normalize(m[0]));
            certs.push({ file, offset: m.index, pem: normalize(m[0]), x509 });
        } catch {}
    }
    for (const m of text.matchAll(keyRe)) {
        try {
            const key = createPrivateKey(normalize(m[0]));
            keys.push({ file, offset: m.index, pem: normalize(m[0]), key });
        } catch {}
    }
}

const target = certs.find((c) => c.x509.subject.includes(`CN=${expectedCn}`)) ?? certs[0];
if (!target) {
    console.error(`No certificate found in ${input} (${certs.length} cert, ${keys.length} key)`);
    process.exit(1);
}
const match = keys.find((k) => target.x509.checkPrivateKey(k.key));
if (!match) {
    console.error(
        `Certificate found (${target.x509.subject}) but no matching private key among ${keys.length} candidate(s)`,
    );
    process.exit(1);
}

console.log(`cert  ${target.file} @ 0x${target.offset.toString(16)}`);
console.log(`      ${target.x509.subject.replace(/\n/g, ', ')}`);
console.log(`      valid ${target.x509.validFrom} → ${target.x509.validTo}`);
console.log(`key   ${match.file} @ 0x${match.offset.toString(16)}`);

const crtPath = join(outDir, 'anycubic_slicer.crt');
const keyPath = join(outDir, 'anycubic_slicer.key');
if (existsSync(crtPath) && !force) {
    const current = readFileSync(crtPath, 'utf8');
    if (normalize(current) === target.pem) {
        console.log(`unchanged: ${crtPath} already holds this certificate`);
        process.exit(0);
    }
    console.error(`${crtPath} exists with a different certificate, rerun with --force to overwrite`);
    process.exit(2);
}
mkdirSync(outDir, { recursive: true });
writeFileSync(crtPath, target.pem);
writeFileSync(keyPath, match.pem, { mode: 0o600 });
console.log(`wrote ${crtPath}\nwrote ${keyPath}`);
