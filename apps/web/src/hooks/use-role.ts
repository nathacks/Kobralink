import { canOperate, isAdmin, type UserRole } from '@kobralink/shared';
import { useQuery } from '@tanstack/react-query';
import { sessionQuery } from '@/lib/session';

export function useRole(): UserRole {
    const session = useQuery(sessionQuery);
    const role = session.data?.user.role;
    return role === 'admin' || role === 'operator' || role === 'viewer' ? role : 'viewer';
}

export function useCanOperate(): boolean {
    return canOperate(useRole());
}

export function useIsAdmin(): boolean {
    return isAdmin(useRole());
}
