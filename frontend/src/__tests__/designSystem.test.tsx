import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox, ToggleChip } from '@/components/ui/Checkbox';
import { CopyButton } from '@/components/ui/CopyButton';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { DateStrip } from '@/components/booking/DateStrip';
import { absoluteAppUrl } from '@/lib/url';
import { initialsOf, isBusinessUser } from '@/lib/roles';
import type { Me } from '@/types';

describe('Button', () => {
  it('marks itself busy and announces the loading text', () => {
    render(
      <Button isLoading loadingText="Saving">
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: /Save/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: 'Saving' })).toBeInTheDocument();
  });

  it('ButtonLink renders a router link, not a nested button', () => {
    render(
      <MemoryRouter>
        <ButtonLink to="/explore">Explore</ButtonLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Explore' });
    expect(link).toHaveAttribute('href', '/explore');
    expect(link.querySelector('button')).toBeNull();
  });
});

describe('Form fields', () => {
  it('Input links its error message via aria-describedby', () => {
    render(<Input label="Email" error="Enter a valid email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid email');
  });

  it('Input shows a hint when there is no error', () => {
    render(<Input label="Password" hint="At least 8 characters" />);
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('At least 8 characters');
  });

  it('Textarea and Select are labelled', () => {
    render(
      <>
        <Textarea label="Note" />
        <Select label="Currency" options={[{ value: 'USD', label: 'USD' }]} />
      </>,
    );
    expect(screen.getByLabelText('Note').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Currency').tagName).toBe('SELECT');
  });
});

describe('Checkbox and ToggleChip', () => {
  it('Checkbox is a native, labelled checkbox with a description', async () => {
    function Harness() {
      const [checked, setChecked] = useState(false);
      return (
        <Checkbox
          label="Active"
          description="Bookable by customers"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
      );
    }
    render(<Harness />);
    const box = screen.getByRole('checkbox', { name: 'Active' });
    expect(box).toHaveAccessibleDescription('Bookable by customers');
    await userEvent.click(screen.getByText('Active'));
    expect(box).toBeChecked();
  });

  it('ToggleChip exposes aria-pressed and reports the next state', async () => {
    const onPressedChange = vi.fn();
    render(
      <ToggleChip pressed={false} onPressedChange={onPressedChange}>
        Salon
      </ToggleChip>,
    );
    const chip = screen.getByRole('button', { name: 'Salon' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });
});

describe('Modal', () => {
  it('is labelled and described, and moves focus inside', async () => {
    render(
      <>
        <button type="button">Opener</button>
        <Modal isOpen onClose={() => undefined} title="Invite staff" description="We'll email them.">
          <input aria-label="Name" />
        </Modal>
      </>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Invite staff' });
    expect(dialog).toHaveAccessibleDescription("We'll email them.");
    await vi.waitFor(() => expect(screen.getByLabelText('Name')).toHaveFocus());
  });

  it('traps Tab focus inside the dialog', async () => {
    render(
      <Modal isOpen onClose={() => undefined} title="Confirm" footer={<button type="button">OK</button>}>
        <input aria-label="Field" />
      </Modal>,
    );
    await vi.waitFor(() => expect(screen.getByLabelText('Field')).toHaveFocus());
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });
});

describe('EmptyState / ErrorState', () => {
  it('EmptyState renders a heading and a next action', () => {
    render(<EmptyState title="No services yet" description="Add one" action={<button type="button">Add service</button>} />);
    expect(screen.getByRole('heading', { name: 'No services yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add service' })).toBeInTheDocument();
  });

  it('ErrorState is an alert with retry', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Network down" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('CopyButton', () => {
  it('copies the value and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onCopied = vi.fn();
    render(<CopyButton value="https://example.com/b/glow" onCopied={onCopied} />);
    await userEvent.click(screen.getByRole('button', { name: /Copy link/ }));
    expect(writeText).toHaveBeenCalledWith('https://example.com/b/glow');
    expect(onCopied).toHaveBeenCalled();
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });
});

describe('DateStrip', () => {
  const dates = ['2026-12-01', '2026-12-02', '2026-12-03'];

  it('labels today and selects on click', async () => {
    const onSelect = vi.fn();
    render(<DateStrip dates={dates} selected={null} today="2026-12-01" onSelect={onSelect} />);
    expect(screen.getByRole('option', { name: /Tuesday 1 December \(today\)/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: /Wednesday 2 December/ }));
    expect(onSelect).toHaveBeenCalledWith('2026-12-02');
  });

  it('moves focus with arrow keys (roving tabindex)', async () => {
    render(<DateStrip dates={dates} selected="2026-12-01" onSelect={() => undefined} />);
    const first = screen.getByRole('option', { name: /1 December/ });
    expect(first).toHaveAttribute('tabindex', '0');
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('option', { name: /2 December/ })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('option', { name: /3 December/ })).toHaveFocus();
  });
});

describe('helpers', () => {
  it('absoluteAppUrl respects the Vite base path', () => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    expect(absoluteAppUrl('/b/glow', 'https://app.test')).toBe(`https://app.test${base}/b/glow`);
    expect(absoluteAppUrl('b/glow', 'https://app.test')).toBe(`https://app.test${base}/b/glow`);
  });

  it('initialsOf builds initials', () => {
    expect(initialsOf('Ann Lee Smith')).toBe('AS');
    expect(initialsOf('ann')).toBe('A');
    expect(initialsOf('', 'zed@example.com')).toBe('Z');
  });

  it('isBusinessUser detects owners, staff and members', () => {
    const base: Me = {
      id: 1,
      email: 'a@b.co',
      full_name: 'A',
      role: 'customer',
      is_active: true,
      is_verified: true,
      oauth_provider: null,
      created_at: '',
      updated_at: '',
      owned_businesses: [],
      staff_memberships: [],
    };
    expect(isBusinessUser(base)).toBe(false);
    expect(isBusinessUser({ ...base, role: 'owner' })).toBe(true);
    expect(
      isBusinessUser({
        ...base,
        staff_memberships: [{ staff_id: 1, business_id: 2, business_name: 'X', business_slug: 'x' }],
      }),
    ).toBe(true);
    expect(isBusinessUser(null)).toBe(false);
  });
});
