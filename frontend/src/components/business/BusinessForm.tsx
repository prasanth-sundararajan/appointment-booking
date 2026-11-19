import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  MAX_DEPOSIT_PERCENT,
  MIN_DEPOSIT_PERCENT,
  businessFormToPayload,
  validateBusinessForm,
  type BusinessFormErrors,
  type BusinessFormValues,
} from '@/lib/businessRules';
import { computeDeposit } from '@/lib/deposit';
import { formatMoney, minorUnitDigits } from '@/lib/money';
import { CATEGORY_OPTIONS, CURRENCY_OPTIONS, timezoneOptions } from '@/lib/options';
import { BUSINESS_CATEGORIES, type BusinessCategory, type BusinessCreate } from '@/types';

export interface BusinessFormProps {
  initialValues: BusinessFormValues;
  onSubmit: (payload: BusinessCreate) => Promise<void>;
  submitLabel: string;
  /** Field errors returned by the API (422). */
  serverErrors?: Record<string, string>;
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <CardHeader title={title} subtitle={subtitle} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">{children}</div>
      </div>
    </Card>
  );
}

function asCategory(value: string): BusinessCategory {
  return BUSINESS_CATEGORIES.find((c) => c === value) ?? 'other';
}

export function BusinessForm({ initialValues, onSubmit, submitLabel, serverErrors = {} }: BusinessFormProps) {
  const [values, setValues] = useState<BusinessFormValues>(initialValues);
  const [errors, setErrors] = useState<BusinessFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [initialTimezone] = useState(initialValues.timezone);
  const tzOptions = useMemo(() => timezoneOptions(initialTimezone), [initialTimezone]);

  const set = <K extends keyof BusinessFormValues>(field: K, value: BusinessFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const errorFor = (field: keyof BusinessFormValues): string | undefined => errors[field] ?? serverErrors[field];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateBusinessForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      await onSubmit(businessFormToPayload(values));
    } finally {
      setSubmitting(false);
    }
  };

  const depositPercent = Number(values.deposit_percent);
  const cutoff = Number(values.cancellation_cutoff_hours);
  const examplePrice = 50 * 10 ** minorUnitDigits(values.currency || 'USD');
  const depositValid =
    Number.isInteger(depositPercent) && depositPercent >= MIN_DEPOSIT_PERCENT && depositPercent <= MAX_DEPOSIT_PERCENT;
  const cutoffValid = values.cancellation_cutoff_hours.trim() !== '' && Number.isInteger(cutoff) && cutoff >= 0;

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-6">
      <Section title="Business details" subtitle="Shown on your public booking page.">
        <Input label="Business name" required value={values.name} onChange={(e) => set('name', e.target.value)} error={errorFor('name')} />
        <Select
          label="Category"
          options={CATEGORY_OPTIONS}
          value={values.category}
          onChange={(e) => set('category', asCategory(e.target.value))}
          error={errorFor('category')}
        />
        <Input label="City" required value={values.city} onChange={(e) => set('city', e.target.value)} error={errorFor('city')} />
        <Input label="Address" value={values.address} onChange={(e) => set('address', e.target.value)} error={errorFor('address')} />
        <Input label="Phone" type="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} error={errorFor('phone')} />
        <Input
          label="Contact email"
          type="email"
          value={values.email}
          onChange={(e) => set('email', e.target.value)}
          error={errorFor('email')}
        />
        <Textarea
          label="Description"
          containerClassName="sm:col-span-2"
          placeholder="Tell customers what you do and what to expect."
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </Section>

      <Section title="Region" subtitle="Slots are calculated in this timezone. Deposits are charged in this currency.">
        <Select
          label="Timezone"
          options={tzOptions}
          value={values.timezone}
          onChange={(e) => set('timezone', e.target.value)}
          error={errorFor('timezone')}
        />
        <Select
          label="Currency"
          options={CURRENCY_OPTIONS}
          value={values.currency}
          onChange={(e) => set('currency', e.target.value)}
          error={errorFor('currency')}
        />
      </Section>

      <Section title="Deposits & cancellations" subtitle="Every booking requires a deposit, which cuts no-shows.">
        <Input
          label="Deposit (%)"
          type="number"
          inputMode="numeric"
          min={MIN_DEPOSIT_PERCENT}
          max={MAX_DEPOSIT_PERCENT}
          value={values.deposit_percent}
          onChange={(e) => set('deposit_percent', e.target.value)}
          error={errorFor('deposit_percent')}
          hint={`Default 20%. Between ${MIN_DEPOSIT_PERCENT}% and ${MAX_DEPOSIT_PERCENT}%.`}
        />
        <Input
          label="Cancellation cutoff (hours)"
          type="number"
          inputMode="numeric"
          min={0}
          value={values.cancellation_cutoff_hours}
          onChange={(e) => set('cancellation_cutoff_hours', e.target.value)}
          error={errorFor('cancellation_cutoff_hours')}
          hint="Default 8 hours."
        />
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-950 sm:col-span-2" data-testid="refund-rule">
          <p className="font-semibold">How refunds work</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              {depositValid
                ? `On a ${formatMoney(examplePrice, values.currency || 'USD')} service, customers pay a ${formatMoney(
                    computeDeposit(examplePrice, depositPercent),
                    values.currency || 'USD',
                  )} deposit (${depositPercent}%) to book.`
                : 'Customers pay a deposit when they book.'}
            </li>
            <li>
              {cutoffValid
                ? `Customer cancels at least ${cutoff}h before the start: full deposit refund. Later than that: no refund.`
                : 'Customers who cancel before the cutoff get a full deposit refund; later cancellations are not refunded.'}
            </li>
            <li>If your business cancels, the customer always gets a full refund.</li>
            <li>Customers can reschedule before the cutoff and keep their deposit.</li>
          </ul>
        </div>
      </Section>

      <Section title="Booking window" subtitle="Controls which slots customers can see.">
        <Input
          label="Buffer between bookings (minutes)"
          type="number"
          inputMode="numeric"
          min={0}
          value={values.booking_buffer_minutes}
          onChange={(e) => set('booking_buffer_minutes', e.target.value)}
          error={errorFor('booking_buffer_minutes')}
        />
        <Input
          label="Minimum notice (hours)"
          type="number"
          inputMode="numeric"
          min={0}
          value={values.min_notice_hours}
          onChange={(e) => set('min_notice_hours', e.target.value)}
          error={errorFor('min_notice_hours')}
          hint="How soon before a slot it can still be booked."
        />
        <Input
          label="Maximum advance (days)"
          type="number"
          inputMode="numeric"
          min={1}
          value={values.max_advance_days}
          onChange={(e) => set('max_advance_days', e.target.value)}
          error={errorFor('max_advance_days')}
          hint="How far ahead customers can book."
        />
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-card sm:border sm:shadow-card">
        {Object.values(errors).some(Boolean) && (
          <p className="mr-auto text-sm text-red-700" role="alert">
            Please fix the highlighted fields.
          </p>
        )}
        <GradientButton type="submit" isLoading={submitting}>
          {submitLabel}
        </GradientButton>
      </div>
    </form>
  );
}
