import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MeshBackground } from '@/components/layout/MeshBackground';
import { EmptyState, LoadingBlock } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { toApiError } from '@/services/api';
import { staffKeys, staffService } from '@/services/staff';
import type { ApiError, StaffInviteInfo, StaffMember } from '@/types';

export default function AcceptInvitePage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isLoading: authLoading, reload, logout } = useAuth();

  const invite = useQuery<StaffInviteInfo, ApiError>({
    queryKey: staffKeys.invite(token),
    queryFn: () => staffService.invitePreview(token),
    enabled: token !== '',
  });

  const accept = useMutation<StaffMember, ApiError>({
    mutationFn: () => staffService.acceptInvite(token),
    onSuccess: async (member) => {
      await reload();
      toast.success('Invite accepted', `You're now on the team as ${member.display_name}.`);
      navigate(`/dashboard/b/${member.business_id}/availability`, { replace: true });
    },
    onError: (err) => {
      const apiError = toApiError(err);
      toast.error(
        'Could not accept invite',
        apiError.status === 403 ? 'This invite was sent to a different email address.' : apiError.message,
      );
    },
  });

  const from = `/invite/${token}`;
  const info = invite.data;
  const emailMismatch = Boolean(user && info && user.email.toLowerCase() !== info.email.toLowerCase());

  let body: ReactNode;
  if (invite.isLoading || authLoading) {
    body = <LoadingBlock />;
  } else if (invite.isError || !info) {
    body = (
      <EmptyState
        title="Invite not found"
        description="This invite link is invalid, was already used, or has been revoked. Ask the business owner for a new one."
      />
    );
  } else {
    body = (
      <GlassCard hoverable={false} className="mx-auto max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-pink-500 text-2xl font-bold text-white">
          {info.business_name.charAt(0).toUpperCase()}
        </span>
        <h1 className="mt-4 text-xl font-bold text-gray-900">Join {info.business_name}</h1>
        <p className="mt-2 text-sm text-gray-600">
          You've been invited as <span className="font-medium">{info.display_name}</span>. You'll be able to manage your
          hours, time off and bookings.
        </p>
        <p className="mt-1 text-xs text-gray-500">Invite for {info.email}</p>

        {!user ? (
          <div className="mt-6 space-y-3">
            <GradientButton fullWidth onClick={() => navigate('/login', { state: { from } })}>
              Log in to accept
            </GradientButton>
            <Button variant="outline" fullWidth onClick={() => navigate('/register', { state: { from } })}>
              Create an account
            </Button>
          </div>
        ) : emailMismatch ? (
          <div className="mt-6 rounded-xl bg-amber-50 p-4 text-left text-sm text-amber-800">
            You're signed in as <strong>{user.email}</strong>, but this invite is for <strong>{info.email}</strong>.
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={async () => {
                await logout();
                navigate('/login', { state: { from } });
              }}
            >
              Switch account
            </Button>
          </div>
        ) : (
          <GradientButton className="mt-6" fullWidth isLoading={accept.isPending} onClick={() => accept.mutate()}>
            Accept invite
          </GradientButton>
        )}
      </GlassCard>
    );
  }

  return (
    <>
      <MeshBackground />
      <PageWrapper>{body}</PageWrapper>
    </>
  );
}
