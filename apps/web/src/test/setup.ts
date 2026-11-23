import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';
import { setLocale } from '@/lib/i18n';

beforeAll(() => {
    setLocale('en');
});

afterEach(() => {
    cleanup();
});
