import path from 'node:path';
import { createMDX } from 'fumadocs-mdx/next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

const withMDX = createMDX();

/** @returns {import('next').NextConfig} */
export default (phase) =>
    withMDX({
        output: phase === PHASE_DEVELOPMENT_SERVER ? undefined : 'export',
        basePath: '/Kobralink',
        trailingSlash: true,
        images: { unoptimized: true },
        turbopack: { root: path.join(import.meta.dirname, '..') },
        experimental: { globalNotFound: true },
        reactStrictMode: true,
    });
