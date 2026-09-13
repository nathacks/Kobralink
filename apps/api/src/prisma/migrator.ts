import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';

export async function applyMigrations(
    databaseUrl: string,
    migrationsDir: string,
    log: (m: string) => void,
): Promise<void> {
    const file = databaseUrl.replace(/^file:/, '');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = createClient({ url: `file:${file}` });
    try {
        await db.execute('PRAGMA journal_mode = WAL');
        await db.execute(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
            "id" TEXT PRIMARY KEY NOT NULL,
            "checksum" TEXT NOT NULL,
            "finished_at" DATETIME,
            "migration_name" TEXT NOT NULL,
            "logs" TEXT,
            "rolled_back_at" DATETIME,
            "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
            "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
        )`);
        const rows = await db.execute('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL');
        const applied = new Set(rows.rows.map((r) => String(r.migration_name)));
        if (!fs.existsSync(migrationsDir)) {
            log(`Dossier de migrations introuvable: ${migrationsDir}`);
            return;
        }
        const names = fs
            .readdirSync(migrationsDir)
            .filter((n) => fs.existsSync(path.join(migrationsDir, n, 'migration.sql')))
            .sort();
        for (const name of names) {
            if (applied.has(name)) continue;
            const sql = fs.readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8');
            const checksum = createHash('sha256').update(sql).digest('hex');
            const tx = await db.transaction('write');
            try {
                await tx.executeMultiple(sql);
                await tx.execute({
                    sql: `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
                          VALUES (?, ?, current_timestamp, ?, NULL, current_timestamp, 1)`,
                    args: [randomUUID(), checksum, name],
                });
                await tx.commit();
            } catch (e) {
                await tx.rollback();
                throw e;
            }
            log(`Migration appliquée: ${name}`);
        }
    } finally {
        db.close();
    }
}
