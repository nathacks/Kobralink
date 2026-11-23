import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

export function testQueryClient(): QueryClient {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

export async function renderWithProviders(
    ui: ReactNode,
    { queryClient = testQueryClient(), path = '/' }: { queryClient?: QueryClient; path?: string } = {},
) {
    const rootRoute = createRootRoute({ component: () => <div data-testid="rendered">{ui}</div> });
    const router = createRouter({
        routeTree: rootRoute,
        history: createMemoryHistory({ initialEntries: [path] }),
    });
    const result = render(
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    await screen.findByTestId('rendered');
    return { ...result, queryClient, router };
}
