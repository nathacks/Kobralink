import { describe, expect, it } from 'bun:test';
import type { FilamentProfile } from '@kobralink/shared';
import {
    cleanProfileName,
    defaultFilamentName,
    effectiveSlotProfile,
    matchProfileByVendorFamily,
    parseCombinedRfidType,
    parseOrcaProfile,
} from '../src/filament/filament-library';

const lib: FilamentProfile[] = [
    { id: 'OGFL99', name: 'Generic PLA', vendor: 'Generic', type: 'PLA', color: '' },
    { id: 'OGFG99', name: 'Generic PETG', vendor: 'Generic', type: 'PETG', color: '' },
    { id: 'OGFL99', name: 'Generic PLA Silk', vendor: 'Generic', type: 'PLA', color: '' },
    { id: 'GEE01', name: 'Geeetech PLA Basic', vendor: 'Geeetech', type: 'PLA', color: '' },
    { id: 'GEE02', name: 'Geeetech PLA Matte', vendor: 'Geeetech', type: 'PLA', color: '' },
    { id: 'POLY1', name: 'PolyTerra PLA', vendor: 'Polymaker', type: 'PLA', color: '' },
    { id: 'POLY2', name: 'PolyLite PETG', vendor: 'Polymaker', type: 'PETG', color: '' },
];

describe('filament library', () => {
    it('strips printer suffixes from profile names', () => {
        expect(cleanProfileName('PolyTerra PLA @base')).toBe('PolyTerra PLA');
        expect(cleanProfileName('Anker Generic PLA 0.4 nozzle')).toBe('Anker Generic PLA');
    });

    it('picks the generic library profile for a material', () => {
        expect(defaultFilamentName('PLA SILK', lib)).toBe('Generic PLA Silk');
        expect(defaultFilamentName('petg', lib)).toBe('Generic PETG');
        expect(defaultFilamentName('WOOD', lib)).toBe('');
    });

    it('parses combined ACE RFID strings only when the vendor is known', () => {
        expect(parseCombinedRfidType('GEEETECH PLA Bas', lib)).toEqual({ vendor: 'Geeetech', family: 'PLA' });
        expect(parseCombinedRfidType('PLA', lib)).toEqual({ vendor: '', family: '' });
        expect(parseCombinedRfidType('UNKNOWN PLA', lib)).toEqual({ vendor: '', family: '' });
    });

    it('disambiguates same-family profiles with variant tokens', () => {
        expect(matchProfileByVendorFamily(lib, 'Geeetech', 'PLA', ['bas'])?.name).toBe('Geeetech PLA Basic');
        expect(matchProfileByVendorFamily(lib, 'Geeetech', 'PLA', ['mat'])?.name).toBe('Geeetech PLA Matte');
    });

    it('keeps a manual override while the material family matches, else falls back', () => {
        const override = { vendor: 'Polymaker', name: 'PolyLite PETG', id: 'POLY2' };
        expect(effectiveSlotProfile(lib, override, 'PETG')).toEqual({ profile: override, source: 'manual' });
        expect(effectiveSlotProfile(lib, override, 'PLA')).toEqual({ profile: null, source: 'none' });
        expect(effectiveSlotProfile(lib, override, 'GEEETECH PLA Mat')).toEqual({
            profile: { vendor: 'Geeetech', name: 'Geeetech PLA Matte', id: 'GEE02' },
            source: 'rfid',
        });
    });

    it('parses user Orca profiles resolving fields through the system parent', () => {
        const parsed = parseOrcaProfile(
            { type: 'filament', name: 'My PolyTerra @Anycubic Kobra X 0.4 nozzle', inherits: 'PolyTerra PLA @base' },
            lib,
        );
        expect(parsed).toEqual({ id: 'POLY1', name: 'My PolyTerra', vendor: 'Polymaker', type: 'PLA', color: '' });
        expect(parseOrcaProfile({ type: 'filament', name: 'Stub' }, lib)).toBeNull();
        expect(parseOrcaProfile({ type: 'machine', name: 'Printer' }, lib)).toBeNull();
    });
});
