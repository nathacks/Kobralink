import fs from 'node:fs';
import path from 'node:path';

export const RESTORE_DIR = 'restore-pending';
export const RESTART_EXIT_CODE = 75;

export function applyPendingRestore(dataDir: string, log: (m: string) => void): void {
    const pending = path.join(dataDir, RESTORE_DIR);
    if (!fs.existsSync(pending)) return;
    const db = path.join(pending, 'kobralink.db');
    if (!fs.existsSync(db)) {
        fs.rmSync(pending, { recursive: true, force: true });
        return;
    }
    log('Applying pending restore…');
    for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(path.join(dataDir, `kobralink.db${suffix}`), { force: true });
    }
    fs.renameSync(db, path.join(dataDir, 'kobralink.db'));
    const gcodes = path.join(pending, 'gcodes');
    if (fs.existsSync(gcodes)) {
        fs.rmSync(path.join(dataDir, 'gcodes'), { recursive: true, force: true });
        fs.renameSync(gcodes, path.join(dataDir, 'gcodes'));
    }
    const timelapses = path.join(pending, 'timelapses');
    if (fs.existsSync(timelapses)) {
        fs.rmSync(path.join(dataDir, 'timelapses'), { recursive: true, force: true });
        fs.renameSync(timelapses, path.join(dataDir, 'timelapses'));
    }
    fs.rmSync(pending, { recursive: true, force: true });
    log('Restore applied');
}
