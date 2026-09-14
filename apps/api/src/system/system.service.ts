import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import type { BackupInfoDto, SystemInfoDto } from '@kobralink/shared';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { loadEnv } from '../config/env';
import { m } from '../i18n/locale';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { RESTART_EXIT_CODE, RESTORE_DIR } from './restore';

const UPDATE_TTL_MS = 6 * 60 * 60_000;
const startedAt = Date.now();

@Injectable()
export class SystemService {
    private readonly log = new Logger(SystemService.name);
    private readonly env = loadEnv();
    private updateCache: { at: number; result: SystemInfoDto['update'] } | null = null;
    readonly version = readVersion();

    constructor(
        private readonly prisma: PrismaService,
        private readonly settings: SettingsService,
    ) {}

    async info(): Promise<SystemInfoDto> {
        return {
            version: this.version,
            runtime: process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`,
            platform: `${process.platform} ${process.arch}`,
            dataDir: this.env.dataDir,
            uptimeSec: Math.round((Date.now() - startedAt) / 1000),
            packaged: packaged(),
            update: this.settings.get().updateCheck ? await this.checkUpdate() : null,
        };
    }

    async checkUpdate(force = false): Promise<SystemInfoDto['update']> {
        const repo = process.env.KOBRALINK_UPDATE_REPO ?? 'NatHacks/Kobralink';
        if (!repo) return null;
        if (!force && this.updateCache && Date.now() - this.updateCache.at < UPDATE_TTL_MS)
            return this.updateCache.result;
        let result: SystemInfoDto['update'] = { checked: false, available: false, latest: '', url: '' };
        try {
            const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
                headers: { accept: 'application/vnd.github+json', 'user-agent': `kobralink/${this.version}` },
                signal: AbortSignal.timeout(8000),
            });
            if (res.ok) {
                const body = (await res.json()) as { tag_name?: string; html_url?: string };
                const latest = (body.tag_name ?? '').replace(/^v/, '');
                result = {
                    checked: true,
                    available: Boolean(latest) && compareSemver(latest, this.version) > 0,
                    latest,
                    url: body.html_url ?? `https://github.com/${repo}/releases`,
                };
            }
        } catch (e) {
            this.log.debug(`Update check failed: ${(e as Error).message}`);
        }
        this.updateCache = { at: Date.now(), result };
        return result;
    }

    async backupInfo(): Promise<BackupInfoDto> {
        const [printers, files, jobs, timelapses] = await Promise.all([
            this.prisma.client.printer.count(),
            this.prisma.client.gcodeFile.count(),
            this.prisma.client.printJob.count(),
            this.prisma.client.timelapse.count(),
        ]);
        return { printers, files, jobs, timelapses, sizeBytes: dirSize(this.env.gcodeDir) + fileSize(this.dbPath()) };
    }

    private dbPath(): string {
        return this.env.databaseUrl.replace(/^file:/, '');
    }

    async writeBackup(out: Writable, includeTimelapses: boolean): Promise<void> {
        await this.prisma.client.$executeRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)').catch(() => null);
        const zip = new Zip((err, chunk, final) => {
            if (err) {
                out.destroy(err);
                return;
            }
            out.write(Buffer.from(chunk));
            if (final) out.end();
        });
        const addFile = (name: string, file: string, compress: boolean) =>
            new Promise<void>((resolve, reject) => {
                const entry = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
                entry.mtime = fs.statSync(file).mtime;
                zip.add(entry);
                const rs = fs.createReadStream(file);
                rs.on('data', (chunk) =>
                    entry.push(Buffer.isBuffer(chunk) ? new Uint8Array(chunk) : new TextEncoder().encode(chunk)),
                );
                rs.on('end', () => {
                    entry.push(new Uint8Array(0), true);
                    resolve();
                });
                rs.on('error', reject);
            });
        const manifest = new ZipDeflate('manifest.json');
        zip.add(manifest);
        manifest.push(
            new TextEncoder().encode(JSON.stringify({ version: this.version, createdAt: new Date().toISOString() })),
            true,
        );
        await addFile('kobralink.db', this.dbPath(), true);
        for (const name of listFiles(this.env.gcodeDir)) {
            await addFile(`gcodes/${name}`, path.join(this.env.gcodeDir, name), false);
        }
        if (includeTimelapses) {
            const root = path.join(this.env.dataDir, 'timelapses');
            for (const id of listDirs(root)) {
                for (const f of listFiles(path.join(root, id))) {
                    await addFile(`timelapses/${id}/${f}`, path.join(root, id, f), false);
                }
            }
        }
        zip.end();
    }

    async stageRestore(data: Buffer): Promise<{ files: number }> {
        const staging = path.join(this.env.dataDir, `${RESTORE_DIR}.tmp`);
        fs.rmSync(staging, { recursive: true, force: true });
        fs.mkdirSync(staging, { recursive: true });
        let count = 0;
        let hasDb = false;
        await new Promise<void>((resolve, reject) => {
            const unzip = new Unzip((file) => {
                const rel = file.name.replace(/\\/g, '/');
                if (rel.endsWith('/') || rel.includes('..') || rel.startsWith('/')) return;
                if (!/^(kobralink\.db|manifest\.json|gcodes\/[^/]+|timelapses\/[^/]+\/[^/]+)$/.test(rel)) return;
                const target = path.join(staging, rel);
                fs.mkdirSync(path.dirname(target), { recursive: true });
                const ws = fs.createWriteStream(target);
                file.ondata = (err, chunk, final) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    ws.write(Buffer.from(chunk));
                    if (final) {
                        ws.end();
                        count += 1;
                        if (rel === 'kobralink.db') hasDb = true;
                    }
                };
                file.start();
            });
            unzip.register(UnzipInflate);
            try {
                unzip.push(new Uint8Array(data), true);
                setTimeout(resolve, 100);
            } catch (e) {
                reject(e);
            }
        });
        if (!hasDb) {
            fs.rmSync(staging, { recursive: true, force: true });
            throw new BadRequestException(m.api_backup_invalid());
        }
        const pending = path.join(this.env.dataDir, RESTORE_DIR);
        fs.rmSync(pending, { recursive: true, force: true });
        fs.renameSync(staging, pending);
        this.log.warn(`Restore staged (${count} files) — restarting`);
        return { files: count };
    }

    scheduleRestart(): void {
        setTimeout(() => process.exit(RESTART_EXIT_CODE), 800);
    }
}

function readVersion(): string {
    if (process.env.KOBRALINK_VERSION) return process.env.KOBRALINK_VERSION;
    for (const dir of [path.resolve(__dirname, '..', '..'), path.resolve(__dirname, '..', '..', '..')]) {
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { version?: string };
            if (pkg.version) return pkg.version;
        } catch {}
    }
    return '0.0.0';
}

function packaged(): SystemInfoDto['packaged'] {
    const v = process.env.KOBRALINK_PACKAGED;
    return v === 'docker' || v === 'electron' ? v : 'source';
}

function compareSemver(a: string, b: string): number {
    const pa = a.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
    const pb = b.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
    for (let i = 0; i < 3; i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d) return d;
    }
    return 0;
}

function listFiles(dir: string): string[] {
    try {
        return fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((e) => e.isFile())
            .map((e) => e.name);
    } catch {
        return [];
    }
}

function listDirs(dir: string): string[] {
    try {
        return fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
    } catch {
        return [];
    }
}

function fileSize(p: string): number {
    try {
        return fs.statSync(p).size;
    } catch {
        return 0;
    }
}

function dirSize(dir: string): number {
    return listFiles(dir).reduce((a, f) => a + fileSize(path.join(dir, f)), 0);
}
