import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { refreshAccessToken } from '@/services/api';
import type { Me } from '@/types';

function landingPath(user: Me): string {
  const isBusinessUser = user.role !== 'customer' || user.owned_businesses.length > 0 || user.staff_memberships.length > 0;
  return isBusinessUser ? '/dashboard' : '/explore';
}

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
        navigate(landingPath(me), { replace: true });
      } else {
        navigate('/login?error=google', { replace: true });
      }
    })();
  }, [isLoading, user, reload, navigate, toast]);

  return <FullPageSpinner />;
}
