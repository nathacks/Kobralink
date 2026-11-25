import type { Metadata } from 'next';
import { GlobalNotFoundBody } from '@/components/global-not-found';
import { outfit } from '@/lib/fonts';
import './global.css';

export const metadata: Metadata = { title: 'Page not found · Kobralink' };

export default function GlobalNotFound() {
    return (
        <html lang="en" className={outfit.className} suppressHydrationWarning>
            <body className="flex min-h-screen flex-col">
                <GlobalNotFoundBody />
            </body>
        </html>
    );
}
