import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MeshBackground } from '@/components/layout/MeshBackground';
import { GlassCard } from '@/components/ui/GlassCard';
import { PageWrapper } from '@/components/ui/PageWrapper';
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
    <>
      <MeshBackground />
      <PageWrapper className="flex justify-center">
        <GlassCard hoverable={false} className="w-full max-w-lg">
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">Book appointments or run your business on SlotEase.</p>
          <div className="mt-6">
            <GoogleButton label="Sign up with Google" />
            <OrDivider />
            <RegisterForm initialRole={initialRole} onSubmit={handleSubmit} serverErrors={serverErrors} />
          </div>
          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" state={location.state} className="font-medium text-brand-600 hover:underline">
              Log in
            </Link>
          </p>
        </GlassCard>
      </PageWrapper>
    </>
  );
}
