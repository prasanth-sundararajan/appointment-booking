import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MeshBackground } from '@/components/layout/MeshBackground';
import { GlassCard } from '@/components/ui/GlassCard';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { LoginForm } from '@/components/forms/LoginForm';
import { GoogleButton, OrDivider } from '@/components/forms/GoogleButton';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { toApiError } from '@/services/api';
import type { LoginRequest, Me } from '@/types';

interface FromState {
  from?: string;
}

function landingPathFor(user: Me, from?: string): string {
  if (from && from.startsWith('/') && !from.startsWith('/login')) return from;
  const isBusinessUser = user.role !== 'customer' || user.owned_businesses.length > 0 || user.staff_memberships.length > 0;
  return isBusinessUser ? '/dashboard' : '/explore';
}

export default function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [serverErrors, setServerErrors] = useState<Partial<Record<keyof LoginRequest, string>>>({});
  const from = (location.state as FromState | null)?.from;

  // Google callback redirects back with ?error=... on failure.
  const oauthError = params.get('error');
  useEffect(() => {
    if (oauthError) {
      toast.error('Google sign-in failed', 'Please try again or log in with email.');
      params.delete('error');
      setParams(params, { replace: true });
    }
  }, [oauthError, params, setParams, toast]);

  if (!isLoading && user) return <Navigate to={landingPathFor(user, from)} replace />;

  const handleSubmit = async (values: LoginRequest) => {
    setServerErrors({});
    try {
      const me = await login(values);
      toast.success(`Welcome back${me.full_name ? `, ${me.full_name}` : ''}!`);
      navigate(landingPathFor(me, from), { replace: true });
    } catch (error) {
      const apiError = toApiError(error);
      setServerErrors({ email: apiError.fieldErrors.username ?? apiError.fieldErrors.email, password: apiError.fieldErrors.password });
      toast.error('Could not log in', apiError.status === 401 ? 'Incorrect email or password.' : apiError.message);
    }
  };

  return (
    <>
      <MeshBackground />
      <PageWrapper className="flex justify-center">
        <GlassCard hoverable={false} className="w-full max-w-md">
          <h1 className="text-2xl font-bold text-gray-900">Log in</h1>
          <p className="mt-1 text-sm text-gray-500">Welcome back to SlotEase.</p>
          <div className="mt-6">
            <GoogleButton />
            <OrDivider />
            <LoginForm onSubmit={handleSubmit} serverErrors={serverErrors} />
          </div>
          <p className="mt-6 text-center text-sm text-gray-600">
            New here?{' '}
            <Link to="/register" state={location.state} className="font-medium text-brand-600 hover:underline">
              Create an account
            </Link>
          </p>
        </GlassCard>
      </PageWrapper>
    </>
  );
}
