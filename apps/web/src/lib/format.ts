export function formatDuration(sec: number): string {
    if (!sec || sec < 0) return '—';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h) return `${h} h ${m.toString().padStart(2, '0')} min`;
    if (m) return `${m} min`;
    return `${Math.round(sec)} s`;
}

export function formatBytes(n: number): string {
    if (n < 1024) return `${n} o`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
    return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatMinutes(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? `${h} h ${m.toString().padStart(2, '0')}` : `${m} min`;
}

export function greeting(now = new Date()): string {
    const h = now.getHours();
    if (h < 6) return 'Bonne nuit';
    if (h < 18) return 'Bonjour';
    return 'Bonsoir';
}
