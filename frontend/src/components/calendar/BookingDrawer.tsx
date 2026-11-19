import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge, bookingStatusTone, formatStatus } from '@/components/ui/Badge';
import { useToast } from '@/hooks/useToast';
import { formatInTz } from '@/lib/datetime';
import { toApiError } from '@/services/api';
import { cancelBooking, updateBookingStatus } from '@/services/bookings';
import type { BookingStatusUpdate, BusinessBooking, StaffMemberPublic } from '@/types';
import { bookingCustomerName, bookingServiceName, bookingStaffName } from './calendarUtils';

export interface BookingDrawerProps {
  booking: BusinessBooking | null;
  businessId: number;
  timezone: string;
  staff: StaffMemberPublic[];
  onClose: () => void;
}

export function BookingDrawer({ booking, businessId, timezone, staff, onClose }: BookingDrawerProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  useEffect(() => {
    setConfirmingCancel(false);
  }, [booking?.id]);

  useEffect(() => {
    if (!booking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [booking, onClose]);

  const refresh = (id: number) => {
    void queryClient.invalidateQueries({ queryKey: ['business-bookings', businessId] });
    void queryClient.invalidateQueries({ queryKey: ['stats', businessId] });
    void queryClient.invalidateQueries({ queryKey: ['slots', businessId] });
    void queryClient.invalidateQueries({ queryKey: ['booking', id] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: BookingStatusUpdate }) => updateBookingStatus(id, payload),
    onSuccess: (_data, { id, payload }) => {
      refresh(id);
      toast.success(payload.status === 'completed' ? 'Marked as completed' : 'Marked as no-show');
      onClose();
    },
    onError: (error) => toast.error('Could not update booking', toApiError(error).message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => cancelBooking(id, { reason: 'Cancelled by business' }),
    onSuccess: (_data, id) => {
      refresh(id);
      toast.success('Booking cancelled', 'The customer receives a full deposit refund.');
      onClose();
    },
    onError: (error) => toast.error('Could not cancel booking', toApiError(error).message),
  });

  const busy = statusMutation.isPending || cancelMutation.isPending;
  const isActive = booking?.status === 'confirmed' || booking?.status === 'pending_payment';

  return createPortal(
    <AnimatePresence>
      {booking && (
        <div className="fixed inset-0 z-40">
          <motion.div
            className="absolute inset-0 bg-navy-950/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Booking details"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-line bg-navy-900/95 p-6 backdrop-blur-xl shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">{bookingServiceName(booking)}</h2>
                <p className="text-sm text-ink-muted">
                  {formatInTz(booking.start_at, timezone, 'EEEE d MMM, HH:mm')} -{' '}
                  {formatInTz(booking.end_at, timezone, 'HH:mm')}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close details" autoFocus>
                Close
              </Button>
            </div>

            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Status</dt>
                <dd>
                  <Badge tone={bookingStatusTone[booking.status]}>{formatStatus(booking.status)}</Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Customer</dt>
                <dd className="font-medium text-ink">{bookingCustomerName(booking)}</dd>
              </div>
              {(booking.customer_email ?? booking.customer?.email) && (
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Email</dt>
                  <dd className="text-ink">{booking.customer_email ?? booking.customer?.email}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-muted">Staff</dt>
                <dd className="font-medium text-ink">{bookingStaffName(booking, staff)}</dd>
              </div>
              {booking.customer_note && (
                <div>
                  <dt className="text-ink-muted">Note</dt>
                  <dd className="mt-1 rounded-lg bg-white/5 p-3 text-ink">{booking.customer_note}</dd>
                </div>
              )}
            </dl>

            <div className="mt-auto space-y-3 pt-8">
              {booking.status === 'confirmed' && (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    isLoading={statusMutation.isPending && statusMutation.variables?.payload.status === 'completed'}
                    onClick={() => statusMutation.mutate({ id: booking.id, payload: { status: 'completed' } })}
                  >
                    Mark completed
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    isLoading={statusMutation.isPending && statusMutation.variables?.payload.status === 'no_show'}
                    onClick={() => statusMutation.mutate({ id: booking.id, payload: { status: 'no_show' } })}
                  >
                    Mark no-show
                  </Button>
                </div>
              )}
              {isActive && !confirmingCancel && (
                <Button fullWidth variant="danger" disabled={busy} onClick={() => setConfirmingCancel(true)}>
                  Cancel booking
                </Button>
              )}
              {isActive && confirmingCancel && (
                <div className="rounded-xl bg-red-500/10 p-4">
                  <p className="text-sm text-red-200">
                    Business cancellations always refund the customer&apos;s full deposit. Continue?
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setConfirmingCancel(false)} disabled={busy}>
                      Keep
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      isLoading={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate(booking.id)}
                    >
                      Cancel and refund
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
