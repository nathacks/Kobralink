import { describe, expect, it } from 'bun:test';
import { KobraProtocolError } from '@kobralink/kobra-protocol';
import {
    installI18n,
    printerErrorText,
    printerRefusedMessage,
    protocolErrorMessage,
    runWithLocale,
    uploadRefusedMessage,
} from '../src/i18n/locale';

installI18n();

const inEnglish = <T>(fn: () => T): T => runWithLocale('en', fn);
const refused = (code: number, msg = '') =>
    protocolErrorMessage(new KobraProtocolError('upload_refused', { code, msg }, `refused ${code}`));

describe('upload refusals', () => {
    it('explain a full printer storage', () => {
        expect(inEnglish(() => refused(19010))).toBe('Not enough space on the printer for this file (code 19010)');
    });

    it('explain a refused file name or type', () => {
        expect(inEnglish(() => refused(19007))).toBe('The printer refused the file name or type (code 19007)');
    });

    it('explain a file the printer could not save', () => {
        for (const code of [19008, 19009]) {
            expect(inEnglish(() => refused(code))).toBe(`The printer could not save the file (code ${code})`);
        }
    });

    it('show the code and the printer message for any other refusal', () => {
        expect(inEnglish(() => refused(19001, 'busy'))).toBe('The printer refused the upload (code 19001). busy');
        expect(inEnglish(() => refused(19011))).toBe('The printer refused the upload (code 19011).');
    });

    it('follow the request language', () => {
        expect(runWithLocale('pt-br', () => uploadRefusedMessage(19010, ''))).toBe(
            'Não há espaço suficiente na impressora para este arquivo (código 19010)',
        );
        expect(runWithLocale('fr', () => uploadRefusedMessage(19010, ''))).toBe(
            "Pas assez d'espace sur l'imprimante pour ce fichier (code 19010)",
        );
    });
});

describe('/ctrl refusals', () => {
    const ctrl = (code: 'ctrl_limit' | 'ctrl_refused', status: number) =>
        protocolErrorMessage(new KobraProtocolError(code, { code: status }));

    it('explain the connection limit', () => {
        expect(inEnglish(() => ctrl('ctrl_limit', 19002))).toBe(
            'The printer has reached its LAN connection limit (code 19002). Disconnect another LAN client, such as Anycubic Slicer Next, then try again.',
        );
        expect(runWithLocale('pt-br', () => ctrl('ctrl_limit', 19002))).toStartWith(
            'A impressora atingiu o limite de conexões LAN (código 19002)',
        );
    });

    it('show the code of any other refusal', () => {
        expect(inEnglish(() => ctrl('ctrl_refused', 19001))).toBe(
            'The printer refused the credentials request (code 19001)',
        );
    });
});

describe('printer error codes', () => {
    it('explain a known code in the request language', () => {
        expect(inEnglish(() => printerErrorText(10402, 'Insufficient supplies'))).toBe('Out of filament');
        expect(runWithLocale('pt-br', () => printerErrorText('10402', 'Insufficient supplies'))).toBe(
            'O filamento acabou',
        );
    });

    it('keep the printer message for an unknown code', () => {
        expect(inEnglish(() => printerErrorText(19999, 'Something new'))).toBe('Something new');
        expect(inEnglish(() => printerErrorText(undefined, 'No code'))).toBe('No code');
    });

    it('build the refusal message with the code and the explanation', () => {
        expect(inEnglish(() => printerRefusedMessage(10901, 'Zeroing operation not performed'))).toBe(
            'Refused by the printer (code 10901): Home the axes first',
        );
        expect(inEnglish(() => printerRefusedMessage(undefined, 'busy'))).toBe('Refused by the printer (code ?): busy');
    });
});
