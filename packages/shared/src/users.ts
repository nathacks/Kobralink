import { z } from 'zod';

export const USER_ROLES = ['admin', 'operator', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface UserDto {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    createdAt: string;
}

export const createUserSchema = z.object({
    name: z.string().trim().min(1).max(64),
    email: z.email(),
    password: z.string().min(8).max(128),
    role: z.enum(USER_ROLES).default('operator'),
});
export type CreateUserInput = z.input<typeof createUserSchema>;

export const updateUserSchema = z.object({
    name: z.string().trim().min(1).max(64).optional(),
    role: z.enum(USER_ROLES).optional(),
    password: z.string().min(8).max(128).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export function canOperate(role: UserRole | undefined): boolean {
    return role === 'admin' || role === 'operator';
}

export function isAdmin(role: UserRole | undefined): boolean {
    return role === 'admin';
}
