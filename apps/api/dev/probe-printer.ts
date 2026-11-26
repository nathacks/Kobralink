import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fetchPrinterCredentials, KobraMqttClient, redactPrinterUrl } from '@kobralink/kobra-protocol';
import { createClient } from '@libsql/client';

interface Creds {
    username: string;
    password: string;
    deviceId: string;
    modeId: string;
    model: string;
}

const SECRET_KEYS = /^(token|password|username|sn|cn|mac|ssid|deviceId|device_id|ip|wifi.*)$/i;
const REPORTS_PER_TOPIC = 20;

export function redactCapture(value: unknown, secrets: string[]): unknown {
    const text = JSON.stringify(value, (key, v) => (SECRET_KEYS.test(key) && v !== '' && v !== null ? '…' : v));
    const masked = secrets.filter((s) => s.length >= 4).reduce((t, s) => t.split(s).join('…'), redactPrinterUrl(text));
    return JSON.parse(masked);
}

function databasePath(): string {
    const url = process.env.DATABASE_URL;
    if (url?.startsWith('file:')) return url.slice(5);
    const dataDir = process.env.KOBRALINK_DATA_DIR ?? path.join(__dirname, '..', '..', '..', 'data');
    return path.join(dataDir, 'kobralink.db');
}

async function credsFromDatabase(ip: string): Promise<Creds | null> {
    const file = databasePath();
    if (!fs.existsSync(file)) return null;
    const db = createClient({ url: `file:${file}` });
    try {
        const { rows } = await db.execute({
            sql: 'select username, password, deviceId, modeId, model from printer where ip = ?',
            args: [ip],
        });
        return (rows[0] as unknown as Creds | undefined) ?? null;
    } finally {
        db.close();
    }
}

async function credentials(ip: string): Promise<Creds & { source: string }> {
    const stored = await credsFromDatabase(ip);
    if (stored) return { ...stored, source: 'kobralink database' };
    const env = process.env;
    if (env.PROBE_USERNAME && env.PROBE_MODE_ID) {
        return {
            username: env.PROBE_USERNAME,
            password: env.PROBE_PASSWORD ?? '',
            deviceId: env.PROBE_DEVICE_ID ?? '',
            modeId: env.PROBE_MODE_ID,
            model: '',
            source: 'environment',
        };
    }
    return { ...(await fetchPrinterCredentials(ip)), source: '/ctrl' };
}

async function main() {
    const [ip, secondsArg, outArg] = process.argv.slice(2);
    if (!ip) {
        console.error('usage: bun dev/probe-printer.ts <printer-ip> [seconds=120] [out.json]');
        process.exit(1);
    }
    const seconds = Number(secondsArg ?? 120);
    const creds = await credentials(ip);
    const certsDir = process.env.KOBRALINK_CERTS_DIR ?? path.join(__dirname, '..', 'certs');
    const client = new KobraMqttClient({
        host: ip,
        username: creds.username,
        password: creds.password,
        deviceId: creds.deviceId,
        modeId: creds.modeId,
        cert: fs.readFileSync(path.join(certsDir, 'anycubic_slicer.crt')),
        key: fs.readFileSync(path.join(certsDir, 'anycubic_slicer.key')),
        clientId: `kobralink-probe-${randomBytes(3).toString('hex')}`,
    });

    const t0 = Date.now();
    const elapsed = () => Math.round((Date.now() - t0) / 100) / 10;
    const reports: { t: number; suffix: string; payload: unknown }[] = [];
    const perTopic = new Map<string, number>();
    client.on('report', (suffix, payload) => {
        const n = perTopic.get(suffix) ?? 0;
        perTopic.set(suffix, n + 1);
        if (n < REPORTS_PER_TOPIC) reports.push({ t: elapsed(), suffix, payload });
    });

    await client.connect();
    console.log(`connected to ${creds.model || 'printer'} (modeId ${creds.modeId}, credentials from ${creds.source})`);

    // Read-only on purpose: this runs on printers we do not own, possibly mid-print.
    const queries: { command: string; answered: boolean; reply: unknown }[] = [];
    const ask = async (command: string, run: () => Promise<unknown>) => {
        const reply = await run();
        queries.push({ command, answered: reply !== null, reply });
        console.log(`${reply === null ? '  no reply' : '  answered'}  ${command}`);
    };
    await ask('info/query', () => client.queryInfo());
    await ask('status/query', () => client.queryStatus());
    await ask('print/query', () => client.queryPrint());
    await ask('multiColorBox/getInfo', () => client.queryMultiColorBox());
    await ask('axis/query', () => client.queryAxis());
    await ask('skip/query_obj', () => client.querySkipObjects());
    client.queryLight();
    client.queryPeripherals();
    client.listLocalFiles();

    const positions: { t: number; reply: unknown }[] = [];
    while (elapsed() < seconds) {
        await sleep(5000);
        positions.push({ t: elapsed(), reply: (await client.queryAxis())?.data ?? null });
    }
    await client.disconnect();

    const capture = {
        probeVersion: 1,
        capturedAt: new Date().toISOString(),
        modeId: creds.modeId,
        model: creds.model,
        durationSec: seconds,
        queries,
        positions,
        reportCounts: Object.fromEntries(perTopic),
        reports,
    };
    const out = outArg ?? `kobralink-probe-${creds.modeId}-${Date.now()}.json`;
    const secrets = [creds.username, creds.password, creds.deviceId, ip];
    fs.writeFileSync(out, `${JSON.stringify(redactCapture(capture, secrets), null, 2)}\n`);
    console.log(`\nwrote ${path.resolve(out)} — check it, then attach it to a GitHub issue`);
    process.exit(0);
}

if (require.main === module) {
    main().catch((e) => {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
    });
}
