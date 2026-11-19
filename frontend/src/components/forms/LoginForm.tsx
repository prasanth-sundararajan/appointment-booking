import { useState, type FormEvent } from 'react';
import { GradientButton } from '@/components/ui/GradientButton';
import { Input } from '@/components/ui/Input';
import { validateLogin, type LoginErrors } from '@/lib/authValidation';
import type { LoginRequest } from '@/types';

export interface LoginFormProps {
  onSubmit: (values: LoginRequest) => Promise<void>;
  /** Server-side field errors (e.g. from a 422). */
  serverErrors?: Partial<Record<keyof LoginRequest, string>>;
}

type Errors = LoginErrors;

export function LoginForm({ onSubmit, serverErrors = {} }: LoginFormProps) {
  const [values, setValues] = useState<LoginRequest>({ email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateLogin(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      await onSubmit({ email: values.email.trim(), password: values.password });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
        error={errors.email ?? serverErrors.email}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        value={values.password}
        onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
        error={errors.password ?? serverErrors.password}
      />
      <GradientButton type="submit" fullWidth isLoading={submitting}>
        Log in
      </GradientButton>
    </form>
  );
}
