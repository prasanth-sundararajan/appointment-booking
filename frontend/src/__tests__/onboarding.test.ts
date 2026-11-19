import { describe, expect, it } from 'vitest';
import { buildOnboardingSteps, onboardingProgress, type OnboardingInput } from '@/lib/onboarding';
import type { Service, StaffMember } from '@/types';

const ts = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
const svc: Service = { id: 10, business_id: 1, name: 'Cut', description: null, duration_minutes: 30, price_minor: 2000, is_active: true, ...ts };
const member = (id: number, serviceIds: number[], active = true): StaffMember => ({
  id,
  business_id: 1,
  user_id: 5,
  display_name: `Staff ${id}`,
  email: `s${id}@example.com`,
  is_active: active,
  service_ids: serviceIds,
  ...ts,
});

function input(overrides: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    businessId: 1,
    services: [],
    staff: [],
    staffIdsWithHours: [],
    hasBookings: false,
    linkShared: false,
    ...overrides,
  };
}

const doneMap = (i: OnboardingInput) => Object.fromEntries(buildOnboardingSteps(i).map((s) => [s.id, s.done]));

describe('buildOnboardingSteps', () => {
  it('orders steps business -> services -> staff -> hours -> share', () => {
    expect(buildOnboardingSteps(input()).map((s) => s.id)).toEqual(['business', 'services', 'staff', 'hours', 'share']);
  });

  it('a new business only has the business step done', () => {
    expect(doneMap(input())).toEqual({ business: true, services: false, staff: false, hours: false, share: false });
    expect(onboardingProgress(buildOnboardingSteps(input()))).toEqual({ done: 1, total: 5, complete: false });
  });

  it('inactive services do not count', () => {
    expect(doneMap(input({ services: [{ ...svc, is_active: false }] })).services).toBe(false);
    expect(doneMap(input({ services: [svc] })).services).toBe(true);
  });

  it('staff only counts once they have services assigned and are active', () => {
    expect(doneMap(input({ staff: [member(1, [])] })).staff).toBe(false);
    expect(doneMap(input({ staff: [member(1, [10], false)] })).staff).toBe(false);
    expect(doneMap(input({ staff: [member(1, [10])] })).staff).toBe(true);
  });

  it('hours must belong to a bookable staff member', () => {
    expect(doneMap(input({ staff: [member(1, [])], staffIdsWithHours: [1] })).hours).toBe(false);
    expect(doneMap(input({ staff: [member(1, [10])], staffIdsWithHours: [1] })).hours).toBe(true);
  });

  it('share is done after any booking or once the link was copied', () => {
    expect(doneMap(input({ hasBookings: true })).share).toBe(true);
    expect(doneMap(input({ linkShared: true })).share).toBe(true);
  });

  it('points actions at the right dashboard routes', () => {
    const steps = buildOnboardingSteps(input({ staff: [member(7, [10])] }));
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(byId.services.to).toBe('/dashboard/b/1/services');
    expect(byId.staff.to).toBe('/dashboard/b/1/staff');
    expect(byId.staff.actionLabel).toBe('Assign services');
    expect(byId.hours.to).toBe('/dashboard/b/1/availability?staff=7');
  });

  it('is complete when everything is set up', () => {
    const steps = buildOnboardingSteps(
      input({ services: [svc], staff: [member(1, [10])], staffIdsWithHours: [1], hasBookings: true }),
    );
    expect(onboardingProgress(steps).complete).toBe(true);
  });
});
