// Shared TypeScript types mirroring the SlotEase backend models (see PRPs/slotease-prp.md).
// All timestamps are ISO-8601 strings in UTC. Money is integer minor units.

export type ISODateTime = string;
/** "HH:MM" or "HH:MM:SS" */
export type TimeOfDay = string;
/** "YYYY-MM-DD" */
export type ISODate = string;

// ---------- Enums ----------
export type UserRole = 'customer' | 'owner' | 'staff';
export type OAuthProvider = 'google';
export type BusinessCategory = 'salon' | 'clinic' | 'fitness' | 'consulting' | 'education' | 'other';
export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'expired';
export type CancelledBy = 'customer' | 'business';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refund_pending' | 'refunded';
export type PaymentProvider = 'dodo';
/** 0 = Monday ... 6 = Sunday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type BookingScope = 'upcoming' | 'past';

export const BUSINESS_CATEGORIES: readonly BusinessCategory[] = [
  'salon',
  'clinic',
  'fitness',
  'consulting',
  'education',
  'other',
];

// ---------- Base ----------
export interface Timestamps {
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

// ---------- Auth / User ----------
export interface User extends Timestamps {
  id: number;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
  oauth_provider: OAuthProvider | null;
}

export interface BusinessSummary {
  id: number;
  name: string;
  slug: string;
}

export interface StaffMembership {
  staff_id: number;
  business_id: number;
  business_name: string;
  business_slug: string;
}

/** GET /auth/me */
export interface Me extends User {
  owned_businesses: BusinessSummary[];
  staff_memberships: StaffMembership[];
}

export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  role: Extract<UserRole, 'customer' | 'owner'>;
}

// ---------- Business ----------
export interface Business extends Timestamps {
  id: number;
  owner_id: number;
  name: string;
  slug: string;
  description: string | null;
  category: BusinessCategory;
  city: string;
  /** IANA timezone, e.g. "Europe/London" */
  timezone: string;
  /** ISO 4217 code, e.g. "USD" */
  currency: string;
  /** 10-100, default 20 */
  deposit_percent: number;
  /** >= 0, default 8 */
  cancellation_cutoff_hours: number;
  booking_buffer_minutes: number;
  min_notice_hours: number;
  max_advance_days: number;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
  is_active: boolean;
}

/** GET /api/businesses/{slug} */
export interface BusinessPublic extends Business {
  services: Service[];
  staff: StaffMemberPublic[];
}

export type BusinessCreate = Pick<Business, 'name' | 'category' | 'city' | 'timezone' | 'currency'> &
  Partial<
    Pick<
      Business,
      | 'description'
      | 'deposit_percent'
      | 'cancellation_cutoff_hours'
      | 'booking_buffer_minutes'
      | 'min_notice_hours'
      | 'max_advance_days'
      | 'phone'
      | 'email'
      | 'address'
      | 'logo_url'
    >
  >;

export type BusinessUpdate = Partial<BusinessCreate>;

export interface BusinessSearchParams {
  q?: string;
  category?: BusinessCategory;
  city?: string;
  page?: number;
}

// ---------- Service ----------
export interface Service extends Timestamps {
  id: number;
  business_id: number;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_minor: number;
  is_active: boolean;
}

export type ServiceCreate = Pick<Service, 'name' | 'duration_minutes' | 'price_minor'> &
  Partial<Pick<Service, 'description' | 'is_active'>>;

export type ServiceUpdate = Partial<ServiceCreate>;

// ---------- Staff ----------
export interface StaffMember extends Timestamps {
  id: number;
  business_id: number;
  user_id: number | null;
  display_name: string;
  email: string;
  is_active: boolean;
  service_ids: number[];
}

export type StaffMemberPublic = Pick<StaffMember, 'id' | 'business_id' | 'display_name' | 'service_ids'>;

export interface StaffInvite {
  display_name: string;
  email: string;
  service_ids?: number[];
}

export interface StaffUpdate {
  display_name?: string;
  is_active?: boolean;
  service_ids?: number[];
}

// ---------- Availability ----------
export interface WorkingHours extends Timestamps {
  id: number;
  staff_id: number;
  weekday: Weekday;
  start_time: TimeOfDay;
  end_time: TimeOfDay;
}

export type WorkingHoursInput = Pick<WorkingHours, 'weekday' | 'start_time' | 'end_time'>;

export interface TimeOff extends Timestamps {
  id: number;
  staff_id: number;
  start_at: ISODateTime;
  end_at: ISODateTime;
  reason: string | null;
}

export interface TimeOffCreate {
  start_at: ISODateTime;
  end_at: ISODateTime;
  reason?: string;
}

export interface Slot {
  start_at: ISODateTime;
  end_at: ISODateTime;
  /** Staff free for this slot (merged view when no staff_id was requested). */
  staff_ids: number[];
}

export interface SlotQuery {
  service_id: number;
  staff_id?: number;
  date: ISODate;
}

// ---------- Booking ----------
export interface Booking extends Timestamps {
  id: number;
  business_id: number;
  service_id: number;
  staff_id: number;
  customer_id: number;
  start_at: ISODateTime;
  end_at: ISODateTime;
  status: BookingStatus;
  hold_expires_at: ISODateTime | null;
  customer_note: string | null;
  cancelled_by: CancelledBy | null;
  cancelled_at: ISODateTime | null;
  google_event_id: string | null;
}

export interface BookingDetail extends Booking {
  business: BusinessSummary & Pick<Business, 'timezone' | 'currency' | 'cancellation_cutoff_hours'>;
  service: Pick<Service, 'id' | 'name' | 'duration_minutes' | 'price_minor'>;
  staff: StaffMemberPublic;
  payment: Payment | null;
}

export interface BookingCreate {
  business_id: number;
  service_id: number;
  staff_id?: number;
  start_at: ISODateTime;
  customer_note?: string;
}

/** POST /api/bookings */
export interface BookingCreateResponse {
  booking_id: number;
  checkout_url: string;
  hold_expires_at?: ISODateTime;
  deposit_minor?: number;
  currency?: string;
}

export interface RefundOutcome {
  eligible: boolean;
  amount_minor: number;
}

/** GET /api/bookings/{id}/cancel-preview */
export interface CancelPreview {
  refund: RefundOutcome;
  cutoff_at?: ISODateTime;
}

/** POST /api/bookings/{id}/cancel */
export interface CancelResponse {
  booking: Booking;
  refund: RefundOutcome;
}

export interface RescheduleRequest {
  start_at: ISODateTime;
  staff_id?: number;
}

export interface BookingStatusUpdate {
  status: Extract<BookingStatus, 'completed' | 'no_show'>;
}

export interface BusinessBookingsQuery {
  from?: ISODateTime;
  to?: ISODateTime;
  staff_id?: number;
  status?: BookingStatus;
}

// ---------- Payment ----------
export interface Payment extends Timestamps {
  id: number;
  booking_id: number;
  business_id: number;
  provider: PaymentProvider;
  provider_payment_id: string | null;
  checkout_session_id: string | null;
  amount_minor: number;
  currency: string;
  status: PaymentStatus;
  refund_id: string | null;
  refunded_amount_minor: number;
  /** Provider rejected the refund (status is back to succeeded); needs manual handling. */
  refund_failed?: boolean;
}

// ---------- Calendar ----------
export interface CalendarConnection extends Timestamps {
  id: number;
  user_id: number;
  staff_id: number | null;
  google_calendar_id: string;
  token_expires_at: ISODateTime | null;
  watch_expires_at: ISODateTime | null;
}

// ---------- Dashboard ----------
export interface TopService {
  service_id: number;
  name: string;
  count: number;
}

/** GET /api/businesses/{id}/stats */
export interface BusinessStats {
  today_bookings: Booking[];
  upcoming_count: number;
  week_count: number;
  deposits_collected_minor: number;
  currency: string;
  top_services: TopService[];
}

// ---------- Real-time ----------
export interface SlotEventPayload {
  staff_id: number;
  start_at: ISODateTime;
  end_at: ISODateTime;
}

export type SlotSocketEvent =
  | { type: 'slot.taken'; data: SlotEventPayload }
  | { type: 'slot.freed'; data: SlotEventPayload };

export interface DashboardSocketEvent {
  type: 'booking.created' | 'booking.confirmed' | 'booking.cancelled' | 'booking.rescheduled';
  data: Booking;
}

// ---------- API ----------
export interface ValidationErrorItem {
  loc: (string | number)[];
  msg: string;
  type: string;
}

/** Raw error body returned by FastAPI. */
export interface ApiErrorBody {
  /** Machine-readable code, e.g. "SLOT_TAKEN". */
  code?: string;
  detail?: string | ValidationErrorItem[] | { code?: string; message?: string };
  message?: string;
}

/** Normalised error thrown by the API client. */
export interface ApiError {
  status: number;
  code: string | null;
  message: string;
  fieldErrors: Record<string, string>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// ===========================================================================
// FRONTEND-AGENT 2: bookings, payments, calendar sync (Modules 5-8)
// ===========================================================================

/** A list endpoint may return a bare array or a paginated envelope. */
export type ListResponse<T> = T[] | Paginated<T>;

/** Row from GET /api/businesses/{id}/bookings (calendar data). */
export interface BusinessBooking extends Booking {
  service_name?: string;
  staff_name?: string;
  customer_name?: string | null;
  customer_email?: string | null;
  service?: Pick<Service, 'id' | 'name' | 'duration_minutes' | 'price_minor'>;
  staff?: StaffMemberPublic;
  customer?: Pick<User, 'id' | 'email' | 'full_name'>;
}

/** Row from GET /api/businesses/{id}/payments. */
export interface PaymentRow extends Payment {
  booking_start_at?: ISODateTime;
  customer_name?: string | null;
  customer_email?: string | null;
  service_name?: string;
}

export interface PaymentsTotals {
  collected_minor: number;
  refunded_minor: number;
  net_minor: number;
  currency: string;
}

export interface PaymentsQuery {
  from?: ISODateTime;
  to?: ISODateTime;
}

/** Envelope variant of GET /api/businesses/{id}/payments. */
export interface PaymentsEnvelope {
  items: PaymentRow[];
  totals?: Partial<PaymentsTotals>;
}

export interface CancelRequest {
  reason?: string;
}

/** GET /api/calendar/google/connect */
export interface GoogleConnectResponse {
  url?: string;
  auth_url?: string;
  authorization_url?: string;
}

/** GET /api/calendar/google/status */
export interface CalendarStatus {
  connected: boolean;
  google_calendar_id?: string | null;
  email?: string | null;
  staff_id?: number | null;
  token_expires_at?: ISODateTime | null;
  watch_expires_at?: ISODateTime | null;
  last_synced_at?: ISODateTime | null;
}

export type BusinessSocketChannel = 'slots' | 'dashboard';

// ===========================================================================
// FRONTEND-AGENT 1 additions (Modules 1-4, 10)
// ===========================================================================

/** PATCH /auth/me (profile edit). */
export interface ProfileUpdate {
  full_name: string;
}

/** GET /api/staff/invites/{token} (invite preview). */
export interface StaffInviteInfo {
  business_id: number;
  business_name: string;
  business_slug: string;
  display_name: string;
  email: string;
}
