import { useQuery } from '@tanstack/react-query';
import { systemInfoQuery } from '@/lib/queries';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '']);

export function useHosts(): string[] {
    const info = useQuery(systemInfoQuery);
    const current = window.location.hostname;
    const lan = info.data?.lanIps ?? [];
    const hosts = LOCAL_HOSTS.has(current) ? lan : [current, ...lan.filter((h) => h !== current)];
    return hosts.length ? hosts : ['localhost'];
}
