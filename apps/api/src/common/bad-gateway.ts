import { BadGatewayException } from '@nestjs/common';
import { BridgeRequestError } from '../bridge/printer-bridge';

export function badGateway(e: unknown): BadGatewayException {
    const message = e instanceof Error ? e.message : String(e);
    const refused = e instanceof BridgeRequestError ? e.refused : undefined;
    return new BadGatewayException({ statusCode: 502, error: 'Bad Gateway', message, refused });
}
