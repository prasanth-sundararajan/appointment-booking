import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/EmptyState';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { useDashboardBusiness } from '@/hooks/useMyBusinesses';
import { useToast } from '@/hooks/useToast';
import { toMajorString, toMinor } from '@/lib/businessRules';
import { computeDeposit } from '@/lib/deposit';
import { formatMoney, minorUnitDigits } from '@/lib/money';
import { toApiError } from '@/services/api';
import { catalogKeys, catalogService } from '@/services/catalog';
import type { ApiError, Service, ServiceCreate } from '@/types';

interface ServiceFormState {
  name: string;
  description: string;
  duration_minutes: string;
  price: string;
  is_active: boolean;
}

type ServiceFormErrors = Partial<Record<keyof ServiceFormState, string>>;

function toFormState(service: Service | null, currency: string): ServiceFormState {
  return {
    name: service?.name ?? '',
    description: service?.description ?? '',
    duration_minutes: String(service?.duration_minutes ?? 30),
    price: service ? toMajorString(service.price_minor, currency) : '',
    is_active: service?.is_active ?? true,
  };
}

function validate(state: ServiceFormState, currency: string): ServiceFormErrors {
  const errors: ServiceFormErrors = {};
  if (!state.name.trim()) errors.name = 'Name is required';
  const duration = Number(state.duration_minutes);
  if (!Number.isInteger(duration) || duration <= 0) errors.duration_minutes = 'Duration must be a whole number above 0';
  else if (duration > 24 * 60) errors.duration_minutes = 'Duration must be under 24 hours';
  const digits = minorUnitDigits(currency);
  const priceRe = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
  if (!priceRe.test(state.price.trim())) errors.price = 'Enter a valid price';
  return errors;
}

function ServiceFormModal({
  isOpen,
  onClose,
  service,
  currency,
  depositPercent,
  onSave,
  isSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  service: Service | null;
  currency: string;
  depositPercent: number;
  onSave: (payload: ServiceCreate) => void;
  isSaving: boolean;
}) {
  const [state, setState] = useState<ServiceFormState>(() => toFormState(service, currency));
  const [errors, setErrors] = useState<ServiceFormErrors>({});
  const set = <K extends keyof ServiceFormState>(field: K, value: ServiceFormState[K]) =>
    setState((s) => ({ ...s, [field]: value }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = validate(state, currency);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSave({
      name: state.name.trim(),
      description: state.description.trim() || null,
      duration_minutes: Number(state.duration_minutes),
      price_minor: toMinor(state.price, currency),
      is_active: state.is_active,
    });
  };

  const priceValid = !validate(state, currency).price;
  const deposit = priceValid ? computeDeposit(toMinor(state.price, currency), depositPercent) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={service ? 'Edit service' : 'New service'}>
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <Input label="Name" value={state.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
        <Input
          label="Description"
          value={state.description}
          onChange={(e) => set('description', e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Duration (minutes)"
            type="number"
            min={5}
            step={5}
            value={state.duration_minutes}
            onChange={(e) => set('duration_minutes', e.target.value)}
            error={errors.duration_minutes}
          />
          <Input
            label={`Price (${currency})`}
            inputMode="decimal"
            value={state.price}
            onChange={(e) => set('price', e.target.value)}
            error={errors.price}
            hint={deposit !== null ? `Deposit at ${depositPercent}%: ${formatMoney(deposit, currency)}` : undefined}
          />
        </div>
        {service && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={state.is_active}
              onChange={(e) => set('is_active', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Active (bookable)
          </label>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <GradientButton type="submit" isLoading={isSaving}>
            {service ? 'Save' : 'Add service'}
          </GradientButton>
        </div>
      </form>
    </Modal>
  );
}

export default function ServicesPage() {
  const { id } = useParams<{ id: string }>();
  const businessId = Number(id);
  const toast = useToast();
  const queryClient = useQueryClient();
  const { business } = useDashboardBusiness(businessId);
  const currency = business?.currency ?? 'USD';
  const depositPercent = business?.deposit_percent ?? 20;

  const [editing, setEditing] = useState<Service | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Service | null>(null);

  const query = useQuery<Service[], ApiError>({
    queryKey: catalogKeys.allByBusiness(businessId),
    queryFn: () => catalogService.listAll(businessId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: catalogKeys.all });

  const save = useMutation<Service, ApiError, ServiceCreate>({
    mutationFn: (payload) =>
      editing ? catalogService.update(editing.id, payload) : catalogService.create(businessId, payload),
    onSuccess: (service) => {
      toast.success(editing ? 'Service updated' : 'Service added', service.name);
      setFormOpen(false);
      void invalidate();
    },
    onError: (err) => toast.error('Could not save service', toApiError(err).message),
  });

  const remove = useMutation<void, ApiError, Service>({
    mutationFn: (service) => catalogService.remove(service.id),
    onSuccess: () => {
      toast.success('Service removed');
      setToDelete(null);
      void invalidate();
    },
    onError: (err) => toast.error('Could not remove service', toApiError(err).message),
  });

  const openForm = (service: Service | null) => {
    setEditing(service);
    setFormOpen(true);
  };

  const services = query.data ?? [];

  return (
    <PageWrapper
      title="Services"
      subtitle="What customers can book, how long it takes, and what it costs."
      contained={false}
      actions={<GradientButton onClick={() => openForm(null)}>Add service</GradientButton>}
    >
      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : services.length === 0 ? (
        <EmptyState
          title="No services yet"
          description="Add your first service so customers can start booking."
          action={<GradientButton onClick={() => openForm(null)}>Add service</GradientButton>}
        />
      ) : (
        <AnimatedList className="space-y-3">
          {services.map((service) => (
            <Card key={service.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{service.name}</h3>
                  {!service.is_active && <Badge tone="gray">Inactive</Badge>}
                </div>
                <p className="text-sm text-gray-500">
                  {service.duration_minutes} min &middot; {formatMoney(service.price_minor, currency)} &middot; deposit{' '}
                  {formatMoney(computeDeposit(service.price_minor, depositPercent), currency)}
                </p>
                {service.description && <p className="mt-1 text-sm text-gray-600">{service.description}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openForm(service)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => setToDelete(service)}>
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </AnimatedList>
      )}

      {formOpen && (
        <ServiceFormModal
          key={editing?.id ?? 'new'}
          isOpen={formOpen}
          onClose={() => setFormOpen(false)}
          service={editing}
          currency={currency}
          depositPercent={depositPercent}
          onSave={(payload) => save.mutate(payload)}
          isSaving={save.isPending}
        />
      )}

      <Modal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={`Remove ${toDelete?.name ?? 'service'}?`}
        description="It will no longer be bookable. Existing bookings are kept."
        footer={
          <>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              Keep
            </Button>
            <Button variant="danger" isLoading={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete)}>
              Remove
            </Button>
          </>
        }
      />
    </PageWrapper>
  );
}
