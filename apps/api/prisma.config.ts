import path from 'node:path';
import { defineConfig } from 'prisma/config';

const dataDir = process.env.KOBRALINK_DATA_DIR
    ? path.resolve(process.env.KOBRALINK_DATA_DIR)
    : path.resolve(__dirname, '../../data');

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: { path: 'prisma/migrations' },
    datasource: {
        url: process.env.DATABASE_URL ?? `file:${path.join(dataDir, 'kobralink.db')}`,
    },
});
