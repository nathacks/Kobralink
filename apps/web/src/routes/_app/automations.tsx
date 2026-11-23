import { createFileRoute } from '@tanstack/react-router';
import { AutomationsPage } from '@/components/pages/automations-page';

export const Route = createFileRoute('/_app/automations')({ component: AutomationsPage });
