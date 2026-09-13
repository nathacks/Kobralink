import { type FilamentProfile, materialFamily, normalizeMaterial, type SlotProfileRef } from '@kobralink/shared';

export const GATE_TEMP: Record<string, number> = {
    PLA: 210,
    PETG: 230,
    ABS: 240,
    ASA: 250,
    TPU: 220,
    PA: 260,
    PC: 270,
    HIPS: 220,
};

export const TRAY_INFO_IDX: Record<string, string> = {
    PLA: 'GFPLA',
    'PLA+': 'GFPLA+',
    'PLA SILK': 'GFPLA Silk',
    'PLA MATTE': 'GFPLA',
    'PLA MARBLE': 'GFPLA',
    'PLA WOOD': 'GFPLA',
    PETG: 'GFPETG',
    'PETG+': 'GFPETG',
    ABS: 'GFABS',
    ASA: 'GFASA',
    TPU: 'GFTPU 95A',
    PVA: 'GFPVA',
    'PLA CF': 'OGFL98',
    'PETG CF': 'OGFG98',
    PA: 'OGFN99',
    'PA CF': 'OGFN98',
    PC: 'OGFC99',
    HIPS: 'OGFS98',
};

const VARIANT_GENERIC: Record<string, string> = {
    'PLA SILK': 'Generic PLA Silk',
    'PLA MATTE': 'Generic PLA Matte',
    'PLA+': 'Generic PLA',
    'PLA CF': 'Generic PLA-CF',
    'PETG CF': 'Generic PETG-CF',
};

export { materialFamily, normalizeMaterial };

export function cleanProfileName(raw: string): string {
    let name = raw.replace(/\s*@.*$/, '').trim();
    name = name.replace(/\s+\d+(\.\d+)?\s*nozzle\s*$/i, '').trim();
    return name || raw;
}

export function defaultFilamentName(material: string, library: FilamentProfile[]): string {
    if (!material) return '';
    const mat = normalizeMaterial(material);
    const variant = VARIANT_GENERIC[mat];
    if (variant && library.some((p) => p.vendor === 'Generic' && p.name === variant)) return variant;
    const matchType = (p: FilamentProfile) => {
        const t = (p.type || '').toUpperCase();
        return t === mat || t.startsWith(`${mat}-`) || t.startsWith(`${mat} `);
    };
    const generic = library.find((p) => p.vendor === 'Generic' && p.name.startsWith('Generic ') && matchType(p));
    return generic?.name ?? '';
}

export function lookupFilamentId(library: FilamentProfile[], vendor: string, name: string): string {
    return library.find((p) => p.vendor === vendor && p.name === name)?.id ?? '';
}

export function profileMaterial(library: FilamentProfile[], ref: SlotProfileRef | null): string {
    if (!ref?.name) return '';
    return library.find((p) => p.vendor === ref.vendor && p.name === ref.name)?.type ?? '';
}

export function parseCombinedRfidType(raw: string, library: FilamentProfile[]): { vendor: string; family: string } {
    const tokens = raw.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return { vendor: '', family: '' };
    const first = tokens[0].toLowerCase();
    const vendor = library.find((p) => p.vendor.toLowerCase() === first)?.vendor ?? '';
    if (!vendor) return { vendor: '', family: '' };
    const family = materialFamily(tokens.slice(1).join(' '));
    return family ? { vendor, family } : { vendor: '', family: '' };
}

function rfidVariantTokens(raw: string): string[] {
    return raw
        .split(/\s+/)
        .filter(Boolean)
        .slice(2)
        .map((t) => t.toLowerCase());
}

export function matchProfileByVendorFamily(
    library: FilamentProfile[],
    vendor: string,
    family: string,
    variantTokens: string[] = [],
): FilamentProfile | null {
    const matches = library.filter(
        (p) => p.vendor.toLowerCase() === vendor.toLowerCase() && materialFamily(p.type) === family,
    );
    if (!matches.length) return null;
    if (matches.length === 1 || !variantTokens.length) return matches[0];
    let best = matches[0];
    let bestScore = -1;
    for (const p of matches) {
        const lower = p.name.toLowerCase();
        const words = lower.split(/\s+/);
        let score = 0;
        for (const tok of variantTokens) {
            if (words.some((w) => w.startsWith(tok))) score += 2;
            else if (lower.includes(tok)) score += 1;
        }
        if (score > bestScore) {
            bestScore = score;
            best = p;
        }
    }
    return best;
}

export function effectiveSlotProfile(
    library: FilamentProfile[],
    override: SlotProfileRef | null,
    amsMaterial: string,
): { profile: SlotProfileRef | null; source: 'manual' | 'rfid' | 'none' } {
    const { vendor, family } = parseCombinedRfidType(amsMaterial, library);
    const plain = family || amsMaterial;
    if (override?.name) {
        const profFam = materialFamily(profileMaterial(library, override));
        const amsFam = materialFamily(plain);
        if (!(profFam && amsFam && profFam !== amsFam)) return { profile: override, source: 'manual' };
    }
    if (vendor) {
        const auto = matchProfileByVendorFamily(library, vendor, family, rfidVariantTokens(amsMaterial));
        if (auto?.name) return { profile: { vendor: auto.vendor, name: auto.name, id: auto.id }, source: 'rfid' };
    }
    return { profile: null, source: 'none' };
}

function firstStr(v: unknown, fallback = ''): string {
    if (Array.isArray(v)) return v.length ? String(v[0]) : fallback;
    if (typeof v === 'string') return v;
    return fallback;
}

function isEmpty(v: unknown): boolean {
    return v === undefined || v === null || v === '' || (Array.isArray(v) && (v.length === 0 || v[0] === ''));
}

export function parseOrcaProfile(data: unknown, systemIndex: FilamentProfile[]): FilamentProfile | null {
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    if (d.type !== undefined && d.type !== 'filament' && !d.inherits) return null;
    if (d.type === 'filament' && d.inherits === undefined && !d.filament_id) return null;
    if (typeof d.instantiation === 'string' && d.instantiation.toLowerCase() === 'false') return null;

    const byName = new Map<string, FilamentProfile>();
    for (const p of systemIndex) byName.set(p.name, p);
    const parent = typeof d.inherits === 'string' && d.inherits ? byName.get(cleanProfileName(d.inherits)) : undefined;
    const mapping: Record<string, keyof FilamentProfile> = {
        filament_id: 'id',
        filament_vendor: 'vendor',
        filament_type: 'type',
        default_filament_colour: 'color',
    };
    const resolve = (key: string): string => {
        if (!isEmpty(d[key])) return firstStr(d[key]);
        return parent ? String(parent[mapping[key]] ?? '') : '';
    };

    const id = resolve('filament_id');
    if (!id) return null;
    return {
        id,
        name: cleanProfileName(firstStr(d.name, id)),
        vendor: resolve('filament_vendor') || 'Generic',
        type: resolve('filament_type'),
        color: resolve('default_filament_colour'),
    };
}
