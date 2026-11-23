import { createFileRoute } from '@tanstack/react-router';
import { QueuePage } from '@/components/pages/queue-page';

export const Route = createFileRoute('/_app/queue')({ component: QueuePage });
