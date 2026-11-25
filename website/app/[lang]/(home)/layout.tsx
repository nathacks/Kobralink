import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { toLang } from '@/lib/i18n';
import { baseOptions } from '@/lib/layout.shared';

export default async function Layout({ params, children }: LayoutProps<'/[lang]'>) {
    const lang = toLang((await params).lang);
    return <HomeLayout {...baseOptions(lang)}>{children}</HomeLayout>;
}
