import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { fromZonedTime } from 'date-fns-tz';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Card, CardHeader } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Input } from '@/components/ui/Input';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDashboardBusiness } from '@/hooks/useMyBusinesses';
import { useToast } from '@/hooks/useToast';
import { formatInTz } from '@/lib/datetime';
import { formatTimezone } from '@/lib/format';
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

function CardSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <Card>
      <div role="status" aria-busy="true" className="space-y-4">
        <span className="sr-only">{label}</span>
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-9 flex-1" />
          </div>
        ))}
      </div>
    </Card>
  );
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

  if (query.isLoading) return <CardSkeleton rows={7} label="Loading weekly hours" />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  const openDays = week.filter((d) => d.length > 0).length;

  return (
    <Card>
      <CardHeader
        title="Weekly hours"
        subtitle={`Times are in the business timezone. Add a second range to block out a break. ${openDays} of 7 days open.`}
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
              <Checkbox
                containerClassName="w-40 shrink-0 pt-2"
                checked={open}
                label={WEEKDAY_LABELS[day]}
                onChange={(e) =>
                  change((draft) => {
                    draft[day] = e.target.checked ? [{ ...DEFAULT_INTERVAL }] : [];
                    return draft;
                  })
                }
              />
              <div className="flex-1 space-y-2">
                {!open && <p className="pt-2 text-sm text-gray-600">Closed</p>}
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
                        className="control w-32 tabular-nums"
                      />
                      <span className="text-sm text-gray-600">to</span>
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
                        className="control w-32 tabular-nums"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${WEEKDAY_LABELS[day]} range ${idx + 1}`}
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
                {errors[day] && (
                  <p className="text-sm text-red-700" role="alert">
                    {errors[day]}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sticky bottom-0 -mx-5 -mb-5 mt-4 flex items-center justify-end gap-3 rounded-b-card border-t border-gray-100 bg-white/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
        {dirty && (
          <span className="text-sm font-medium text-amber-800" role="status">
            Unsaved changes
          </span>
        )}
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add time off"
      description={`No slots are offered in this period. Times are in ${formatTimezone(timezone)}.`}
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="From" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input label="Until" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} error={error} />
        </div>
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Holiday, training..." />
        <ModalActions>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <GradientButton type="submit" isLoading={isSaving}>
            Add time off
          </GradientButton>
        </ModalActions>
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
    <Card>
      <CardHeader
        title="Time off"
        subtitle="No slots are offered during time off."
        action={
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Add time off
          </Button>
        }
      />
      {query.isLoading ? (
        <div role="status" aria-busy="true" className="space-y-2">
          <span className="sr-only">Loading time off</span>
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-600">
          No upcoming time off. Add holidays or appointments to block those times.
        </p>
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
                  {t.reason && <p className="truncate text-gray-600">{t.reason}</p>}
                </div>
                <Button
                  variant="danger-ghost"
                  size="sm"
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
            label="Staff member"
            containerClassName="w-full sm:w-56"
            options={staff.map((s) => ({ value: String(s.id), label: s.display_name }))}
            value={selectedId ? String(selectedId) : ''}
            onChange={(e) => setParams({ staff: e.target.value }, { replace: true })}
          />
        ) : undefined
      }
    >
      {staffQuery.isLoading ? (
        <CardSkeleton rows={7} label="Loading staff" />
      ) : staffQuery.isError ? (
        <ErrorState message={staffQuery.error.message} onRetry={() => void staffQuery.refetch()} />
      ) : !selectedId ? (
        <EmptyState
          icon="users"
          title="No staff yet"
          description={
            isOwner
              ? 'Hours belong to staff members. Invite someone (you can invite yourself), then set their weekly hours here.'
              : 'Your staff profile was not found.'
          }
          action={
            isOwner ? (
              <ButtonLink to={`/dashboard/b/${businessId}/staff`} variant="gradient">
                Invite staff
              </ButtonLink>
            ) : undefined
          }
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
