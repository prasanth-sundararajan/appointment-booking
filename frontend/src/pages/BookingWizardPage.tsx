import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { DateStrip } from '@/components/booking/DateStrip';
import { SlotGrid } from '@/components/booking/SlotGrid';
import { ConfirmStep } from '@/components/booking/ConfirmStep';
import { HoldCountdown, HOLD_MINUTES } from '@/components/booking/HoldCountdown';
import { useBusinessSocket } from '@/hooks/useBusinessSocket';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { formatDateKey, upcomingDateKeys } from '@/lib/datetime';
import { toApiError } from '@/services/api';
import { businessesService, businessKeys } from '@/services/businesses';
import { createBooking, rememberLastBooking } from '@/services/bookings';
import { getSlots, slotKeys } from '@/services/slots';
import type { BookingCreate, ISODate, Service, Slot, StaffMemberPublic } from '@/types';

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

function StepIndicator({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="mb-6 flex items-center gap-2 overflow-x-auto text-sm">
      {STEPS.map((step, index) => (
        <li key={step.id} className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
              index < currentIndex && 'bg-brand-100 text-brand-700',
              index === currentIndex && 'bg-brand-600 text-white',
              index > currentIndex && 'bg-gray-100 text-gray-400',
            )}
          >
            {index + 1}
          </span>
          <span className={cn(index === currentIndex ? 'font-medium text-gray-900' : 'text-gray-500')}>
            {step.label}
          </span>
          {index < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-gray-200" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

function OptionButton({
  selected,
  onClick,
  title,
  subtitle,
  aside,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  aside?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'flex w-full items-center justify-between gap-4 rounded-2xl border-2 p-4 text-left transition-colors',
        selected ? 'border-brand-600 bg-brand-50' : 'border-gray-200 bg-white hover:border-brand-300',
      )}
    >
      <span>
        <span className="block font-medium text-gray-900">{title}</span>
        {subtitle && <span className="block text-sm text-gray-500">{subtitle}</span>}
      </span>
      {aside && <span className="shrink-0 font-semibold text-brand-700">{aside}</span>}
    </motion.button>
  );
}

export default function BookingWizardPage() {
  const { slug = '' } = useParams<{ slug: string }>();
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

  if (businessQuery.isLoading) return <FullPageSpinner />;
  if (businessQuery.isError || !business) {
    return (
      <PageWrapper title="Business not found">
        <p className="text-gray-600">We could not load this business.</p>
        <Link to="/explore" className="mt-4 inline-block text-brand-700 underline">
          Back to explore
        </Link>
      </PageWrapper>
    );
  }

  const staffName =
    staffChoice === ANY_STAFF
      ? slot && slot.staff_ids.length === 1
        ? (business.staff.find((m) => m.id === slot.staff_ids[0])?.display_name ?? 'Any available')
        : 'Any available'
      : (business.staff.find((m) => m.id === staffChoice)?.display_name ?? 'Selected staff');

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

  return (
    <PageWrapper title={`Book at ${business.name}`} subtitle={`All times are shown in ${business.timezone}.`}>
      <StepIndicator current={step} />

      {hold && (
        <Card hoverable={false} className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-700">Redirecting you to secure checkout...</p>
          <HoldCountdown expiresAt={hold} />
        </Card>
      )}

      <Card hoverable={false}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
          >
            {step === 'service' && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">Choose a service</h2>
                {services.length === 0 && <p className="text-sm text-gray-500">No services are available yet.</p>}
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
                    subtitle={`${s.duration_minutes} min${s.description ? ` · ${s.description}` : ''}`}
                    aside={formatMoney(s.price_minor, business.currency)}
                  />
                ))}
              </section>
            )}

            {step === 'staff' && service && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">Who would you like?</h2>
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
                <div className="pt-2">
                  <Button variant="ghost" onClick={() => setStep('service')}>
                    Back
                  </Button>
                </div>
              </section>
            )}

            {step === 'date' && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Pick a date</h2>
                <DateStrip
                  dates={dates}
                  selected={date}
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
                  <h2 className="text-lg font-semibold text-gray-900">{formatDateKey(date, 'EEEE d MMMM')}</h2>
                  <span className="inline-flex items-center gap-2 text-xs text-emerald-700">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
                    Live availability
                  </span>
                </div>
                <DateStrip
                  dates={dates}
                  selected={date}
                  onSelect={(d) => {
                    setDate(d);
                    setSlot(null);
                  }}
                />
                {slotsQuery.isError ? (
                  <p className="text-sm text-red-600">{toApiError(slotsQuery.error).message}</p>
                ) : (
                  <SlotGrid
                    slots={slots}
                    timezone={business.timezone}
                    selectedStart={slot?.start_at}
                    onSelect={setSlot}
                    isLoading={slotsQuery.isLoading}
                  />
                )}
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep('date')}>
                    Back
                  </Button>
                  <Button disabled={!slot} onClick={() => setStep('confirm')}>
                    Continue
                  </Button>
                </div>
              </section>
            )}

            {step === 'confirm' && service && slot && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Confirm and pay deposit</h2>
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
    </PageWrapper>
  );
}
