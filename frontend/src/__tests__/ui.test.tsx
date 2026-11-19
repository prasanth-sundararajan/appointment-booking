import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatMoney } from '@/lib/money';

describe('UI primitives', () => {
  it('Button fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('Button is disabled while loading', () => {
    render(<Button isLoading>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('Modal renders title when open and closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Cancel booking">
        body
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Cancel booking');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('Badge renders children', () => {
    render(<Badge tone="green">Confirmed</Badge>);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });
});

describe('formatMoney', () => {
  it('formats minor units', () => {
    expect(formatMoney(2050, 'USD', 'en-US')).toBe('$20.50');
    expect(formatMoney(500, 'JPY', 'en-US')).toBe('¥500');
  });
});
