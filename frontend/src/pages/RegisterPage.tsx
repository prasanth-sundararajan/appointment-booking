import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '@/components/layout/AuthShell';
import { RegisterForm } from '@/components/forms/RegisterForm';
import { GoogleButton, OrDivider } from '@/components/forms/GoogleButton';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import type { RegisterErrors } from '@/lib/authValidation';
import { toApiError } from '@/services/api';
import type { RegisterRequest } from '@/types';

interface FromState {
  from?: string;
}

export default function RegisterPage() {
  const { register, user, isLoading } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [serverErrors, setServerErrors] = useState<RegisterErrors>({});
  const from = (location.state as FromState | null)?.from;
  const initialRole = params.get('role') === 'owner' ? 'owner' : 'customer';

  if (!isLoading && user) return <Navigate to={from ?? '/'} replace />;

  const handleSubmit = async (values: RegisterRequest) => {
    setServerErrors({});
    try {
      await register(values);
      toast.success('Account created', 'Welcome to SlotEase!');
      if (from) navigate(from, { replace: true });
      else navigate(values.role === 'owner' ? '/dashboard/businesses/new' : '/explore', { replace: true });
    } catch (error) {
      const apiError = toApiError(error);
      setServerErrors({
        email: apiError.fieldErrors.email ?? (apiError.status === 409 ? 'This email is already registered' : undefined),
        password: apiError.fieldErrors.password,
        full_name: apiError.fieldErrors.full_name,
      });
      toast.error('Could not create account', apiError.message);
    }
  };

  return (
    <AuthShell
      title={initialRole === 'owner' ? 'Create your business account' : 'Create your account'}
      subtitle={
        initialRole === 'owner'
          ? 'Set up a booking page with deposits and staff in a few minutes.'
          : 'Book appointments or run your business on SlotEase.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" state={location.state} className="link">
            Log in
          </Link>
        </>
      }
    >
      <GoogleButton label="Sign up with Google" />
      <OrDivider />
      <RegisterForm initialRole={initialRole} onSubmit={handleSubmit} serverErrors={serverErrors} />
    </AuthShell>
  );
}
