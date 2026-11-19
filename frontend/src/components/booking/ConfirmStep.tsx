import { formatMoney } from '@/lib/money';
import { formatInTz } from '@/lib/datetime';
import { computeDeposit, refundRuleText } from '@/lib/deposit';
import { Button } from '@/components/ui/Button';
import type { Business, Service, Slot } from '@/types';

export interface ConfirmStepProps {
  business: Pick<Business, 'name' | 'currency' | 'timezone' | 'deposit_percent' | 'cancellation_cutoff_hours'>;
  service: Pick<Service, 'name' | 'duration_minutes' | 'price_minor'>;
  slot: Slot;
  staffName: string;
  note: string;
  onNoteChange: (note: string) => void;
  onConfirm: () => void;
  onBack?: () => void;
  isSubmitting?: boolean;
}

export function ConfirmStep({
  business,
  service,
  slot,
  staffName,
  note,
  onNoteChange,
  onConfirm,
  onBack,
  isSubmitting = false,
}: ConfirmStepProps) {
  const deposit = computeDeposit(service.price_minor, business.deposit_percent);
  const balance = service.price_minor - deposit;
  const money = (minor: number) => formatMoney(minor, business.currency);

  return (
    <div className="space-y-6">
      <dl className="grid gap-3 rounded-2xl bg-gray-50 p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-gray-500">Service</dt>
          <dd className="font-medium text-gray-900">
            {service.name} ({service.duration_minutes} min)
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">With</dt>
          <dd className="font-medium text-gray-900">{staffName}</dd>
        </div>
        <div>
          <dt className="text-gray-500">When</dt>
          <dd className="font-medium text-gray-900">
            {formatInTz(slot.start_at, business.timezone, 'EEEE d MMMM yyyy, HH:mm')}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Where</dt>
          <dd className="font-medium text-gray-900">{business.name}</dd>
        </div>
      </dl>

      <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-5">
        <div className="flex items-center justify-between text-sm text-gray-700">
          <span>Price</span>
          <span data-testid="price">{money(service.price_minor)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-base font-semibold text-brand-800">
          <span>Deposit due now ({business.deposit_percent}%)</span>
          <span data-testid="deposit">{money(deposit)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm text-gray-500">
          <span>Pay at appointment</span>
          <span data-testid="balance">{money(balance)}</span>
        </div>
        <p className="mt-4 text-sm text-gray-600">{refundRuleText(business.cancellation_cutoff_hours)}</p>
      </div>

      <div>
        <label htmlFor="booking-note" className="mb-1 block text-sm font-medium text-gray-700">
          Note for the business (optional)
        </label>
        <textarea
          id="booking-note"
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-gray-900 outline-none transition-colors focus:border-brand-500"
          placeholder="Anything they should know?"
        />
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        {onBack ? (
          <Button variant="ghost" onClick={onBack} disabled={isSubmitting}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button size="lg" onClick={onConfirm} isLoading={isSubmitting}>
          Pay {money(deposit)} deposit
        </Button>
      </div>
    </div>
  );
}
