import path from 'node:path';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

const API = process.env.KOBRALINK_API_URL ?? 'http://localhost:7100';

export default defineConfig({
    plugins: [
        paraglideVitePlugin({
            project: '../../packages/i18n/project.inlang',
            outdir: './src/paraglide',
            strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
            outputStructure: 'message-modules',
            emitTsDeclarations: true,
            emitReadme: false,
            emitPrettierIgnore: false,
        }),
        tanstackRouter({ target: 'react', autoCodeSplitting: true }),
        react(),
        tailwindcss(),
        svgr({ svgrOptions: { svgProps: { fill: 'currentColor', 'aria-hidden': 'true' } } }),
    ],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: {
        proxy: {
            '/api': { target: API, changeOrigin: false },
        },
    },
    build: { outDir: 'dist', sourcemap: true },
});
