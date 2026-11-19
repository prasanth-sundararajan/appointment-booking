import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Card } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { DateStrip } from '@/components/booking/DateStrip';
import { SlotGrid } from '@/components/booking/SlotGrid';
import { ConfirmStep } from '@/components/booking/ConfirmStep';
import { HoldCountdown, HOLD_MINUTES } from '@/components/booking/HoldCountdown';
import { useBusinessSocket } from '@/hooks/useBusinessSocket';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/cn';
import { computeDeposit, refundRuleText } from '@/lib/deposit';
import { formatDuration, formatTimezone } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { addDaysToKey, formatDateKey, formatInTz, todayInTz, upcomingDateKeys } from '@/lib/datetime';
import { toApiError } from '@/services/api';
import { businessesService, businessKeys } from '@/services/businesses';
import { createBooking, rememberLastBooking } from '@/services/bookings';
import { getSlots, slotKeys } from '@/services/slots';
import type { BookingCreate, BusinessPublic, ISODate, Service, Slot, StaffMemberPublic } from '@/types';

type Step = 'service' | 'staff' | 'date' | 'slot' | 'confirm';
const STEPS: { id: Step; label: string }[] = [
  { id: 'service', label: 'Service' },
  { id: 'staff', label: 'Staff' },
  { id: 'date', label: 'Date' },
  { id: 'slot', label: 'Time' },
  { id: 'confirm', label: 'Confirm' },
];
const MAX_DAYS_SHOWN = 60;
const ANY_STAFF = 'any';
type StaffChoice = number | typeof ANY_STAFF;

function Stepper({ current, onJump }: { current: Step; onJump: (step: Step) => void }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Booking progress" className="mb-6">
      {/* Compact progress for phones */}
      <div className="sm:hidden">
        <p className="text-sm font-medium text-gray-900">
          Step {currentIndex + 1} of {STEPS.length}: <span className="text-brand-700">{STEPS[currentIndex].label}</span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
          <motion.div
            className="h-full rounded-full bg-brand-600"
            initial={false}
            animate={{ width: `${((currentIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>
      <ol className="hidden items-center sm:flex">
        {STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          const marker = (
            <>
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  done && 'bg-brand-600 text-white',
                  active && 'bg-white text-brand-700 ring-2 ring-brand-600',
                  !done && !active && 'bg-gray-100 text-gray-500 ring-1 ring-gray-300',
                )}
              >
                {done ? (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z"
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className={cn('text-sm', active ? 'font-semibold text-gray-900' : done ? 'font-medium text-gray-800' : 'text-gray-500')}>
                {step.label}
                {done && <span className="sr-only"> (completed)</span>}
              </span>
            </>
          );
          return (
            <li key={step.id} className={cn('flex items-center', index < STEPS.length - 1 && 'flex-1')} aria-current={active ? 'step' : undefined}>
              {done ? (
                <button
                  type="button"
                  onClick={() => onJump(step.id)}
                  className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-gray-100"
                  aria-label={`Back to ${step.label}`}
                >
                  {marker}
                </button>
              ) : (
                <span className="flex items-center gap-2 px-1 py-1">{marker}</span>
              )}
              {index < STEPS.length - 1 && (
                <span className={cn('mx-2 h-0.5 flex-1 rounded', done ? 'bg-brand-600' : 'bg-gray-200')} aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function OptionButton({
  selected,
  onClick,
  title,
  subtitle,
  aside,
  asideHint,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  aside?: string;
  asideHint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        selected ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-gray-300 bg-white hover:border-brand-400 hover:bg-brand-50/40',
      )}
    >
      <span className="min-w-0">
        <span className="block font-semibold text-gray-900">{title}</span>
        {subtitle && <span className="mt-0.5 block text-sm text-gray-600">{subtitle}</span>}
      </span>
      {aside && (
        <span className="shrink-0 text-right">
          <span className="block font-semibold text-gray-900">{aside}</span>
          {asideHint && <span className="block text-xs text-gray-600">{asideHint}</span>}
        </span>
      )}
    </button>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{children}</dd>
    </div>
  );
}

function BookingSummary({
  business,
  service,
  staffName,
  date,
  slot,
}: {
  business: BusinessPublic;
  service: Service | null;
  staffName: string;
  date: ISODate | null;
  slot: Slot | null;
}) {
  const money = (minor: number) => formatMoney(minor, business.currency);
  const deposit = service ? computeDeposit(service.price_minor, business.deposit_percent) : null;
  const placeholder = <span className="font-normal text-gray-500">Not chosen</span>;

  return (
    <Card aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="text-base font-semibold text-gray-900">
        Your booking
      </h2>
      <p className="text-sm text-gray-600">{business.name}</p>
      <dl className="mt-3 divide-y divide-gray-100 border-y border-gray-100 text-sm">
        <SummaryRow label="Service">
          {service ? `${service.name} · ${formatDuration(service.duration_minutes)}` : placeholder}
        </SummaryRow>
        <SummaryRow label="With">{service ? staffName : placeholder}</SummaryRow>
        <SummaryRow label="Date">{date ? formatDateKey(date, 'EEE d MMM yyyy') : placeholder}</SummaryRow>
        <SummaryRow label="Time">
          {slot
            ? `${formatInTz(slot.start_at, business.timezone, 'HH:mm')} - ${formatInTz(slot.end_at, business.timezone, 'HH:mm')}`
            : placeholder}
        </SummaryRow>
      </dl>
      {service && deposit !== null ? (
        <div className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-700">
            <span>Price</span>
            <span className="tabular-nums">{money(service.price_minor)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold text-brand-800">
            <span>Deposit today ({business.deposit_percent}%)</span>
            <span className="tabular-nums">{money(deposit)}</span>
          </div>
          <div className="flex justify-between text-gray-700">
            <span>Pay at appointment</span>
            <span className="tabular-nums">{money(service.price_minor - deposit)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-600">Pick a service to see the price and deposit.</p>
      )}
      <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
        {refundRuleText(business.cancellation_cutoff_hours)} Times are in {formatTimezone(business.timezone)}.
      </p>
    </Card>
  );
}

function StepHeading({ children, headingRef }: { children: ReactNode; headingRef: RefObject<HTMLHeadingElement> }) {
  return (
    <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-gray-900 focus:outline-none">
      {children}
    </h2>
  );
}

export default function BookingWizardPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();

  const businessQuery = useQuery({
    queryKey: businessKeys.bySlug(slug),
    queryFn: () => businessesService.getBySlug(slug),
    enabled: slug !== '',
  });
  const business = businessQuery.data;

  const [step, setStep] = useState<Step>('service');
  const [service, setService] = useState<Service | null>(null);
  const [staffChoice, setStaffChoice] = useState<StaffChoice>(ANY_STAFF);
  const [date, setDate] = useState<ISODate | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [note, setNote] = useState('');
  const [hold, setHold] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const preselected = useRef(false);

  useBusinessSocket(business?.id, 'slots');

  const services = useMemo(() => (business?.services ?? []).filter((s) => s.is_active), [business]);
  const staffForService = useMemo<StaffMemberPublic[]>(
    () => (business && service ? business.staff.filter((m) => m.service_ids.includes(service.id)) : []),
    [business, service],
  );
  const dates = useMemo(
    () =>
      business
        ? upcomingDateKeys(business.timezone, Math.max(1, Math.min(business.max_advance_days + 1, MAX_DAYS_SHOWN)))
        : [],
    [business],
  );
  const today = business ? todayInTz(business.timezone) : undefined;

  // Deep link from the business page: /b/:slug/book?service_id=12 skips the service step.
  useEffect(() => {
    if (preselected.current || services.length === 0) return;
    preselected.current = true;
    const requested = Number(params.get('service_id'));
    const match = services.find((s) => s.id === requested);
    if (match) {
      setService(match);
      setStep('staff');
    }
  }, [services, params]);

  // Move focus to the step heading so keyboard and screen reader users land on the new step.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const staffId = staffChoice === ANY_STAFF ? undefined : staffChoice;
  const slotQuery = { service_id: service?.id ?? 0, staff_id: staffId, date: date ?? '' };
  const slotsQuery = useQuery({
    queryKey: slotKeys.list(business?.id, slotQuery),
    queryFn: () => getSlots(business?.id ?? 0, slotQuery),
    enabled: business !== undefined && service !== null && date !== null,
  });
  const slots = useMemo(() => slotsQuery.data ?? [], [slotsQuery.data]);

  // A live `slot.taken` can remove the slot the customer picked.
  const selectedGone = slot !== null && slotsQuery.isSuccess && !slots.some((s) => s.start_at === slot.start_at);
  useEffect(() => {
    if (selectedGone && hold === null) {
      setSlot(null);
      setStep('slot');
      toast.info('That time was just booked', 'Please choose another slot.');
    }
  }, [selectedGone, hold, toast]);

  const mutation = useMutation({
    mutationFn: (payload: BookingCreate) => createBooking(payload),
    onSuccess: (result) => {
      rememberLastBooking(result.booking_id);
      setHold(result.hold_expires_at ?? new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString());
      window.location.assign(result.checkout_url);
    },
    onError: (error) => {
      const apiError = toApiError(error);
      if (apiError.status === 409 || apiError.code === 'SLOT_TAKEN') {
        toast.error('Sorry, that slot was just taken', 'We refreshed the available times.');
        setSlot(null);
        setStep('slot');
        void queryClient.invalidateQueries({ queryKey: slotKeys.all(business?.id) });
        return;
      }
      toast.error('Could not create booking', apiError.message);
    },
  });

  if (businessQuery.isLoading) {
    return (
      <PageWrapper>
        <PageSkeleton label="Loading booking" />
      </PageWrapper>
    );
  }
  if (businessQuery.isError || !business) {
    const notFound = businessQuery.isError && toApiError(businessQuery.error).status === 404;
    return (
      <PageWrapper>
        {notFound || !businessQuery.isError ? (
          <EmptyState
            as="h1"
            icon="search"
            title="Business not found"
            description="This booking page doesn't exist or is no longer active."
            action={
              <ButtonLink to="/explore" variant="gradient">
                Back to explore
              </ButtonLink>
            }
          />
        ) : (
          <ErrorState message={toApiError(businessQuery.error).message} onRetry={() => void businessQuery.refetch()} />
        )}
      </PageWrapper>
    );
  }

  const chosenStaff = staffChoice === ANY_STAFF ? null : business.staff.find((m) => m.id === staffChoice);
  const staffName =
    staffChoice === ANY_STAFF
      ? slot && slot.staff_ids.length === 1
        ? (business.staff.find((m) => m.id === slot.staff_ids[0])?.display_name ?? 'Any available')
        : 'Any available'
      : (chosenStaff?.display_name ?? 'Selected staff');

  const confirm = () => {
    if (!service || !slot) return;
    mutation.mutate({
      business_id: business.id,
      service_id: service.id,
      staff_id: staffId,
      start_at: slot.start_at,
      customer_note: note.trim() || undefined,
    });
  };

  const jump = (target: Step) => {
    if (hold) return;
    setStep(target);
  };

  const nextDate = date ? addDaysToKey(date, 1) : null;
  const nextDateAvailable = nextDate !== null && dates.includes(nextDate);
  const noTimesHint = date && (
    <>
      <p>
        {chosenStaff ? `${chosenStaff.display_name} isn't` : 'Nobody is'} available for{' '}
        {service ? service.name : 'this service'} on {formatDateKey(date, 'EEEE d MMMM')}. This usually means:
      </p>
      <ul className="mt-2 list-inside list-disc text-left sm:text-center">
        <li>it&apos;s outside working hours or a day off,</li>
        <li>every time that day is already booked,</li>
        {date === today && business.min_notice_hours > 0 && (
          <li>remaining times are within the {business.min_notice_hours}h minimum notice.</li>
        )}
      </ul>
    </>
  );
  const deposit = service ? computeDeposit(service.price_minor, business.deposit_percent) : null;

  return (
    <PageWrapper
      title={`Book at ${business.name}`}
      subtitle={`All times are shown in ${formatTimezone(business.timezone)}.`}
      backTo={{ to: `/b/${business.slug}`, label: business.name }}
      className="pb-28 lg:pb-10"
    >
      <Stepper current={step} onJump={jump} />

      {hold && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4" role="status">
          <p className="text-sm font-medium text-amber-900">Redirecting you to secure checkout...</p>
          <HoldCountdown expiresAt={hold} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <Card className="lg:col-span-2">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
            >
              {step === 'service' && (
                <section className="space-y-4">
                  <StepHeading headingRef={headingRef}>Choose a service</StepHeading>
                  {services.length === 0 ? (
                    <EmptyState
                      icon="list"
                      title="No services available yet"
                      description="This business hasn't published any bookable services."
                      action={
                        <ButtonLink to="/explore" variant="outline">
                          Explore other businesses
                        </ButtonLink>
                      }
                    />
                  ) : (
                    <div className="space-y-3">
                      {services.map((s) => (
                        <OptionButton
                          key={s.id}
                          selected={service?.id === s.id}
                          onClick={() => {
                            setService(s);
                            setStaffChoice(ANY_STAFF);
                            setSlot(null);
                            setStep('staff');
                          }}
                          title={s.name}
                          subtitle={`${formatDuration(s.duration_minutes)}${s.description ? ` · ${s.description}` : ''}`}
                          aside={formatMoney(s.price_minor, business.currency)}
                          asideHint={`${formatMoney(computeDeposit(s.price_minor, business.deposit_percent), business.currency)} deposit`}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {step === 'staff' && service && (
                <section className="space-y-4">
                  <StepHeading headingRef={headingRef}>Who would you like?</StepHeading>
                  {staffForService.length === 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      No team member offers {service.name} yet, so there are no times to book. Please choose another
                      service or check back later.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <OptionButton
                        selected={staffChoice === ANY_STAFF}
                        onClick={() => {
                          setStaffChoice(ANY_STAFF);
                          setSlot(null);
                          setStep('date');
                        }}
                        title="Any available"
                        subtitle="Most open times"
                      />
                      {staffForService.map((m) => (
                        <OptionButton
                          key={m.id}
                          selected={staffChoice === m.id}
                          onClick={() => {
                            setStaffChoice(m.id);
                            setSlot(null);
                            setStep('date');
                          }}
                          title={m.display_name}
                        />
                      ))}
                    </div>
                  )}
                  <Button variant="ghost" onClick={() => setStep('service')}>
                    Back
                  </Button>
                </section>
              )}

              {step === 'date' && (
                <section className="space-y-4">
                  <StepHeading headingRef={headingRef}>Pick a date</StepHeading>
                  <p className="text-sm text-gray-600">
                    You can book up to {business.max_advance_days} days ahead. Use the arrow keys to move between days.
                  </p>
                  <DateStrip
                    dates={dates}
                    selected={date}
                    today={today}
                    onSelect={(d) => {
                      setDate(d);
                      setSlot(null);
                      setStep('slot');
                    }}
                  />
                  <Button variant="ghost" onClick={() => setStep('staff')}>
                    Back
                  </Button>
                </section>
              )}

              {step === 'slot' && date && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StepHeading headingRef={headingRef}>{formatDateKey(date, 'EEEE d MMMM')}</StepHeading>
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-emerald-800">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
                      Live availability
                    </span>
                  </div>
                  <DateStrip
                    dates={dates}
                    selected={date}
                    today={today}
                    onSelect={(d) => {
                      setDate(d);
                      setSlot(null);
                    }}
                  />
                  {slotsQuery.isError ? (
                    <ErrorState message={toApiError(slotsQuery.error).message} onRetry={() => void slotsQuery.refetch()} />
                  ) : (
                    <SlotGrid
                      slots={slots}
                      timezone={business.timezone}
                      selectedStart={slot?.start_at}
                      onSelect={setSlot}
                      isLoading={slotsQuery.isLoading}
                      emptyMessage={`No open slots on ${formatDateKey(date, 'EEEE d MMMM')}.`}
                      emptyHint={noTimesHint}
                      emptyAction={
                        <>
                          {nextDateAvailable && nextDate && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setDate(nextDate);
                                setSlot(null);
                              }}
                            >
                              Try {formatDateKey(nextDate, 'EEE d MMM')}
                            </Button>
                          )}
                          {staffChoice !== ANY_STAFF && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setStaffChoice(ANY_STAFF);
                                setSlot(null);
                              }}
                            >
                              Show any available staff
                            </Button>
                          )}
                        </>
                      }
                    />
                  )}
                  <div className="flex justify-between gap-3 border-t border-gray-100 pt-4">
                    <Button variant="ghost" onClick={() => setStep('date')}>
                      Back
                    </Button>
                    <Button disabled={!slot} onClick={() => setStep('confirm')}>
                      {slot ? `Continue with ${formatInTz(slot.start_at, business.timezone, 'HH:mm')}` : 'Pick a time'}
                    </Button>
                  </div>
                </section>
              )}

              {step === 'confirm' && service && slot && (
                <section className="space-y-4">
                  <StepHeading headingRef={headingRef}>Confirm and pay deposit</StepHeading>
                  <ConfirmStep
                    business={business}
                    service={service}
                    slot={slot}
                    staffName={staffName}
                    note={note}
                    onNoteChange={setNote}
                    onConfirm={confirm}
                    onBack={() => setStep('slot')}
                    isSubmitting={mutation.isPending || hold !== null}
                  />
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </Card>

        <aside className="hidden lg:sticky lg:top-24 lg:block" aria-label="Booking summary">
          <BookingSummary business={business} service={service} staffName={staffName} date={date} slot={slot} />
        </aside>
      </div>

      {/* Phone / tablet: compact sticky summary with price */}
      {service && deposit !== null && step !== 'confirm' && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_-8px_rgb(15_23_42/0.15)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-page items-center justify-between gap-4">
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold text-gray-900">
                {service.name}
                {slot && ` · ${formatInTz(slot.start_at, business.timezone, 'EEE d MMM, HH:mm')}`}
              </p>
              <p className="text-gray-600">
                {formatMoney(service.price_minor, business.currency)} &middot;{' '}
                <span className="font-semibold text-brand-800">{formatMoney(deposit, business.currency)} deposit</span>
              </p>
            </div>
            {step === 'slot' && (
              <Button size="sm" disabled={!slot} onClick={() => setStep('confirm')}>
                Continue
              </Button>
            )}
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
