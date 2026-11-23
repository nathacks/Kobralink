export interface PrinterSpecs {
    modeId: string;
    name: string;
    buildVolumeMm: { x: number; y: number; z: number } | null;
    defaultNozzleMm: number | null;
    nozzleSizesMm: number[];
    maxNozzleC: number | null;
    maxBedC: number | null;
    ratedPowerW: number | null;
    ratedPowerByMainsW: { v110: number; v220: number } | null;
    ace: 'builtin' | 'optional' | 'none' | null;
    sources: string[];
}

export const ANYCUBIC_PRINTER_SPECS: readonly PrinterSpecs[] = [
    {
        modeId: '20024',
        name: 'Kobra 3',
        buildVolumeMm: { x: 250, y: 250, z: 260 },
        defaultNozzleMm: 0.4,
        nozzleSizesMm: [0.4, 0.6, 0.8],
        maxNozzleC: 300,
        maxBedC: 110,
        ratedPowerW: 400,
        ratedPowerByMainsW: null,
        ace: 'optional',
        sources: [
            'https://store.anycubic.com/products/anycubic-kobra-3',
            'https://wiki.anycubic.com/各机型说明书/k3系列/anycubic_kobra_3_user_manual-de-v1.0.pdf',
        ],
    },
    {
        modeId: '20025',
        name: 'Kobra S1',
        buildVolumeMm: { x: 250, y: 250, z: 250 },
        defaultNozzleMm: 0.4,
        nozzleSizesMm: [0.25, 0.4, 0.6, 0.8],
        maxNozzleC: 320,
        maxBedC: 120,
        ratedPowerW: null,
        ratedPowerByMainsW: { v110: 500, v220: 1500 },
        ace: 'optional',
        sources: [
            'https://store.anycubic.com/products/kobra-s1',
            'https://wiki.anycubic.com/s1-v2/Anycubic%20Kobra%20S1%20ACE%202%20Pro%20Combo%20User%20Manual-EN.pdf',
        ],
    },
    {
        modeId: '20026',
        name: 'Kobra 3 Max',
        buildVolumeMm: { x: 420, y: 420, z: 500 },
        defaultNozzleMm: 0.4,
        nozzleSizesMm: [0.4, 0.6, 0.8],
        maxNozzleC: 300,
        maxBedC: 90,
        ratedPowerW: 1100,
        ratedPowerByMainsW: null,
        ace: 'optional',
        sources: [
            'https://store.anycubic.com/products/kobra-3-max',
            'https://wiki.anycubic.com/k3-max/说明书/anycubic_kobra_3_max_combo_user_manual-fr-v1.0.pdf',
        ],
    },
    {
        modeId: '20027',
        name: 'Kobra 3 V2',
        buildVolumeMm: { x: 255, y: 255, z: 260 },
        defaultNozzleMm: 0.4,
        nozzleSizesMm: [0.4, 0.6, 0.8],
        maxNozzleC: 300,
        maxBedC: 110,
        ratedPowerW: null,
        ratedPowerByMainsW: null,
        ace: 'optional',
        sources: ['https://store.anycubic.com/products/kobra-3-v2'],
    },
    {
        modeId: '20028',
        name: 'Kobra 4',
        buildVolumeMm: { x: 260, y: 260, z: 260 },
        defaultNozzleMm: 0.4,
        nozzleSizesMm: [0.25, 0.4, 0.6, 0.8],
        maxNozzleC: 300,
        maxBedC: 100,
        ratedPowerW: null,
        ratedPowerByMainsW: { v110: 475, v220: 1450 },
        ace: 'optional',
        sources: [
            'https://store.anycubic.com/products/kobra-4-3d-printer',
            'https://wiki.anycubic.com/k4/Kobra%204%20Combo%20%E7%94%A8%E6%88%B7%E6%89%8B%E5%86%8C-EN-20260407.pdf',
        ],
    },
    {
        modeId: '20029',
        name: 'Kobra S1 Max',
        buildVolumeMm: { x: 350, y: 350, z: 350 },
        defaultNozzleMm: 0.4,
        nozzleSizesMm: [0.25, 0.4, 0.6, 0.8],
        maxNozzleC: 350,
        maxBedC: 120,
        ratedPowerW: null,
        ratedPowerByMainsW: { v110: 1000, v220: 2200 },
        ace: 'optional',
        sources: [
            'https://store.anycubic.com/products/kobra-s1-max',
            'https://wiki.anycubic.com/M02010206-Kobra%20S1%20Max%E7%94%A8%E6%88%B7%E6%89%8B%E5%86%8C-EN-260106.pdf',
        ],
    },
    {
        modeId: '20030',
        name: 'Kobra X',
        buildVolumeMm: { x: 260, y: 260, z: 260 },
        defaultNozzleMm: 0.4,
        nozzleSizesMm: [0.25, 0.4, 0.6, 0.8],
        maxNozzleC: 300,
        maxBedC: 100,
        ratedPowerW: null,
        ratedPowerByMainsW: { v110: 475, v220: 1450 },
        ace: 'builtin',
        sources: [
            'https://store.anycubic.com/products/kobra-x',
            'https://wiki.anycubic.com/kobra-x/M02010203-Kobra%20X%E7%94%A8%E6%88%B7%E6%89%8B%E5%86%8C-EN.pdf',
        ],
    },
];

export function printerSpecs(modeId: string | null | undefined): PrinterSpecs | null {
    if (!modeId) return null;
    return ANYCUBIC_PRINTER_SPECS.find((s) => s.modeId === modeId) ?? null;
}
