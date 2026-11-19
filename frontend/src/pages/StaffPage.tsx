import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/EmptyState';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { useToast } from '@/hooks/useToast';
import { isEmail } from '@/lib/authValidation';
import { toApiError } from '@/services/api';
import { catalogKeys, catalogService } from '@/services/catalog';
import { staffKeys, staffService } from '@/services/staff';
import type { ApiError, Service, StaffInvite, StaffMember, StaffUpdate } from '@/types';

function ServiceChecklist({
  services,
  selected,
  onChange,
}: {
  services: Service[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  if (services.length === 0) {
    return <p className="text-sm text-gray-500">Add services first, then assign them here.</p>;
  }
  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Services">
      {services.map((service) => {
        const active = selected.includes(service.id);
        return (
          <motion.button
            key={service.id}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(service.id)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-brand-50',
              !service.is_active && 'opacity-60',
            )}
          >
            {service.name}
          </motion.button>
        );
      })}
    </div>
  );
}

function InviteStaffModal({
  isOpen,
  onClose,
  services,
  onInvite,
  isSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  services: Service[];
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
    if (!isEmail(email)) next.email = 'Enter a valid email';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onInvite({ display_name: displayName.trim(), email: email.trim().toLowerCase(), service_ids: serviceIds });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite staff"
      description="We'll email them a link to join. They need to sign in with this email to accept."
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} error={errors.display_name} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Services they offer</p>
          <ServiceChecklist services={services} selected={serviceIds} onChange={setServiceIds} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <GradientButton type="submit" isLoading={isSaving}>
            Send invite
          </GradientButton>
        </div>
      </form>
    </Modal>
  );
}

function AssignServicesModal({
  member,
  services,
  onClose,
  onSave,
  isSaving,
}: {
  member: StaffMember;
  services: Service[];
  onClose: () => void;
  onSave: (ids: number[]) => void;
  isSaving: boolean;
}) {
  const [selected, setSelected] = useState<number[]>(member.service_ids);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Services for ${member.display_name}`}
      description="Customers can only book this person for the services selected here."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <GradientButton isLoading={isSaving} onClick={() => onSave(selected)}>
            Save
          </GradientButton>
        </>
      }
    >
      <ServiceChecklist services={services} selected={selected} onChange={setSelected} />
    </Modal>
  );
}

export default function StaffPage() {
  const { id } = useParams<{ id: string }>();
  const businessId = Number(id);
  const toast = useToast();
  const queryClient = useQueryClient();
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

  return (
    <PageWrapper
      title="Staff"
      subtitle="Invite your team and choose which services each person offers."
      contained={false}
      actions={<GradientButton onClick={() => setInviteOpen(true)}>Invite staff</GradientButton>}
    >
      {staffQuery.isLoading ? (
        <LoadingBlock />
      ) : staffQuery.isError ? (
        <ErrorState message={staffQuery.error.message} onRetry={() => void staffQuery.refetch()} />
      ) : staff.length === 0 ? (
        <EmptyState
          title="No staff yet"
          description="Invite yourself or your team. Each staff member gets their own hours and calendar."
          action={<GradientButton onClick={() => setInviteOpen(true)}>Invite staff</GradientButton>}
        />
      ) : (
        <AnimatedList className="space-y-3">
          {staff.map((member) => (
            <Card key={member.id} className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">
                  {member.display_name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{member.display_name}</h3>
                    {member.user_id === null && <Badge tone="yellow">Invite pending</Badge>}
                    {!member.is_active && <Badge tone="gray">Inactive</Badge>}
                  </div>
                  <p className="truncate text-sm text-gray-500">{member.email}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {member.service_ids.length === 0
                      ? 'No services assigned'
                      : member.service_ids.map(serviceName).join(', ')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setAssigning(member)}>
                  Services
                </Button>
                <Link
                  to={`/dashboard/b/${businessId}/availability?staff=${member.id}`}
                  className="inline-flex h-8 items-center rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  Hours
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => update.mutate({ staffId: member.id, payload: { is_active: !member.is_active } })}
                >
                  {member.is_active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => setToRemove(member)}>
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </AnimatedList>
      )}

      {inviteOpen && (
        <InviteStaffModal
          isOpen={inviteOpen}
          onClose={() => setInviteOpen(false)}
          services={services}
          onInvite={(payload) => invite.mutate(payload)}
          isSaving={invite.isPending}
        />
      )}

      {assigning && (
        <AssignServicesModal
          member={assigning}
          services={services}
          onClose={() => setAssigning(null)}
          onSave={(ids) => update.mutate({ staffId: assigning.id, payload: { service_ids: ids } })}
          isSaving={update.isPending}
        />
      )}

      <Modal
        isOpen={toRemove !== null}
        onClose={() => setToRemove(null)}
        title={`Remove ${toRemove?.display_name ?? 'staff member'}?`}
        description="This can't be undone. Staff with upcoming confirmed bookings can't be removed."
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
