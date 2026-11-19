import { formatMoney } from '@/lib/money';
import { formatInTz } from '@/lib/datetime';
import { computeDeposit, refundRuleText } from '@/lib/deposit';
import { formatDuration } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { HOLD_MINUTES } from './HoldCountdown';
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
      <dl className="grid gap-4 rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-gray-600">Service</dt>
          <dd className="font-medium text-gray-900">
            {service.name} ({formatDuration(service.duration_minutes)})
          </dd>
        </div>
        <div>
          <dt className="text-gray-600">With</dt>
          <dd className="font-medium text-gray-900">{staffName}</dd>
        </div>
        <div>
          <dt className="text-gray-600">When</dt>
          <dd className="font-medium text-gray-900">
            {formatInTz(slot.start_at, business.timezone, 'EEEE d MMMM yyyy, HH:mm')}
          </dd>
        </div>
        <div>
          <dt className="text-gray-600">Where</dt>
          <dd className="font-medium text-gray-900">{business.name}</dd>
        </div>
      </dl>

      <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-5">
        <div className="flex items-center justify-between text-sm text-gray-700">
          <span>Price</span>
          <span data-testid="price" className="tabular-nums">
            {money(service.price_minor)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-base font-semibold text-brand-900">
          <span>Deposit due now ({business.deposit_percent}%)</span>
          <span data-testid="deposit" className="tabular-nums">
            {money(deposit)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm text-gray-700">
          <span>Pay at appointment</span>
          <span data-testid="balance" className="tabular-nums">
            {money(balance)}
          </span>
        </div>
        <p className="mt-4 flex items-start gap-2 border-t border-brand-200 pt-3 text-sm text-gray-800">
          <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true">
            <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm-1 4h2v2H9V6zm0 4h2v5H9v-5z" />
          </svg>
          {refundRuleText(business.cancellation_cutoff_hours)}
        </p>
      </div>

      <Textarea
        id="booking-note"
        label="Note for the business (optional)"
        rows={3}
        maxLength={500}
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="Anything they should know?"
        hint={`${note.length}/500`}
      />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {onBack ? (
          <Button variant="ghost" onClick={onBack} disabled={isSubmitting}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button size="lg" onClick={onConfirm} isLoading={isSubmitting} loadingText="Starting secure checkout">
          Pay {money(deposit)} deposit
        </Button>
      </div>
      <p className="text-center text-xs text-gray-600 sm:text-right">
        You&apos;ll be taken to secure checkout. Your slot is held for {HOLD_MINUTES} minutes while you pay.
      </p>
    </div>
  );
}
