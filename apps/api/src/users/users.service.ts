import { type CreateUserInput, type UpdateUserInput, USER_ROLES, type UserDto, type UserRole } from '@kobralink/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { hashPassword } from 'better-auth/crypto';
import { internalSignup, type KobralinkAuth } from '../auth/auth';
import type { User } from '../generated/prisma/client';
import { m } from '../i18n/locale';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auth: AuthService<KobralinkAuth>,
    ) {}

    async list(): Promise<UserDto[]> {
        const rows = await this.prisma.client.user.findMany({ orderBy: { createdAt: 'asc' } });
        return rows.map(toDto);
    }

    async create(input: CreateUserInput): Promise<UserDto> {
        const existing = await this.prisma.client.user.findFirst({ where: { email: input.email } });
        if (existing) throw new BadRequestException(m.api_user_exists());
        await internalSignup.run(true, () =>
            this.auth.api.signUpEmail({
                body: { name: input.name, email: input.email, password: input.password },
            }),
        );
        const row = await this.prisma.client.user.findFirst({ where: { email: input.email } });
        if (!row) throw new NotFoundException();
        const role = input.role ?? 'operator';
        const updated = await this.prisma.client.user.update({ where: { id: row.id }, data: { role } });
        return toDto(updated);
    }

    async update(id: string, input: UpdateUserInput, actorId: string): Promise<UserDto> {
        const row = await this.prisma.client.user.findUnique({ where: { id } });
        if (!row) throw new NotFoundException();
        if (input.role && input.role !== 'admin' && row.role === 'admin') {
            const admins = await this.prisma.client.user.count({ where: { role: 'admin' } });
            if (admins <= 1) throw new BadRequestException(m.api_last_admin());
            if (id === actorId) throw new BadRequestException(m.api_self_demote());
        }
        if (input.password) {
            const hash = await hashPassword(input.password);
            await this.prisma.client.account.updateMany({
                where: { userId: id, providerId: 'credential' },
                data: { password: hash },
            });
            if (id !== actorId) await this.prisma.client.session.deleteMany({ where: { userId: id } });
        }
        const updated = await this.prisma.client.user.update({
            where: { id },
            data: { ...(input.name ? { name: input.name } : {}), ...(input.role ? { role: input.role } : {}) },
        });
        return toDto(updated);
    }

    async remove(id: string, actorId: string): Promise<void> {
        if (id === actorId) throw new BadRequestException(m.api_self_delete());
        const row = await this.prisma.client.user.findUnique({ where: { id } });
        if (!row) throw new NotFoundException();
        if (row.role === 'admin') {
            const admins = await this.prisma.client.user.count({ where: { role: 'admin' } });
            if (admins <= 1) throw new BadRequestException(m.api_last_admin());
        }
        await this.prisma.client.user.delete({ where: { id } });
    }
}

function toDto(u: User): UserDto {
    const role = (USER_ROLES as readonly string[]).includes(u.role) ? (u.role as UserRole) : 'viewer';
    return { id: u.id, name: u.name, email: u.email, role, createdAt: u.createdAt.toISOString() };
}
