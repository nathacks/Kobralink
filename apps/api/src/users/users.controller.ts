import { type CreateUserInput, createUserSchema, type UpdateUserInput, updateUserSchema } from '@kobralink/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ZodPipe } from '../common/zod.pipe';
import { UsersService } from './users.service';

@Controller('api/v1/users')
@Roles(['admin'])
export class UsersController {
    constructor(private readonly users: UsersService) {}

    @Get()
    list() {
        return this.users.list();
    }

    @Post()
    create(@Body(new ZodPipe(createUserSchema)) body: CreateUserInput) {
        return this.users.create(body);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body(new ZodPipe(updateUserSchema)) body: UpdateUserInput,
        @Session() session: UserSession,
    ) {
        return this.users.update(id, body, session.user.id);
    }

    @Delete(':id')
    @HttpCode(204)
    async remove(@Param('id') id: string, @Session() session: UserSession) {
        await this.users.remove(id, session.user.id);
    }
}
