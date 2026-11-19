import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/cn';
import { GradientButton } from '@/components/ui/GradientButton';
import { Input } from '@/components/ui/Input';
import { validateRegister, type RegisterErrors } from '@/lib/authValidation';
import type { RegisterRequest } from '@/types';

type Role = RegisterRequest['role'];
type Errors = RegisterErrors;

export interface RegisterFormProps {
  initialRole?: Role;
  onSubmit: (values: RegisterRequest) => Promise<void>;
  serverErrors?: Errors;
}

const ROLE_CHOICES: { value: Role; title: string; body: string }[] = [
  { value: 'customer', title: 'I want to book', body: 'Find businesses and book appointments.' },
  { value: 'owner', title: 'I run a business', body: 'Take bookings, deposits and manage staff.' },
];

export function RegisterForm({ initialRole = 'customer', onSubmit, serverErrors = {} }: RegisterFormProps) {
  const [values, setValues] = useState({ full_name: '', email: '', password: '', confirm: '' });
  const [role, setRole] = useState<Role>(initialRole);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (field: keyof typeof values) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((err) => ({ ...err, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateRegister({ ...values, role });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      await onSubmit({
        full_name: values.full_name.trim(),
        email: values.email.trim(),
        password: values.password,
        role,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-4" aria-label="Create account">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">How will you use SlotEase?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLE_CHOICES.map((choice) => {
            const active = role === choice.value;
            return (
              <label
                key={choice.value}
                className={cn(
                  'relative flex cursor-pointer gap-3 rounded-xl border-2 p-4 transition-colors',
                  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400 has-[:focus-visible]:ring-offset-2',
                  active ? 'border-brand-400 bg-brand-500/10' : 'border-line bg-surface hover:border-brand-400/50',
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={choice.value}
                  checked={active}
                  onChange={() => setRole(choice.value)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500 focus:outline-none focus-visible:ring-0"
                />
                <span>
                  <span className="block font-semibold text-ink">{choice.title}</span>
                  <span className="mt-0.5 block text-sm text-ink-muted">{choice.body}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Input
        label="Full name"
        autoComplete="name"
        value={values.full_name}
        onChange={(e) => set('full_name')(e.target.value)}
        error={errors.full_name ?? serverErrors.full_name}
      />
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={values.email}
        onChange={(e) => set('email')(e.target.value)}
        error={errors.email ?? serverErrors.email}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters"
          value={values.password}
          onChange={(e) => set('password')(e.target.value)}
          error={errors.password ?? serverErrors.password}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={(e) => set('confirm')(e.target.value)}
          error={errors.confirm}
        />
      </div>
      <GradientButton type="submit" size="lg" fullWidth isLoading={submitting} loadingText="Creating account">
        Create account
      </GradientButton>
    </form>
  );
}
