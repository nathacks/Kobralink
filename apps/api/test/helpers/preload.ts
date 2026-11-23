import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kobralink-test-'));
process.env.KOBRALINK_DATA_DIR = dir;
process.env.BETTER_AUTH_SECRET = 'test-secret-test-secret-test-secret-1234';
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
