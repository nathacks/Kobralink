'use client';
import type { I18nProviderProps } from 'fumadocs-ui/contexts/i18n';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import SearchDialog from '@/components/search';

export function Provider({ i18n, children }: { i18n?: I18nProviderProps; children: ReactNode }) {
    const pathname = usePathname();
    const onLocaleChange = (lang: string) => {
        window.location.assign(`/Kobralink/${lang}${pathname.replace(/^\/[^/]+/, '')}`);
    };
    return (
        <RootProvider i18n={i18n && { ...i18n, onLocaleChange }} search={{ SearchDialog }}>
            {children}
        </RootProvider>
    );
}
