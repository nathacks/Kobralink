import { createFileRoute } from '@tanstack/react-router';
import { HistoryPage } from '@/components/pages/history-page';

export const Route = createFileRoute('/_app/history')({ component: HistoryPage });
