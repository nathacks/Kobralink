import { defineConfig } from 'tsdown';

export default defineConfig((options) => ({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: !options.watch,
    sourcemap: true,
}));
