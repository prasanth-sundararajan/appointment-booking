import type { LoginRequest, RegisterRequest } from '@/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginErrors = Partial<Record<keyof LoginRequest, string>>;
export type RegisterErrors = Partial<Record<keyof RegisterRequest | 'confirm', string>>;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function validateLogin(values: LoginRequest): LoginErrors {
  const errors: LoginErrors = {};
  if (!values.email.trim()) errors.email = 'Email is required';
  else if (!isEmail(values.email)) errors.email = 'Enter a valid email';
  if (!values.password) errors.password = 'Password is required';
  return errors;
}

export function validateRegister(values: RegisterRequest & { confirm: string }): RegisterErrors {
  const errors: RegisterErrors = {};
  if (values.full_name.trim().length < 2) errors.full_name = 'Enter your full name';
  if (!isEmail(values.email)) errors.email = 'Enter a valid email';
  if (values.password.length < 8) errors.password = 'Use at least 8 characters';
  if (values.confirm !== values.password) errors.confirm = 'Passwords do not match';
  return errors;
}
