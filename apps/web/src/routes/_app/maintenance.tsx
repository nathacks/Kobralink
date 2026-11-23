import { createFileRoute } from '@tanstack/react-router';
import { MaintenancePage } from '@/components/pages/maintenance-page';

export const Route = createFileRoute('/_app/maintenance')({ component: MaintenancePage });
