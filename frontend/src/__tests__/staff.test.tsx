import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ServiceChecklist } from '@/components/staff/ServiceChecklist';
import type { Service } from '@/types';

const service = (id: number, name: string, duration: number, price: number, active = true): Service => ({
  id,
  business_id: 1,
  name,
  description: null,
  duration_minutes: duration,
  price_minor: price,
  is_active: active,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const SERVICES: Service[] = [
  service(1, 'Haircut', 45, 4500),
  service(2, 'Colour', 90, 12000),
  service(3, 'Beard trim', 15, 1500, false),
];

function Controlled({ initial = [], onChange }: { initial?: number[]; onChange?: (ids: number[]) => void }) {
  const [selected, setSelected] = useState<number[]>(initial);
  return (
    <ServiceChecklist
      services={SERVICES}
      selected={selected}
      currency="USD"
      onChange={(ids) => {
        setSelected(ids);
        onChange?.(ids);
      }}
    />
  );
}

describe('ServiceChecklist (staff service assignment)', () => {
  it('renders one labelled checkbox per service with duration and price', () => {
    render(<Controlled />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: /Haircut/ })).not.toBeChecked();
    expect(screen.getByText('$45.00')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Haircut' })).toHaveAccessibleDescription(/\$45\.00/);
    expect(screen.getByText('45 min')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
    expect(screen.getByText(/Inactive/)).toBeInTheDocument();
  });

  it('reflects existing assignments as checked', () => {
    render(<Controlled initial={[2]} />);
    expect(screen.getByRole('checkbox', { name: /Colour/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Haircut/ })).not.toBeChecked();
    expect(screen.getByText('1 of 3 selected')).toBeInTheDocument();
  });

  it('toggles a service when its row label is clicked', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByText('Haircut'));
    expect(onChange).toHaveBeenLastCalledWith([1]);
    expect(screen.getByRole('checkbox', { name: /Haircut/ })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: /Haircut/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('is keyboard operable with Space', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    screen.getByRole('checkbox', { name: /Colour/ }).focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith([2]);
  });

  it('selects and clears all', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(onChange).toHaveBeenLastCalledWith([1, 2, 3]);
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('warns when nothing is selected', () => {
    render(<Controlled />);
    expect(screen.getByText(/No services selected/)).toBeInTheDocument();
  });

  it('explains what to do when there are no services', () => {
    render(<ServiceChecklist services={[]} selected={[]} onChange={() => undefined} currency="USD" emptyAction={<a href="#s">Add services</a>} />);
    expect(screen.getByText(/Add services first/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add services' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
