import { createFileRoute } from '@tanstack/react-router';
import { FilesPage } from '@/components/pages/files-page';

export const Route = createFileRoute('/_app/files')({ component: FilesPage });
