import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { m, zodErrorMap } from '../i18n/locale';

@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
    constructor(private readonly schema: ZodType<T>) {}

    transform(value: unknown): T {
        const result = this.schema.safeParse(value, { error: zodErrorMap });
        if (!result.success) {
            throw new BadRequestException({
                message: m.validation_failed(),
                issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
            });
        }
        return result.data;
    }
}
