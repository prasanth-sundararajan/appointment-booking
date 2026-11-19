import { toList } from '@/lib/list';
import type { ListResponse, StaffInvite, StaffInviteInfo, StaffMember, StaffMemberPublic, StaffUpdate } from '@/types';
import { del, get, post, put } from './api';

/** Query keys for staff (Module 3). */
export const staffKeys = {
  all: ['staff'] as const,
  byBusiness: (businessId: number) => ['staff', 'business', businessId] as const,
  allByBusiness: (businessId: number) => ['staff', 'business', businessId, 'all'] as const,
  invite: (token: string) => ['staff', 'invite', token] as const,
};

export const staffService = {
  /** GET /api/businesses/{id}/staff (public: id, display_name, service_ids) */
  list(businessId: number): Promise<StaffMemberPublic[]> {
    return get<ListResponse<StaffMemberPublic>>(`/api/businesses/${businessId}/staff`).then(toList);
  },

  /** GET /api/businesses/{id}/staff/all (owner, full records incl. inactive) */
  listAll(businessId: number): Promise<StaffMember[]> {
    return get<ListResponse<StaffMember>>(`/api/businesses/${businessId}/staff/all`).then(toList);
  },

  /** GET /api/staff/invites/{token} */
  invitePreview(token: string): Promise<StaffInviteInfo> {
    return get<StaffInviteInfo>(`/api/staff/invites/${encodeURIComponent(token)}`);
  },

  /** POST /api/businesses/{id}/staff (sends invite email) */
  invite(businessId: number, payload: StaffInvite): Promise<StaffMember> {
    return post<StaffMember, StaffInvite>(`/api/businesses/${businessId}/staff`, payload);
  },

  /** POST /api/staff/invites/{token}/accept */
  acceptInvite(token: string): Promise<StaffMember> {
    return post<StaffMember>(`/api/staff/invites/${encodeURIComponent(token)}/accept`);
  },

  /** PUT /api/staff/{id} */
  update(staffId: number, payload: StaffUpdate): Promise<StaffMember> {
    return put<StaffMember, StaffUpdate>(`/api/staff/${staffId}`, payload);
  },

  /** DELETE /api/staff/{id} (409 if future confirmed bookings) */
  remove(staffId: number): Promise<void> {
    return del<void>(`/api/staff/${staffId}`);
  },
};
