import type { Me } from '@/types';

/** Owners, staff, or anyone who owns or works at a business. */
export function isBusinessUser(user: Me | null): boolean {
  if (!user) return false;
  return user.role !== 'customer' || user.owned_businesses.length > 0 || user.staff_memberships.length > 0;
}

/** Can create or own a business. */
export function canOwnBusiness(user: Me | null): boolean {
  if (!user) return false;
  return user.role === 'owner' || user.owned_businesses.length > 0;
}

/** Where to send a user right after signing in. */
export function homePathFor(user: Me): string {
  return isBusinessUser(user) ? '/dashboard' : '/explore';
}

export function initialsOf(name: string | null | undefined, fallback = '?'): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback.charAt(0).toUpperCase();
  const letters = parts.length === 1 ? parts[0].charAt(0) : `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`;
  return letters.toUpperCase();
}
