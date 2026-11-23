const UPLOAD_STAMP = /^\d{8}-\d{6}-/;
const EXTENSION = /\.(gcode\.3mf|gcode|bgcode|3mf)$/i;
const PLATE = /^(.*?)_plate\((\d+)\)(?:_.*)?$/;
const SLICER_SUFFIX = /_[A-Z][A-Z0-9+-]*_\d+(?:\.\d+)?_(?:\d+d)?(?:\d+h)?(?:\d+m)?(?:\d+s)?$/;

export interface ParsedFilename {
    name: string;
    plate: number | null;
}

export function parseFilename(filename: string): ParsedFilename {
    const base = filename.split(/[\\/]/).pop() ?? filename;
    let stem = base.replace(UPLOAD_STAMP, '').replace(EXTENSION, '');
    let plate: number | null = null;
    const withPlate = PLATE.exec(stem);
    if (withPlate) {
        stem = withPlate[1];
        plate = Number(withPlate[2]);
    } else {
        stem = stem.replace(SLICER_SUFFIX, '');
    }
    const name = stem.replace(/[+_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { name: name || base, plate };
}
