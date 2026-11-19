import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SlotGrid } from '@/components/booking/SlotGrid';
import { ConfirmStep } from '@/components/booking/ConfirmStep';
import { CancelDialog } from '@/components/booking/CancelDialog';
import { ToastProvider } from '@/context/ToastContext';
import { computeDeposit } from '@/lib/deposit';
import { removeTakenSlot } from '@/hooks/useBusinessSocket';
import type { CancelPreview, Slot } from '@/types';

const getCancelPreview = vi.fn<(id: number) => Promise<CancelPreview>>();

vi.mock('@/services/bookings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/bookings')>();
  return {
    ...actual,
    getCancelPreview: (id: number) => getCancelPreview(id),
    cancelBooking: vi.fn(),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

const slot = (start: string, end: string, staff: number[] = [1]): Slot => ({
  start_at: start,
  end_at: end,
  staff_ids: staff,
});

const SLOTS: Slot[] = [
  slot('2026-12-01T09:00:00Z', '2026-12-01T09:30:00Z', [1, 2]),
  slot('2026-12-01T09:30:00Z', '2026-12-01T10:00:00Z'),
  slot('2026-12-01T10:00:00Z', '2026-12-01T10:30:00Z'),
];

describe('SlotGrid', () => {
  it('renders slot times in the business timezone and selects a slot', async () => {
    const onSelect = vi.fn();
    render(<SlotGrid slots={SLOTS} timezone="Europe/London" onSelect={onSelect} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['09:00', '09:30', '10:00']);
    await userEvent.click(screen.getByRole('button', { name: '09:30' }));
    expect(onSelect).toHaveBeenCalledWith(SLOTS[1]);
  });

  it('marks the selected slot as pressed', () => {
    render(
      <SlotGrid slots={SLOTS} timezone="UTC" selectedStart={SLOTS[2].start_at} onSelect={() => undefined} />,
    );
    expect(screen.getByRole('button', { name: '10:00' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '09:00' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('removes a slot when it is taken', async () => {
    const { rerender } = render(<SlotGrid slots={SLOTS} timezone="UTC" onSelect={() => undefined} />);
    const next = removeTakenSlot(SLOTS, { staff_id: 1, start_at: SLOTS[1].start_at, end_at: SLOTS[1].end_at });
    rerender(<SlotGrid slots={next} timezone="UTC" onSelect={() => undefined} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: '09:30' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '09:00' })).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    render(<SlotGrid slots={[]} timezone="UTC" onSelect={() => undefined} />);
    expect(screen.getByText(/no open slots/i)).toBeInTheDocument();
  });
});

describe('removeTakenSlot', () => {
  it('keeps a merged slot open while other staff are free', () => {
    const next = removeTakenSlot(SLOTS, { staff_id: 2, start_at: SLOTS[0].start_at, end_at: SLOTS[0].end_at });
    expect(next[0].staff_ids).toEqual([1]);
    expect(next).toHaveLength(3);
  });
});

describe('Deposit display', () => {
  it('computes the deposit rounded half-up', () => {
    expect(computeDeposit(5000, 20)).toBe(1000);
    expect(computeDeposit(1999, 25)).toBe(500); // 499.75 -> 500
    expect(computeDeposit(1002, 25)).toBe(251); // 250.5 -> 251
    expect(computeDeposit(1000, 100)).toBe(1000);
  });

  it('shows price, deposit and refund rule on the confirm step', () => {
    render(
      <ConfirmStep
        business={{
          name: 'Glow Salon',
          currency: 'USD',
          timezone: 'UTC',
          deposit_percent: 20,
          cancellation_cutoff_hours: 8,
        }}
        service={{ name: 'Haircut', duration_minutes: 45, price_minor: 4550 }}
        slot={SLOTS[0]}
        staffName="Any available"
        note=""
        onNoteChange={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(screen.getByTestId('price')).toHaveTextContent('$45.50');
    expect(screen.getByTestId('deposit')).toHaveTextContent('$9.10');
    expect(screen.getByTestId('balance')).toHaveTextContent('$36.40');
    expect(screen.getByText('Cancel at least 8h before for a full deposit refund.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pay \$9\.10 deposit/i })).toBeInTheDocument();
  });
});

describe('CancelDialog', () => {
  beforeEach(() => getCancelPreview.mockReset());

  it('states the full refund when eligible', async () => {
    getCancelPreview.mockResolvedValue({ refund: { eligible: true, amount_minor: 1000 } });
    render(
      <CancelDialog bookingId={7} currency="USD" cutoffHours={8} isOpen onClose={() => undefined} />,
      { wrapper },
    );
    expect(await screen.findByTestId('refund-message')).toHaveTextContent(
      'You will get a full refund of your $10.00 deposit.',
    );
    expect(getCancelPreview).toHaveBeenCalledWith(7);
  });

  it('states no refund inside the cutoff', async () => {
    getCancelPreview.mockResolvedValue({ refund: { eligible: false, amount_minor: 0 } });
    render(
      <CancelDialog bookingId={8} currency="USD" cutoffHours={12} isOpen onClose={() => undefined} />,
      { wrapper },
    );
    expect(await screen.findByTestId('refund-message')).toHaveTextContent(
      'No refund: cancellations less than 12h before the start time are not refunded.',
    );
  });

  it('does not fetch the preview while closed', () => {
    render(
      <CancelDialog bookingId={9} currency="USD" cutoffHours={8} isOpen={false} onClose={() => undefined} />,
      { wrapper },
    );
    expect(getCancelPreview).not.toHaveBeenCalled();
  });
});
