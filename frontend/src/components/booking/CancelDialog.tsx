import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { formatMoney } from '@/lib/money';
import { useToast } from '@/hooks/useToast';
import { toApiError } from '@/services/api';
import { bookingKeys, cancelBooking, getCancelPreview } from '@/services/bookings';
import { refundMessage } from '@/lib/deposit';
import type { CancelResponse } from '@/types';

export interface CancelDialogProps {
  bookingId: number;
  businessId?: number;
  currency: string;
  cutoffHours: number;
  isOpen: boolean;
  onClose: () => void;
  onCancelled?: (result: CancelResponse) => void;
}

export function CancelDialog({
  bookingId,
  businessId,
  currency,
  cutoffHours,
  isOpen,
  onClose,
  onCancelled,
}: CancelDialogProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const preview = useQuery({
    queryKey: bookingKeys.cancelPreview(bookingId),
    queryFn: () => getCancelPreview(bookingId),
    enabled: isOpen,
    staleTime: 0,
  });

  const mutation = useMutation({
    mutationFn: () => cancelBooking(bookingId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.detail(bookingId) });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.mineAll });
      if (businessId !== undefined) {
        void queryClient.invalidateQueries({ queryKey: ['slots', businessId] });
      }
      const refund = result.refund;
      toast.success(
        'Booking cancelled',
        refund?.eligible && refund.amount_minor > 0
          ? `${formatMoney(refund.amount_minor, currency)} will be refunded to you.`
          : 'No refund was issued.',
      );
      onCancelled?.(result);
      onClose();
    },
    onError: (error) => toast.error('Could not cancel booking', toApiError(error).message),
  });

  const refund = preview.data?.refund;
  const isEligible = refund?.eligible ?? false;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cancel this booking?"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Keep booking
          </Button>
          <Button
            variant="danger"
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            disabled={preview.isLoading}
          >
            Cancel booking
          </Button>
        </>
      }
    >
      {preview.isLoading && (
        <div className="flex justify-center py-4">
          <Spinner label="Checking refund" />
        </div>
      )}
      {preview.isError && (
        <p className="text-sm text-red-600">We could not check your refund right now. {toApiError(preview.error).message}</p>
      )}
      {refund && (
        <p
          data-testid="refund-message"
          className={
            isEligible
              ? 'rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800'
              : 'rounded-xl bg-amber-50 p-4 text-sm text-amber-800'
          }
        >
          {refundMessage(refund, currency, cutoffHours)}
        </p>
      )}
    </Modal>
  );
}
