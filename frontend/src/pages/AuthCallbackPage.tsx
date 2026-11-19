import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { homePathFor } from '@/lib/roles';
import { refreshAccessToken } from '@/services/api';

/**
 * Google login lands here with only the httpOnly refresh cookie set.
 * Exchange it for an access token, load /auth/me, then route by role.
 */
export default function AuthCallbackPage() {
  const { user, isLoading, reload } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const started = useRef(false);

  useEffect(() => {
    if (isLoading || started.current) return;
    started.current = true;
    (async () => {
      let me = user;
      if (!me) {
        const token = await refreshAccessToken();
        me = token ? await reload() : null;
      }
      if (me) {
        toast.success(`Signed in${me.full_name ? ` as ${me.full_name}` : ''}`);
        navigate(homePathFor(me), { replace: true });
      } else {
        navigate('/login?error=google', { replace: true });
      }
    })();
  }, [isLoading, user, reload, navigate, toast]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-card">
        <Spinner size="lg" label="Signing you in" />
        <h1 className="mt-5 text-lg font-semibold text-gray-900">Signing you in</h1>
        <p className="mt-1 text-sm text-gray-600">Finishing Google sign-in. This only takes a moment.</p>
      </div>
    </div>
  );
}
