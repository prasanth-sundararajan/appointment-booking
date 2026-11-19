import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DateStrip } from '@/components/booking/DateStrip';
import { SlotGrid } from '@/components/booking/SlotGrid';
import { useToast } from '@/hooks/useToast';
import { useBusinessSocket } from '@/hooks/useBusinessSocket';
import { formatInTz, upcomingDateKeys } from '@/lib/datetime';
import { toApiError } from '@/services/api';
import { bookingKeys, rescheduleBooking } from '@/services/bookings';
import { getSlots, slotKeys } from '@/services/slots';
import type { BookingDetail, ISODate, Slot } from '@/types';

export interface RescheduleDialogProps {
  booking: BookingDetail;
  isOpen: boolean;
  onClose: () => void;
}

const DAYS_SHOWN = 30;

export function RescheduleDialog({ booking, isOpen, onClose }: RescheduleDialogProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const timezone = booking.business.timezone;
  const businessId = booking.business.id;
  const dates = useMemo(() => upcomingDateKeys(timezone, DAYS_SHOWN), [timezone]);
  const [date, setDate] = useState<ISODate>(dates[0]);
  const [selected, setSelected] = useState<Slot | null>(null);

  useBusinessSocket(isOpen ? businessId : undefined, 'slots');

  const query = { service_id: booking.service_id, staff_id: booking.staff_id, date };
  const slots = useQuery({
    queryKey: slotKeys.list(businessId, query),
    queryFn: () => getSlots(businessId, query),
    enabled: isOpen,
  });

  const visibleSlots = useMemo(
    () => (slots.data ?? []).filter((s) => s.start_at !== booking.start_at),
    [slots.data, booking.start_at],
  );
  const selectedStillOpen = selected !== null && visibleSlots.some((s) => s.start_at === selected.start_at);

  const mutation = useMutation({
    mutationFn: (slot: Slot) => rescheduleBooking(booking.id, { start_at: slot.start_at, staff_id: booking.staff_id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.detail(booking.id) });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.mineAll });
      void queryClient.invalidateQueries({ queryKey: slotKeys.all(businessId) });
      toast.success('Booking rescheduled', 'Your deposit carries over to the new time.');
      setSelected(null);
      onClose();
    },
    onError: (error) => {
      const apiError = toApiError(error);
      if (apiError.status === 409 || apiError.code === 'SLOT_TAKEN') {
        toast.error('That slot was just taken', 'Please pick another time.');
        setSelected(null);
        void queryClient.invalidateQueries({ queryKey: slotKeys.all(businessId) });
        return;
      }
      toast.error('Could not reschedule', apiError.message);
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Reschedule booking"
      description={`Currently ${formatInTz(booking.start_at, timezone, 'EEE d MMM, HH:mm')} with ${booking.staff.display_name}. Times are in ${timezone}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Close
          </Button>
          <Button
            onClick={() => selected && mutation.mutate(selected)}
            disabled={!selectedStillOpen}
            isLoading={mutation.isPending}
          >
            Move to {selectedStillOpen && selected ? formatInTz(selected.start_at, timezone, 'EEE d MMM, HH:mm') : '...'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <DateStrip
          dates={dates}
          selected={date}
          onSelect={(d) => {
            setDate(d);
            setSelected(null);
          }}
        />
        <SlotGrid
          slots={visibleSlots}
          timezone={timezone}
          selectedStart={selectedStillOpen ? selected?.start_at : null}
          onSelect={setSelected}
          isLoading={slots.isLoading}
        />
      </div>
    </Modal>
  );
}
