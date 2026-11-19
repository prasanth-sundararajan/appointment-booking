import type { Service, StaffMember } from '@/types';

export type OnboardingStepId = 'business' | 'services' | 'staff' | 'hours' | 'share';

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  done: boolean;
  /** In-app route for the step's action (absent for "share", which copies a link). */
  to?: string;
  actionLabel: string;
}

export interface OnboardingInput {
  businessId: number;
  services: Service[];
  staff: StaffMember[];
  /** Staff ids that have at least one weekly working-hours range. */
  staffIdsWithHours: number[];
  /** Any booking ever recorded (today, upcoming, this week or deposits). */
  hasBookings: boolean;
  /** Owner copied the public link from the dashboard. */
  linkShared: boolean;
}

/** Staff who can actually be booked: active and offering at least one service. */
export function bookableStaff(staff: StaffMember[]): StaffMember[] {
  return staff.filter((m) => m.is_active && m.service_ids.length > 0);
}

/**
 * Setup checklist for a business owner, derived only from existing API data:
 * business -> services -> staff with services assigned -> working hours -> share link.
 */
export function buildOnboardingSteps(input: OnboardingInput): OnboardingStep[] {
  const base = `/dashboard/b/${input.businessId}`;
  const hasServices = input.services.some((s) => s.is_active);
  const assigned = bookableStaff(input.staff);
  const hasAssignedStaff = assigned.length > 0;
  const hasHours = assigned.some((m) => input.staffIdsWithHours.includes(m.id));

  return [
    {
      id: 'business',
      title: 'Create your business',
      description: 'Your public page, timezone, deposit and cancellation rules.',
      done: true,
      to: `${base}/settings`,
      actionLabel: 'Review settings',
    },
    {
      id: 'services',
      title: 'Add your services',
      description: 'What customers can book, how long it takes and what it costs.',
      done: hasServices,
      to: `${base}/services`,
      actionLabel: 'Add a service',
    },
    {
      id: 'staff',
      title: 'Add staff and assign services',
      description: 'Invite your team (or yourself) and tick the services each person offers.',
      done: hasAssignedStaff,
      to: `${base}/staff`,
      actionLabel: input.staff.length > 0 ? 'Assign services' : 'Invite staff',
    },
    {
      id: 'hours',
      title: 'Set working hours',
      description: 'Slots are generated from each person’s weekly hours.',
      done: hasHours,
      to: hasAssignedStaff ? `${base}/availability?staff=${assigned[0].id}` : `${base}/availability`,
      actionLabel: 'Set hours',
    },
    {
      id: 'share',
      title: 'Share your booking link',
      description: 'Post it on social, your website or in messages to start taking bookings.',
      done: input.hasBookings || input.linkShared,
      actionLabel: 'Copy link',
    },
  ];
}

export function onboardingProgress(steps: OnboardingStep[]): { done: number; total: number; complete: boolean } {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, complete: done === steps.length };
}

const SHARED_KEY = (businessId: number) => `slotease:link-shared:${businessId}`;

export function readLinkShared(businessId: number): boolean {
  try {
    return window.localStorage.getItem(SHARED_KEY(businessId)) === '1';
  } catch {
    return false;
  }
}

export function writeLinkShared(businessId: number): void {
  try {
    window.localStorage.setItem(SHARED_KEY(businessId), '1');
  } catch {
    // Storage unavailable (private mode); the step simply stays open.
  }
}
