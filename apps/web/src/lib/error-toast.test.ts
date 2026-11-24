import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { errorToast } from '@/lib/error-toast';

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn() } }));

vi.mock('sonner', () => ({ toast }));

describe('errorToast', () => {
    beforeEach(() => toast.error.mockReset());

    it('shares the toast of the live event when the printer refused the command', () => {
        errorToast(new ApiError(502, 'Refused', undefined, 'p1:print:pause'));
        expect(toast.error).toHaveBeenCalledWith('Refused', { id: 'refused:p1:print:pause' });
    });

    it('shows any other error on its own', () => {
        errorToast(new ApiError(502, 'No response'));
        errorToast(new Error('boom'));
        expect(toast.error.mock.calls).toEqual([['No response'], ['boom']]);
    });
});
