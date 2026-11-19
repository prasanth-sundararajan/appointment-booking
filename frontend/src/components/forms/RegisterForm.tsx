import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
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

  const set = (field: keyof typeof values) => (value: string) => setValues((v) => ({ ...v, [field]: value }));

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
    <form noValidate onSubmit={handleSubmit} className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-gray-700">How will you use SlotEase?</legend>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
          {ROLE_CHOICES.map((choice) => {
            const active = role === choice.value;
            return (
              <motion.button
                key={choice.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setRole(choice.value)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  'rounded-xl border-2 p-4 text-left transition-colors',
                  active ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:border-brand-200',
                )}
              >
                <span className="block font-semibold text-gray-900">{choice.title}</span>
                <span className="mt-1 block text-xs text-gray-500">{choice.body}</span>
              </motion.button>
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
        value={values.email}
        onChange={(e) => set('email')(e.target.value)}
        error={errors.email ?? serverErrors.email}
      />
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
      <GradientButton type="submit" fullWidth isLoading={submitting}>
        Create account
      </GradientButton>
    </form>
  );
}
