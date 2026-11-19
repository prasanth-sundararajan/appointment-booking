import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BusinessForm } from '@/components/business/BusinessForm';
import {
  businessFormToPayload,
  defaultBusinessFormValues,
  validateBusinessForm,
  type BusinessFormValues,
} from '@/lib/businessRules';

function values(overrides: Partial<BusinessFormValues> = {}): BusinessFormValues {
  return {
    ...defaultBusinessFormValues(),
    name: 'Glow Salon',
    city: 'London',
    timezone: 'Europe/London',
    currency: 'GBP',
    ...overrides,
  };
}

describe('validateBusinessForm', () => {
  it('defaults to a 20% deposit and 8h cutoff', () => {
    const defaults = defaultBusinessFormValues();
    expect(defaults.deposit_percent).toBe('20');
    expect(defaults.cancellation_cutoff_hours).toBe('8');
  });

  it('accepts valid values', () => {
    expect(validateBusinessForm(values())).toEqual({});
  });

  it.each([
    ['9', 'Deposit must be at least 10'],
    ['101', 'Deposit must be at most 100'],
    ['', 'Deposit is required'],
    ['12.5', 'Deposit must be a whole number'],
  ])('rejects deposit %s', (deposit, message) => {
    expect(validateBusinessForm(values({ deposit_percent: deposit })).deposit_percent).toBe(message);
  });

  it('accepts deposit bounds 10 and 100', () => {
    expect(validateBusinessForm(values({ deposit_percent: '10' })).deposit_percent).toBeUndefined();
    expect(validateBusinessForm(values({ deposit_percent: '100' })).deposit_percent).toBeUndefined();
  });

  it('rejects a negative cancellation cutoff', () => {
    expect(validateBusinessForm(values({ cancellation_cutoff_hours: '-1' })).cancellation_cutoff_hours).toBe(
      'Cancellation cutoff must be at least 0',
    );
  });

  it('builds a numeric payload', () => {
    const payload = businessFormToPayload(values({ deposit_percent: '25', phone: '  ' }));
    expect(payload.deposit_percent).toBe(25);
    expect(payload.cancellation_cutoff_hours).toBe(8);
    expect(payload.phone).toBeNull();
  });
});

describe('BusinessForm', () => {
  it('blocks submit when deposit is below 10% and shows the error', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<BusinessForm initialValues={values()} onSubmit={onSubmit} submitLabel="Save settings" />);

    const deposit = screen.getByLabelText('Deposit (%)');
    await userEvent.clear(deposit);
    await userEvent.type(deposit, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(screen.getByText('Deposit must be at least 10')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('explains the refund rule using the current cutoff', async () => {
    render(<BusinessForm initialValues={values()} onSubmit={vi.fn()} submitLabel="Save" />);
    const rule = screen.getByTestId('refund-rule');
    expect(rule).toHaveTextContent('at least 8h before');
    expect(rule).toHaveTextContent('£10.00 deposit (20%)');

    const cutoff = screen.getByLabelText('Cancellation cutoff (hours)');
    await userEvent.clear(cutoff);
    await userEvent.type(cutoff, '24');
    expect(rule).toHaveTextContent('at least 24h before');
  });

  it('submits a valid payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<BusinessForm initialValues={values()} onSubmit={onSubmit} submitLabel="Save settings" />);
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Glow Salon', deposit_percent: 20, cancellation_cutoff_hours: 8, currency: 'GBP' }),
    );
  });
});
