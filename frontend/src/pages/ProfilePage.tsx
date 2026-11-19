import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Badge, formatStatus } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Input } from '@/components/ui/Input';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { initialsOf } from '@/lib/roles';
import { toApiError } from '@/services/api';
import { authService } from '@/services/auth';
import type { ApiError, ProfileUpdate, User } from '@/types';

function BecomeOwnerCard({ onClick, isLoading }: { onClick: () => void; isLoading: boolean }) {
  return (
    <section
      aria-labelledby="run-business-heading"
      className="mb-6 flex flex-col gap-5 overflow-hidden rounded-card border border-brand-400/30 bg-gradient-to-br from-brand-500/10 via-transparent to-accent-500/10 p-6 shadow-card sm:flex-row sm:items-center sm:p-8"
    >
      <div className="min-w-0 flex-1">
        <h2 id="run-business-heading" className="text-lg font-bold text-ink">
          Run a business? Take bookings on SlotEase.
        </h2>
        <p className="mt-1 text-sm text-slate-200">
          Get a public booking page, collect deposits that cut no-shows, and manage your team&apos;s hours. Your customer
          bookings stay right where they are.
        </p>
      </div>
      <GradientButton size="lg" className="shrink-0" isLoading={isLoading} onClick={onClick}>
        I run a business
      </GradientButton>
    </section>
  );
}

export default function ProfilePage() {
  const { user, reload } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setFullName(user?.full_name ?? '');
  }, [user?.full_name]);

  const mutation = useMutation<User, ApiError, ProfileUpdate>({
    mutationFn: (payload) => authService.updateMe(payload),
    onSuccess: async () => {
      await reload();
      toast.success('Profile updated');
    },
    onError: (err) => {
      const apiError = toApiError(err);
      setError(apiError.fieldErrors.full_name);
      toast.error('Could not update profile', apiError.message);
    },
  });

  const ownerMutation = useMutation<User, ApiError, void>({
    mutationFn: () => authService.becomeOwner(),
    onSuccess: async () => {
      await reload();
      toast.success('You can now run a business', 'Create it from your dashboard.');
      navigate('/dashboard/businesses/new');
    },
    onError: (err) => toast.error('Could not switch account', toApiError(err).message),
  });

  if (!user) {
    return (
      <PageWrapper>
        <PageSkeleton label="Loading profile" />
      </PageWrapper>
    );
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (fullName.trim().length < 2) {
      setError('Enter your full name');
      return;
    }
    setError(undefined);
    mutation.mutate({ full_name: fullName.trim() });
  };

  const unchanged = fullName.trim() === (user.full_name ?? '');

  return (
    <PageWrapper title="Profile" subtitle="Your personal details and account." backTo={{ to: '/settings', label: 'Settings' }}>
      {user.role === 'customer' && (
        <BecomeOwnerCard onClick={() => ownerMutation.mutate()} isLoading={ownerMutation.isPending} />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Personal info" subtitle="Businesses see this name on your bookings." />
          <form noValidate onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full name"
              autoComplete="name"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setError(undefined);
              }}
              error={error}
            />
            <Input label="Email" value={user.email} disabled hint="Email can't be changed." />
            <div className="flex justify-end">
              <GradientButton type="submit" isLoading={mutation.isPending} disabled={unchanged}>
                Save changes
              </GradientButton>
            </div>
          </form>
        </Card>

        <Card>
          <div className="mb-5 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/20 text-base font-semibold text-brand-200"
            >
              {initialsOf(user.full_name, user.email)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-ink">{user.full_name || 'Your account'}</h2>
              <p className="truncate text-sm text-ink-muted">{user.email}</p>
            </div>
          </div>
          <dl className="space-y-3 border-t border-line pt-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink-muted">Role</dt>
              <dd>
                <Badge tone="brand">{formatStatus(user.role)}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink-muted">Sign-in</dt>
              <dd className="font-medium text-ink">{user.oauth_provider === 'google' ? 'Google' : 'Email & password'}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink-muted">Verified</dt>
              <dd>{user.is_verified ? <Badge tone="green">Yes</Badge> : <Badge tone="yellow">Pending</Badge>}</dd>
            </div>
          </dl>
          {(user.owned_businesses.length > 0 || user.staff_memberships.length > 0) && (
            <div className="mt-6 border-t border-line pt-4">
              <h3 className="text-sm font-semibold text-ink">Businesses</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {user.owned_businesses.map((b) => (
                  <li key={`o-${b.id}`} className="flex items-center justify-between gap-2">
                    <Link to={`/dashboard?b=${b.id}`} className="link truncate">
                      {b.name}
                    </Link>
                    <Badge tone="brand">Owner</Badge>
                  </li>
                ))}
                {user.staff_memberships.map((m) => (
                  <li key={`s-${m.staff_id}`} className="flex items-center justify-between gap-2">
                    <Link to={`/dashboard?b=${m.business_id}`} className="link truncate">
                      {m.business_name}
                    </Link>
                    <Badge tone="blue">Staff</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </PageWrapper>
  );
}
