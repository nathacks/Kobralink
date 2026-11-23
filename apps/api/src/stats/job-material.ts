const FILENAME_MATERIAL = /(?:^|[_\-\s])(PLA|PETG|ABS|ASA|TPU|PA|PC|PVA|HIPS)(?=[_\-\s.+]|$)/i;

export function jobMaterial(filaments: string | undefined, filename: string): string {
    try {
        const list = JSON.parse(filaments ?? '[]') as { material?: string; isUsed?: boolean }[];
        const used = list.find((f) => f.isUsed !== false && f.material) ?? list.find((f) => f.material);
        if (used?.material) return used.material;
    } catch {}
    return filename.match(FILENAME_MATERIAL)?.[1] ?? 'PLA';
}
