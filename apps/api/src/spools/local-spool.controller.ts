import {
    type LocalSpoolInput,
    localSpoolSchema,
    type SetLocalSpoolMapInput,
    setLocalSpoolMapSchema,
    type UpdateLocalSpoolInput,
    updateLocalSpoolSchema,
} from '@kobralink/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ZodPipe } from '../common/zod.pipe';
import { LocalSpoolService } from './local-spool.service';

@Controller('api/v1')
export class LocalSpoolController {
    constructor(private readonly spools: LocalSpoolService) {}

    @Get('spools')
    list(@Query('archived') archived?: string) {
        return this.spools.list(archived === 'true');
    }

    @Post('spools')
    create(@Body(new ZodPipe(localSpoolSchema)) body: LocalSpoolInput) {
        return this.spools.create(body);
    }

    @Patch('spools/:id')
    update(@Param('id') id: string, @Body(new ZodPipe(updateLocalSpoolSchema)) body: UpdateLocalSpoolInput) {
        return this.spools.update(id, body);
    }

    @Delete('spools/:id')
    @HttpCode(204)
    async remove(@Param('id') id: string) {
        await this.spools.remove(id);
    }

    @Get('printers/:id/spools')
    assignments(@Param('id') id: string) {
        return { slotSpools: this.spools.assignments(id) };
    }

    @Post('printers/:id/spools')
    async assign(@Param('id') id: string, @Body(new ZodPipe(setLocalSpoolMapSchema)) body: SetLocalSpoolMapInput) {
        return { slotSpools: await this.spools.setAssignments(id, body.slotMap) };
    }
}
