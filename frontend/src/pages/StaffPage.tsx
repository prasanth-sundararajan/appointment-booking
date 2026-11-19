import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { ServiceChecklist } from '@/components/staff/ServiceChecklist';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Input } from '@/components/ui/Input';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useDashboardBusiness } from '@/hooks/useMyBusinesses';
import { useToast } from '@/hooks/useToast';
import { isEmail } from '@/lib/authValidation';
import { initialsOf } from '@/lib/roles';
import { toApiError } from '@/services/api';
import { catalogKeys, catalogService } from '@/services/catalog';
import { staffKeys, staffService } from '@/services/staff';
import type { ApiError, Service, StaffInvite, StaffMember, StaffUpdate } from '@/types';

function InviteStaffModal({
  isOpen,
  onClose,
  services,
  currency,
  servicesPath,
  onInvite,
  isSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  services: Service[];
  currency: string;
  servicesPath: string;
  onInvite: (payload: StaffInvite) => void;
  isSaving: boolean;
}) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [errors, setErrors] = useState<{ display_name?: string; email?: string }>({});

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!displayName.trim()) next.display_name = 'Name is required';
    if (!email.trim()) next.email = 'Email is required';
    else if (!isEmail(email)) next.email = 'Enter a valid email';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onInvite({ display_name: displayName.trim(), email: email.trim().toLowerCase(), service_ids: serviceIds });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite staff"
      description="We'll email them a link to join. They sign in with this email to accept. You can invite yourself too."
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Display name"
            placeholder="e.g. Sam"
            hint="Shown to customers when they book."
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setErrors((err) => ({ ...err, display_name: undefined }));
            }}
            error={errors.display_name}
          />
          <Input
            label="Email"
            type="email"
            autoComplete="off"
            placeholder="sam@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors((err) => ({ ...err, email: undefined }));
            }}
            error={errors.email}
          />
        </div>
        <ServiceChecklist
          services={services}
          selected={serviceIds}
          onChange={setServiceIds}
          currency={currency}
          emptyAction={
            <ButtonLink to={servicesPath} variant="outline" size="sm">
              Add services
            </ButtonLink>
          }
        />
        <ModalActions>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <GradientButton type="submit" isLoading={isSaving} loadingText="Sending invite">
            Send invite
          </GradientButton>
        </ModalActions>
      </form>
    </Modal>
  );
}

function AssignServicesModal({
  member,
  services,
  currency,
  servicesPath,
  onClose,
  onSave,
  isSaving,
}: {
  member: StaffMember;
  services: Service[];
  currency: string;
  servicesPath: string;
  onClose: () => void;
  onSave: (ids: number[]) => void;
  isSaving: boolean;
}) {
  const [selected, setSelected] = useState<number[]>(member.service_ids);
  const unchanged =
    selected.length === member.service_ids.length && selected.every((id) => member.service_ids.includes(id));
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Assign services to ${member.display_name}`}
      description="Tick every service this person performs. Customers can only book them for the services checked here."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <GradientButton isLoading={isSaving} disabled={unchanged} onClick={() => onSave(selected)}>
            Save services
          </GradientButton>
        </>
      }
    >
      <ServiceChecklist
        services={services}
        selected={selected}
        onChange={setSelected}
        currency={currency}
        emptyAction={
          <ButtonLink to={servicesPath} variant="outline" size="sm">
            Add services
          </ButtonLink>
        }
      />
    </Modal>
  );
}

export default function StaffPage() {
  const { id } = useParams<{ id: string }>();
  const businessId = Number(id);
  const toast = useToast();
  const queryClient = useQueryClient();
  const { business } = useDashboardBusiness(businessId);
  const currency = business?.currency ?? 'USD';
  const servicesPath = `/dashboard/b/${businessId}/services`;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [assigning, setAssigning] = useState<StaffMember | null>(null);
  const [toRemove, setToRemove] = useState<StaffMember | null>(null);

  const staffQuery = useQuery<StaffMember[], ApiError>({
    queryKey: staffKeys.allByBusiness(businessId),
    queryFn: () => staffService.listAll(businessId),
  });
  const servicesQuery = useQuery<Service[], ApiError>({
    queryKey: catalogKeys.allByBusiness(businessId),
    queryFn: () => catalogService.listAll(businessId),
  });
  const services = servicesQuery.data ?? [];
  const serviceName = (sid: number) => services.find((s) => s.id === sid)?.name ?? `#${sid}`;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: staffKeys.all });

  const invite = useMutation<StaffMember, ApiError, StaffInvite>({
    mutationFn: (payload) => staffService.invite(businessId, payload),
    onSuccess: (member) => {
      toast.success('Invite sent', `${member.display_name} will get an email at ${member.email}.`);
      setInviteOpen(false);
      void invalidate();
    },
    onError: (err) =>
      toast.error('Could not send invite', err.status === 409 ? 'This email is already on your team.' : toApiError(err).message),
  });

  const update = useMutation<StaffMember, ApiError, { staffId: number; payload: StaffUpdate }>({
    mutationFn: ({ staffId, payload }) => staffService.update(staffId, payload),
    onSuccess: () => {
      toast.success('Staff updated');
      setAssigning(null);
      void invalidate();
    },
    onError: (err) => toast.error('Could not update staff', toApiError(err).message),
  });

  const remove = useMutation<void, ApiError, StaffMember>({
    mutationFn: (member) => staffService.remove(member.id),
    onSuccess: () => {
      toast.success('Staff removed');
      setToRemove(null);
      void invalidate();
    },
    onError: (err) =>
      toast.error(
        'Could not remove staff',
        err.status === 409 ? 'They have upcoming confirmed bookings. Cancel or move those first, or deactivate instead.' : toApiError(err).message,
      ),
  });

  const staff = staffQuery.data ?? [];
  const unassignedCount = staff.filter((m) => m.is_active && m.service_ids.length === 0).length;

  return (
    <PageWrapper
      title="Staff"
      subtitle="Invite your team and choose which services each person offers."
      contained={false}
      actions={staff.length > 0 && <GradientButton onClick={() => setInviteOpen(true)}>Invite staff</GradientButton>}
    >
      {staffQuery.isLoading ? (
        <ListSkeleton rows={3} label="Loading staff" />
      ) : staffQuery.isError ? (
        <ErrorState message={staffQuery.error.message} onRetry={() => void staffQuery.refetch()} />
      ) : staff.length === 0 ? (
        <EmptyState
          icon="users"
          title="No staff yet"
          description="Invite yourself or your team. Each person gets their own services, hours and calendar, and customers can only book people who have services assigned."
          action={<GradientButton onClick={() => setInviteOpen(true)}>Invite staff</GradientButton>}
        />
      ) : (
        <>
          {unassignedCount > 0 && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100" role="status">
              <strong className="font-semibold">
                {unassignedCount === 1 ? '1 team member has' : `${unassignedCount} team members have`} no services.
              </strong>{' '}
              Customers can&apos;t book them until you use <span className="font-semibold">Assign services</span>.
            </div>
          )}
          <AnimatedList as="ul" className="space-y-3">
            {staff.map((member) => (
              <Card key={member.id} className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/20 font-semibold text-brand-200"
                  >
                    {initialsOf(member.display_name)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-ink">{member.display_name}</h2>
                      {member.user_id === null && <Badge tone="yellow">Invite pending</Badge>}
                      {!member.is_active && <Badge tone="gray">Inactive</Badge>}
                    </div>
                    <p className="truncate text-sm text-ink-muted">{member.email}</p>
                    {member.service_ids.length === 0 ? (
                      <p className="mt-2 text-sm font-medium text-amber-200">No services assigned</p>
                    ) : (
                      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Services for ${member.display_name}`}>
                        {member.service_ids.map((sid) => (
                          <li key={sid}>
                            <Badge tone="gray">{serviceName(sid)}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-line pt-3 md:border-0 md:pt-0">
                  <Button
                    variant={member.service_ids.length === 0 ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setAssigning(member)}
                    aria-label={`Assign services to ${member.display_name}`}
                  >
                    Assign services
                  </Button>
                  <ButtonLink
                    to={`/dashboard/b/${businessId}/availability?staff=${member.id}`}
                    variant="outline"
                    size="sm"
                    aria-label={`Working hours for ${member.display_name}`}
                  >
                    Hours
                  </ButtonLink>
                  <Button
                    variant="ghost"
                    size="sm"
                    isLoading={update.isPending && update.variables?.staffId === member.id && update.variables.payload.is_active !== undefined}
                    onClick={() => update.mutate({ staffId: member.id, payload: { is_active: !member.is_active } })}
                  >
                    {member.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="danger-ghost" size="sm" onClick={() => setToRemove(member)}>
                    Remove
                  </Button>
                </div>
              </Card>
            ))}
          </AnimatedList>
        </>
      )}

      {inviteOpen && (
        <InviteStaffModal
          isOpen={inviteOpen}
          onClose={() => setInviteOpen(false)}
          services={services}
          currency={currency}
          servicesPath={servicesPath}
          onInvite={(payload) => invite.mutate(payload)}
          isSaving={invite.isPending}
        />
      )}

      {assigning && (
        <AssignServicesModal
          member={assigning}
          services={services}
          currency={currency}
          servicesPath={servicesPath}
          onClose={() => setAssigning(null)}
          onSave={(ids) => update.mutate({ staffId: assigning.id, payload: { service_ids: ids } })}
          isSaving={update.isPending}
        />
      )}

      <Modal
        isOpen={toRemove !== null}
        onClose={() => setToRemove(null)}
        size="sm"
        title={`Remove ${toRemove?.display_name ?? 'staff member'}?`}
        description="This can't be undone. Staff with upcoming confirmed bookings can't be removed; deactivate them instead."
        footer={
          <>
            <Button variant="outline" onClick={() => setToRemove(null)}>
              Keep
            </Button>
            <Button variant="danger" isLoading={remove.isPending} onClick={() => toRemove && remove.mutate(toRemove)}>
              Remove
            </Button>
          </>
        }
      />
    </PageWrapper>
  );
}
