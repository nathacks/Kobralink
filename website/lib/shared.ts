import { createGetUrl } from 'fumadocs-core/source';
import { i18n } from './i18n';

export const appName = 'Kobralink';
export const siteUrl = 'https://nathacks.github.io/Kobralink';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';

export const gitConfig = {
    user: 'NatHacks',
    repo: 'Kobralink',
    branch: 'main',
};

const getImageUrl = createGetUrl(docsImageRoute, i18n);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
    const segments = [...page.slugs, 'image.png'];

    return { segments, url: getImageUrl(segments, page.locale) };
}
