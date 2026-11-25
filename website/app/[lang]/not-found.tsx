'use client';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { useParams } from 'next/navigation';
import { NotFoundContent } from '@/components/not-found';
import { toLang } from '@/lib/i18n';
import { baseOptions } from '@/lib/layout.shared';

export default function NotFound() {
    const lang = toLang(useParams<{ lang?: string }>().lang);
    return (
        <HomeLayout {...baseOptions(lang)}>
            <NotFoundContent lang={lang} />
        </HomeLayout>
    );
}
