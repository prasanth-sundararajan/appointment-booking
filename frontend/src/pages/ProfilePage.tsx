import { useNavigate } from 'react-router-dom';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Badge, formatStatus } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Input } from '@/components/ui/Input';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { toApiError } from '@/services/api';
import { authService } from '@/services/auth';
import type { ApiError, ProfileUpdate, User } from '@/types';

export default function ProfilePage() {
  const { user, reload } = useAuth();
  const toast = useToast();
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setFullName(user?.full_name ?? '');
  }, [user?.full_name]);

  const navigate = useNavigate();

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

  if (!user) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (fullName.trim().length < 2) {
      setError('Enter your full name');
      return;
    }
    setError(undefined);
    mutation.mutate({ full_name: fullName.trim() });
  };

  return (
    <PageWrapper title="Profile" subtitle="Your personal details.">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card hoverable={false} className="lg:col-span-2">
          <CardHeader title="Personal info" />
          <form noValidate onSubmit={handleSubmit} className="space-y-4">
            <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={error} />
            <Input label="Email" value={user.email} disabled hint="Email can't be changed." />
            <div className="flex justify-end">
              <GradientButton type="submit" isLoading={mutation.isPending}>
                Save changes
              </GradientButton>
            </div>
          </form>
        </Card>

        <Card hoverable={false}>
          <CardHeader title="Account" />
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Role</dt>
              <dd>
                <Badge tone="brand">{formatStatus(user.role)}</Badge>
              </dd>
            </div>
            {user.role === 'customer' && (
              <GradientButton
                type="button"
                className="w-full"
                isLoading={ownerMutation.isPending}
                onClick={() => ownerMutation.mutate()}
              >
                I run a business
              </GradientButton>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Sign-in</dt>
              <dd className="text-gray-900">{user.oauth_provider === 'google' ? 'Google' : 'Email & password'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Verified</dt>
              <dd>{user.is_verified ? <Badge tone="green">Yes</Badge> : <Badge tone="yellow">Pending</Badge>}</dd>
            </div>
          </dl>
          {(user.owned_businesses.length > 0 || user.staff_memberships.length > 0) && (
            <div className="mt-6">
              <p className="text-sm font-medium text-gray-700">Businesses</p>
              <ul className="mt-2 space-y-2 text-sm">
                {user.owned_businesses.map((b) => (
                  <li key={`o-${b.id}`} className="flex items-center justify-between gap-2">
                    <Link to={`/dashboard?b=${b.id}`} className="truncate text-brand-600 hover:underline">
                      {b.name}
                    </Link>
                    <Badge tone="brand">Owner</Badge>
                  </li>
                ))}
                {user.staff_memberships.map((m) => (
                  <li key={`s-${m.staff_id}`} className="flex items-center justify-between gap-2">
                    <Link to={`/dashboard?b=${m.business_id}`} className="truncate text-brand-600 hover:underline">
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
