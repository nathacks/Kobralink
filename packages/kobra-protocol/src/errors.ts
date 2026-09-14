export type KobraProtocolErrorCode =
    | 'http_status'
    | 'info_invalid'
    | 'ctrl_invalid'
    | 'upload_no_token'
    | 'upload_unexpected'
    | 'upload_timeout'
    | 'mqtt_closed_handshake';

export class KobraProtocolError extends Error {
    constructor(
        readonly code: KobraProtocolErrorCode,
        readonly params: Record<string, string | number> = {},
        message?: string,
    ) {
        super(message ?? `${code} ${JSON.stringify(params)}`);
        this.name = 'KobraProtocolError';
    }
}
