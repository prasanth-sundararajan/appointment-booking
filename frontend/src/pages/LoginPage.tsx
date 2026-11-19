import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '@/components/layout/AuthShell';
import { LoginForm } from '@/components/forms/LoginForm';
import { GoogleButton, OrDivider } from '@/components/forms/GoogleButton';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { homePathFor } from '@/lib/roles';
import { toApiError } from '@/services/api';
import type { LoginRequest, Me } from '@/types';

interface FromState {
  from?: string;
}

function landingPathFor(user: Me, from?: string): string {
  if (from && from.startsWith('/') && !from.startsWith('/login')) return from;
  return homePathFor(user);
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
      setServerErrors({
        email: apiError.fieldErrors.username ?? apiError.fieldErrors.email,
        password: apiError.fieldErrors.password ?? (apiError.status === 401 ? 'Incorrect email or password' : undefined),
      });
      toast.error('Could not log in', apiError.status === 401 ? 'Incorrect email or password.' : apiError.message);
    }
  };

  return (
    <AuthShell
      title="Log in"
      subtitle={from ? 'Log in to continue where you left off.' : 'Welcome back to SlotEase.'}
      footer={
        <>
          New here?{' '}
          <Link to="/register" state={location.state} className="link">
            Create an account
          </Link>
        </>
      }
    >
      <GoogleButton />
      <OrDivider />
      <LoginForm onSubmit={handleSubmit} serverErrors={serverErrors} />
    </AuthShell>
  );
}
