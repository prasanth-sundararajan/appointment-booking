import { Link, useNavigate } from 'react-router-dom';
import { Badge, formatStatus } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { canOwnBusiness, isBusinessUser } from '@/lib/roles';

interface SettingsLink {
  to: string;
  title: string;
  body: string;
}

function LinkCard({ item }: { item: SettingsLink }) {
  return (
    <Link
      to={item.to}
      className="group flex h-full items-center justify-between gap-4 rounded-card border border-line bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-400/40 hover:shadow-card-hover"
    >
      <span className="min-w-0">
        <span className="block font-semibold text-ink group-hover:text-brand-200">{item.title}</span>
        <span className="mt-0.5 block text-sm text-ink-muted">{item.body}</span>
      </span>
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0 text-slate-500 group-hover:text-brand-200" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M7.2 4.2a.75.75 0 011.06 0l5.27 5.27a.75.75 0 010 1.06L8.26 15.8a.75.75 0 11-1.06-1.06L11.94 10 7.2 5.26a.75.75 0 010-1.06z"
        />
      </svg>
    </Link>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  if (!user) {
    return (
      <PageWrapper>
        <PageSkeleton label="Loading settings" />
      </PageWrapper>
    );
  }

  const links: SettingsLink[] = [
    { to: '/profile', title: 'Profile', body: 'Your name and account details.' },
    { to: '/bookings', title: 'My bookings', body: 'Upcoming and past appointments.' },
  ];
  if (isBusinessUser(user)) {
    links.push({
      to: '/settings/calendar',
      title: 'Google Calendar',
      body: 'Two-way sync: bookings appear in Google, your busy times block slots.',
    });
  }
  user.owned_businesses.forEach((b) =>
    links.push({ to: `/dashboard/b/${b.id}/settings`, title: `${b.name} settings`, body: 'Deposit, cancellation cutoff, booking window.' }),
  );
  if (canOwnBusiness(user)) {
    links.push({ to: '/dashboard/businesses/new', title: 'Create a business', body: 'Add another booking page.' });
  } else {
    links.push({ to: '/profile', title: 'Run a business?', body: 'Switch on business tools from your profile.' });
  }

  const handleLogout = async () => {
    await logout();
    toast.info('Logged out');
    navigate('/');
  };

  return (
    <PageWrapper title="Settings" subtitle="Manage your account and integrations.">
      <Card>
        <CardHeader
          title="Account"
          action={
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Log out
            </Button>
          }
        />
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ink-muted">Name</dt>
            <dd className="mt-0.5 font-medium text-ink">{user.full_name || 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Email</dt>
            <dd className="mt-0.5 break-all font-medium text-ink">{user.email}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Role</dt>
            <dd className="mt-0.5">
              <Badge tone="brand">{formatStatus(user.role)}</Badge>
            </dd>
          </div>
        </dl>
      </Card>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-ink-muted">Manage</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {links.map((item) => (
          <LinkCard key={`${item.to}-${item.title}`} item={item} />
        ))}
      </div>
    </PageWrapper>
  );
}
