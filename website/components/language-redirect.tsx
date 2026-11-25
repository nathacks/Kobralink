'use client';
import { useEffect } from 'react';
import { pickLang } from '@/lib/i18n';

export function LanguageRedirect() {
    useEffect(() => {
        window.location.replace(`/Kobralink/${pickLang(navigator.languages)}/`);
    }, []);
    return null;
}
