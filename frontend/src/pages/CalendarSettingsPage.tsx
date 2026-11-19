import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/hooks/useToast';
import { toApiError } from '@/services/api';
import { calendarKeys, disconnectGoogleCalendar, getCalendarStatus, getGoogleConnectUrl } from '@/services/calendar';
import type { CalendarStatus } from '@/types';

function formatWhen(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '-';
}

function SyncStatus({ status }: { status: CalendarStatus }) {
  return (
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-gray-500">Calendar</dt>
        <dd className="font-medium text-gray-900">{status.google_calendar_id ?? status.email ?? 'Primary'}</dd>
      </div>
      <div>
        <dt className="text-gray-500">Last synced</dt>
        <dd className="font-medium text-gray-900">{formatWhen(status.last_synced_at)}</dd>
      </div>
      <div>
        <dt className="text-gray-500">Live updates until</dt>
        <dd className="font-medium text-gray-900">{formatWhen(status.watch_expires_at)}</dd>
      </div>
    </dl>
  );
}

export default function CalendarSettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const status = useQuery({ queryKey: calendarKeys.status, queryFn: getCalendarStatus });

  // The OAuth callback redirects back here with ?connected=1 or ?error=...
  useEffect(() => {
    const connected = params.get('connected') ?? params.get('status');
    const error = params.get('error');
    if (!connected && !error) return;
    if (error) toast.error('Google Calendar was not connected', error);
    else if (connected === '1' || connected === 'true' || connected === 'connected' || connected === 'success') {
      toast.success('Google Calendar connected', 'Bookings will now sync both ways.');
    }
    void queryClient.invalidateQueries({ queryKey: calendarKeys.status });
    setParams({}, { replace: true });
  }, [params, setParams, toast, queryClient]);

  const connect = useMutation({
    mutationFn: getGoogleConnectUrl,
    onSuccess: (url) => window.location.assign(url),
    onError: (error) => toast.error('Could not start Google sign-in', toApiError(error).message),
  });

  const disconnect = useMutation({
    mutationFn: disconnectGoogleCalendar,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: calendarKeys.status });
      toast.success('Google Calendar disconnected');
    },
    onError: (error) => toast.error('Could not disconnect', toApiError(error).message),
  });

  const connected = status.data?.connected ?? false;

  return (
    <PageWrapper title="Calendar sync" subtitle="Keep SlotEase and Google Calendar in sync, both ways.">
      <Card hoverable={false} className="max-w-2xl">
        <CardHeader
          title="Google Calendar"
          subtitle="Confirmed bookings are added to your calendar, and busy times in Google block your slots."
          action={
            status.data && <Badge tone={connected ? 'green' : 'gray'}>{connected ? 'Connected' : 'Not connected'}</Badge>
          }
        />

        {status.isLoading && <Spinner label="Loading calendar status" />}
        {status.isError && <p className="text-sm text-red-600">{toApiError(status.error).message}</p>}

        {status.data && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {connected && <SyncStatus status={status.data} />}
            <div className="mt-6 flex flex-wrap gap-3">
              {connected ? (
                <>
                  <Button variant="outline" onClick={() => connect.mutate()} isLoading={connect.isPending}>
                    Reconnect
                  </Button>
                  <Button variant="danger" onClick={() => disconnect.mutate()} isLoading={disconnect.isPending}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button onClick={() => connect.mutate()} isLoading={connect.isPending}>
                  Connect Google Calendar
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </Card>
      <Link to="/settings" className="mt-6 inline-block text-sm text-brand-700 hover:underline">
        Back to settings
      </Link>
    </PageWrapper>
  );
}
