import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { fromZonedTime } from 'date-fns-tz';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Select } from '@/components/ui/Select';
import { useDashboardBusiness } from '@/hooks/useMyBusinesses';
import { useToast } from '@/hooks/useToast';
import { formatInTz } from '@/lib/datetime';
import { WEEKDAY_LABELS } from '@/lib/options';
import { toApiError } from '@/services/api';
import { availabilityKeys, availabilityService } from '@/services/availability';
import { staffKeys, staffService } from '@/services/staff';
import type {
  ApiError,
  StaffMemberPublic,
  TimeOff,
  TimeOffCreate,
  Weekday,
  WorkingHours,
  WorkingHoursInput,
} from '@/types';

// ---------- Weekly hours ----------

interface Interval {
  start: string;
  end: string;
}

type Week = Interval[][];

const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_INTERVAL: Interval = { start: '09:00', end: '17:00' };

function hoursToWeek(hours: WorkingHours[]): Week {
  const week: Week = WEEKDAYS.map(() => []);
  [...hours]
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .forEach((h) => week[h.weekday]?.push({ start: h.start_time.slice(0, 5), end: h.end_time.slice(0, 5) }));
  return week;
}

function weekToHours(week: Week): WorkingHoursInput[] {
  return week.flatMap((intervals, day) =>
    intervals.map((i) => ({ weekday: day as Weekday, start_time: i.start, end_time: i.end })),
  );
}

/** Per-day error message, or undefined when the day is valid. */
function validateWeek(week: Week): (string | undefined)[] {
  return week.map((intervals) => {
    if (intervals.some((i) => !i.start || !i.end)) return 'Fill in both times';
    if (intervals.some((i) => i.end <= i.start)) return 'End time must be after start time';
    const sorted = [...intervals].sort((a, b) => a.start.localeCompare(b.start));
    for (let k = 1; k < sorted.length; k += 1) {
      if (sorted[k].start < sorted[k - 1].end) return 'Time ranges overlap';
    }
    return undefined;
  });
}

function WeeklyHoursEditor({ staffId }: { staffId: number }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery<WorkingHours[], ApiError>({
    queryKey: availabilityKeys.hours(staffId),
    queryFn: () => availabilityService.getHours(staffId),
  });
  const [week, setWeek] = useState<Week>(() => WEEKDAYS.map(() => []));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (query.data) {
      setWeek(hoursToWeek(query.data));
      setDirty(false);
    }
  }, [query.data]);

  const errors = useMemo(() => validateWeek(week), [week]);
  const hasErrors = errors.some(Boolean);

  const save = useMutation<WorkingHours[], ApiError, WorkingHoursInput[]>({
    mutationFn: (hours) => availabilityService.replaceHours(staffId, hours),
    onSuccess: (hours) => {
      queryClient.setQueryData(availabilityKeys.hours(staffId), hours);
      toast.success('Weekly hours saved');
    },
    onError: (err) => toast.error('Could not save hours', toApiError(err).message),
  });

  const change = (updater: (draft: Week) => Week) => {
    setWeek((current) => updater(current.map((day) => day.map((i) => ({ ...i })))));
    setDirty(true);
  };

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  return (
    <Card hoverable={false}>
      <CardHeader
        title="Weekly hours"
        subtitle="Times are in the business timezone. Add several ranges for breaks."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => change((draft) => draft.map((day, idx) => (idx <= 4 ? draft[0].map((i) => ({ ...i })) : day)))}
            disabled={week[0].length === 0}
          >
            Copy Monday to weekdays
          </Button>
        }
      />
      <div className="divide-y divide-gray-100">
        {WEEKDAYS.map((day) => {
          const intervals = week[day];
          const open = intervals.length > 0;
          return (
            <div key={day} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
              <label className="flex w-40 shrink-0 items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  checked={open}
                  aria-label={`${WEEKDAY_LABELS[day]} open`}
                  onChange={(e) =>
                    change((draft) => {
                      draft[day] = e.target.checked ? [{ ...DEFAULT_INTERVAL }] : [];
                      return draft;
                    })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-gray-900">{WEEKDAY_LABELS[day]}</span>
              </label>
              <div className="flex-1 space-y-2">
                {!open && <p className="pt-2 text-sm text-gray-400">Closed</p>}
                <AnimatePresence initial={false}>
                  {intervals.map((interval, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        type="time"
                        step={900}
                        aria-label={`${WEEKDAY_LABELS[day]} start ${idx + 1}`}
                        value={interval.start}
                        onChange={(e) =>
                          change((draft) => {
                            draft[day][idx].start = e.target.value;
                            return draft;
                          })
                        }
                        className="rounded-lg border-2 border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
                      />
                      <span className="text-gray-400">to</span>
                      <input
                        type="time"
                        step={900}
                        aria-label={`${WEEKDAY_LABELS[day]} end ${idx + 1}`}
                        value={interval.end}
                        onChange={(e) =>
                          change((draft) => {
                            draft[day][idx].end = e.target.value;
                            return draft;
                          })
                        }
                        className="rounded-lg border-2 border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Remove range"
                        onClick={() =>
                          change((draft) => {
                            draft[day].splice(idx, 1);
                            return draft;
                          })
                        }
                      >
                        Remove
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {open && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-brand-600"
                    onClick={() =>
                      change((draft) => {
                        const last = draft[day][draft[day].length - 1];
                        draft[day].push(last && last.end < '22:00' ? { start: last.end, end: '22:00' } : { ...DEFAULT_INTERVAL });
                        return draft;
                      })
                    }
                  >
                    + Add range
                  </Button>
                )}
                {errors[day] && <p className="text-sm text-red-600">{errors[day]}</p>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {dirty && <span className="text-sm text-gray-500">Unsaved changes</span>}
        <GradientButton
          disabled={!dirty || hasErrors}
          isLoading={save.isPending}
          onClick={() => save.mutate(weekToHours(week))}
        >
          Save hours
        </GradientButton>
      </div>
    </Card>
  );
}

// ---------- Time off ----------

function TimeOffFormModal({
  isOpen,
  onClose,
  timezone,
  onSave,
  isSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  timezone: string;
  onSave: (payload: TimeOffCreate) => void;
  isSaving: boolean;
}) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!start || !end) {
      setError('Pick a start and an end');
      return;
    }
    if (end <= start) {
      setError('End must be after start');
      return;
    }
    setError(undefined);
    onSave({
      start_at: fromZonedTime(start, timezone).toISOString(),
      end_at: fromZonedTime(end, timezone).toISOString(),
      reason: reason.trim() || undefined,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add time off" description={`Times are in ${timezone.replace(/_/g, ' ')}.`}>
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="From" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input label="Until" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} error={error} />
        </div>
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Holiday, training..." />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <GradientButton type="submit" isLoading={isSaving}>
            Add time off
          </GradientButton>
        </div>
      </form>
    </Modal>
  );
}

function TimeOffList({ staffId, timezone }: { staffId: number; timezone: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery<TimeOff[], ApiError>({
    queryKey: availabilityKeys.timeOff(staffId),
    queryFn: () => availabilityService.listTimeOff(staffId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: availabilityKeys.timeOff(staffId) });

  const add = useMutation<TimeOff, ApiError, TimeOffCreate>({
    mutationFn: (payload) => availabilityService.addTimeOff(staffId, payload),
    onSuccess: () => {
      toast.success('Time off added');
      setOpen(false);
      void invalidate();
    },
    onError: (err) => toast.error('Could not add time off', toApiError(err).message),
  });
  const remove = useMutation<void, ApiError, number>({
    mutationFn: (id) => availabilityService.removeTimeOff(id),
    onSuccess: () => {
      toast.success('Time off removed');
      void invalidate();
    },
    onError: (err) => toast.error('Could not remove time off', toApiError(err).message),
  });

  const now = Date.now();
  const items = [...(query.data ?? [])]
    .filter((t) => new Date(t.end_at).getTime() >= now)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  return (
    <Card hoverable={false}>
      <CardHeader
        title="Time off"
        subtitle="No slots are offered during time off."
        action={
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Add
          </Button>
        }
      />
      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">No upcoming time off.</p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {items.map((t) => (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-start justify-between gap-3 rounded-xl bg-gray-50 p-3"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-gray-900">
                    {formatInTz(t.start_at, timezone, 'EEE d MMM, HH:mm')} &ndash; {formatInTz(t.end_at, timezone, 'EEE d MMM, HH:mm')}
                  </p>
                  {t.reason && <p className="truncate text-gray-500">{t.reason}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50"
                  isLoading={remove.isPending && remove.variables === t.id}
                  onClick={() => remove.mutate(t.id)}
                >
                  Remove
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {open && (
        <TimeOffFormModal
          isOpen={open}
          onClose={() => setOpen(false)}
          timezone={timezone}
          onSave={(payload) => add.mutate(payload)}
          isSaving={add.isPending}
        />
      )}
    </Card>
  );
}

// ---------- Page ----------

export default function AvailabilityPage() {
  const { id } = useParams<{ id: string }>();
  const businessId = Number(id);
  const [params, setParams] = useSearchParams();
  const { business, isOwner, membership } = useDashboardBusiness(businessId);
  const timezone = business?.timezone ?? 'UTC';

  // Owners see all staff (incl. pending invites); staff see the public list filtered to themselves.
  const staffQuery = useQuery<StaffMemberPublic[], ApiError>({
    queryKey: isOwner ? staffKeys.allByBusiness(businessId) : staffKeys.byBusiness(businessId),
    queryFn: () => (isOwner ? staffService.listAll(businessId) : staffService.list(businessId)),
  });
  const staff = (staffQuery.data ?? []).filter((s) => isOwner || s.id === membership?.staff_id);

  const requested = Number(params.get('staff'));
  const selectedId =
    staff.find((s) => s.id === requested)?.id ?? (isOwner ? staff[0]?.id : membership?.staff_id) ?? undefined;

  return (
    <PageWrapper
      title="Availability"
      subtitle="Set weekly working hours and time off. Slots update for customers instantly."
      contained={false}
      actions={
        isOwner && staff.length > 1 ? (
          <Select
            aria-label="Staff member"
            containerClassName="w-56"
            options={staff.map((s) => ({ value: String(s.id), label: s.display_name }))}
            value={selectedId ? String(selectedId) : ''}
            onChange={(e) => setParams({ staff: e.target.value }, { replace: true })}
          />
        ) : undefined
      }
    >
      {staffQuery.isLoading ? (
        <LoadingBlock />
      ) : staffQuery.isError ? (
        <ErrorState message={staffQuery.error.message} onRetry={() => void staffQuery.refetch()} />
      ) : !selectedId ? (
        <EmptyState
          title="No staff yet"
          description={isOwner ? 'Invite a staff member (you can invite yourself) to set working hours.' : 'Your staff profile was not found.'}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <WeeklyHoursEditor key={`h-${selectedId}`} staffId={selectedId} />
          </div>
          <TimeOffList key={`t-${selectedId}`} staffId={selectedId} timezone={timezone} />
        </div>
      )}
    </PageWrapper>
  );
}
