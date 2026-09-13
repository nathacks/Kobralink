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

export function rgbCss(c: [number, number, number]): string {
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export const KOBRA_STATE_LABEL: Record<string, string> = {
    free: 'Prête',
    busy: 'Occupée',
    printing: 'Impression',
    preheating: 'Préchauffage',
    auto_leveling: 'Nivellement',
    checking: 'Vérification',
    updated: 'Mise à jour',
    init: 'Initialisation',
    pausing: 'Mise en pause',
    paused: 'En pause',
    pause: 'En pause',
    resuming: 'Reprise',
    resumed: 'Reprise',
    stopping: 'Arrêt',
    stoped: 'Arrêtée',
    finished: 'Terminée',
    failed: 'Erreur',
    canceled: 'Annulée',
    offline: 'Hors ligne',
};
