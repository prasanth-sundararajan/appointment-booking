import { useQuery } from '@tanstack/react-query';
import { businessKeys, businessesService } from '@/services/businesses';
import type { ApiError, Business, StaffMembership } from '@/types';
import { useAuth } from './useAuth';

/** Businesses the current user owns (GET /api/me/businesses). */
export function useMyBusinesses() {
  const { user } = useAuth();
  const canOwn = user !== null && (user.role === 'owner' || user.owned_businesses.length > 0);
  return useQuery<Business[], ApiError>({
    queryKey: businessKeys.mine(),
    queryFn: businessesService.mine,
    enabled: canOwn,
  });
}

export interface DashboardBusiness {
  business: Business | undefined;
  isOwner: boolean;
  /** Set when the user works at this business as staff. */
  membership: StaffMembership | undefined;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * Resolve a business for /dashboard/b/:id/* pages.
 * Owners get the full record from GET /api/me/businesses/{id}; staff fall back to the public page by slug.
 */
export function useDashboardBusiness(businessId: number): DashboardBusiness {
  const { user } = useAuth();
  const isOwner = Boolean(user?.owned_businesses.some((b) => b.id === businessId));
  const membership = user?.staff_memberships.find((m) => m.business_id === businessId);
  const slug = membership?.business_slug ?? '';

  const ownerQuery = useQuery<Business, ApiError>({
    queryKey: businessKeys.mineById(businessId),
    queryFn: () => businessesService.getMine(businessId),
    enabled: isOwner,
  });
  const staffQuery = useQuery<Business, ApiError>({
    queryKey: businessKeys.bySlug(slug),
    queryFn: () => businessesService.getBySlug(slug),
    enabled: !isOwner && slug !== '',
  });

  const active = isOwner ? ownerQuery : staffQuery;
  const enabled = isOwner || slug !== '';

  return {
    business: enabled ? active.data : undefined,
    isOwner,
    membership,
    isLoading: enabled && active.isLoading,
    error: enabled ? active.error : null,
    refetch: () => {
      void active.refetch();
    },
  };
}
