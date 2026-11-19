import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Badge, formatStatus } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';

interface SettingsLink {
  to: string;
  title: string;
  body: string;
}

function LinkCard({ item }: { item: SettingsLink }) {
  return (
    <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
      <Link
        to={item.to}
        className="flex h-full items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md"
      >
        <span>
          <span className="block font-semibold text-gray-900">{item.title}</span>
          <span className="mt-0.5 block text-sm text-gray-500">{item.body}</span>
        </span>
        <span className="text-brand-500" aria-hidden="true">
          &rarr;
        </span>
      </Link>
    </motion.div>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  if (!user) return null;

  const isBusinessUser = user.role !== 'customer' || user.owned_businesses.length > 0 || user.staff_memberships.length > 0;

  const links: SettingsLink[] = [
    { to: '/profile', title: 'Profile', body: 'Your name and account details.' },
    { to: '/bookings', title: 'My bookings', body: 'Upcoming and past appointments.' },
  ];
  if (isBusinessUser) {
    links.push({
      to: '/settings/calendar',
      title: 'Google Calendar',
      body: 'Two-way sync: bookings appear in Google, your busy times block slots.',
    });
  }
  user.owned_businesses.forEach((b) =>
    links.push({ to: `/dashboard/b/${b.id}/settings`, title: `${b.name} settings`, body: 'Deposit, cancellation cutoff, hours rules.' }),
  );
  if (user.role === 'owner' || user.owned_businesses.length > 0) {
    links.push({ to: '/dashboard/businesses/new', title: 'Create a business', body: 'Add another booking page.' });
  } else {
    links.push({ to: '/dashboard/businesses/new', title: 'Run a business?', body: 'Create a booking page for your business.' });
  }

  const handleLogout = async () => {
    await logout();
    toast.info('Logged out');
    navigate('/');
  };

  return (
    <PageWrapper title="Settings" subtitle="Manage your account and integrations.">
      <Card hoverable={false}>
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
            <dt className="text-gray-500">Name</dt>
            <dd className="mt-0.5 font-medium text-gray-900">{user.full_name || 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Email</dt>
            <dd className="mt-0.5 break-all font-medium text-gray-900">{user.email}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Role</dt>
            <dd className="mt-0.5">
              <Badge tone="brand">{formatStatus(user.role)}</Badge>
            </dd>
          </div>
        </dl>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {links.map((item) => (
          <LinkCard key={item.to} item={item} />
        ))}
      </div>
    </PageWrapper>
  );
}
