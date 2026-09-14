import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

export function useDesktopNavigation() {
    const navigate = useNavigate();

    useEffect(() => {
        const onNav = (ev: Event) => {
            const to = (ev as CustomEvent<string>).detail;
            if (typeof to === 'string') void navigate({ to });
        };
        window.addEventListener('kobralink:navigate', onNav);
        return () => window.removeEventListener('kobralink:navigate', onNav);
    }, [navigate]);
}
