import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState } from '@/components/common/EmptyState';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { GradientButton } from '@/components/ui/GradientButton';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { useDashboardBusiness } from '@/hooks/useMyBusinesses';
import { useToast } from '@/hooks/useToast';
import { toMajorString, toMinor } from '@/lib/businessRules';
import { computeDeposit } from '@/lib/deposit';
import { formatDuration } from '@/lib/format';
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
  else if (state.name.trim().length > 120) errors.name = 'Keep the name under 120 characters';
  const duration = Number(state.duration_minutes);
  if (!Number.isInteger(duration) || duration <= 0) errors.duration_minutes = 'Duration must be a whole number above 0';
  else if (duration > 24 * 60) errors.duration_minutes = 'Duration must be under 24 hours';
  const digits = minorUnitDigits(currency);
  const priceRe = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
  if (!state.price.trim()) errors.price = 'Price is required';
  else if (!priceRe.test(state.price.trim())) errors.price = digits === 0 ? 'Enter a whole amount, e.g. 2500' : 'Enter a price like 25 or 25.50';
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={service ? 'Edit service' : 'New service'}
      description="Customers see the name, duration and price when they book."
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          placeholder="e.g. Haircut & style"
          value={state.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
        />
        <Textarea
          label="Description (optional)"
          rows={2}
          placeholder="What's included?"
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
            hint={
              deposit !== null
                ? `Customers pay ${formatMoney(deposit, currency)} deposit (${depositPercent}%) to book.`
                : `Deposit is ${depositPercent}% of the price.`
            }
          />
        </div>
        {service && (
          <Checkbox
            card
            checked={state.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
            label="Active (bookable)"
            description="Untick to hide this service from customers without deleting it."
          />
        )}
        <ModalActions>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <GradientButton type="submit" isLoading={isSaving}>
            {service ? 'Save changes' : 'Add service'}
          </GradientButton>
        </ModalActions>
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
      actions={services.length > 0 && <GradientButton onClick={() => openForm(null)}>Add service</GradientButton>}
    >
      {query.isLoading ? (
        <ListSkeleton rows={3} label="Loading services" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : services.length === 0 ? (
        <EmptyState
          icon="list"
          title="No services yet"
          description="Add your first service with a duration and price. Then assign it to staff so customers can book it."
          action={<GradientButton onClick={() => openForm(null)}>Add service</GradientButton>}
        />
      ) : (
        <AnimatedList as="ul" className="space-y-3">
          {services.map((service) => (
            <Card key={service.id} className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-ink">{service.name}</h2>
                  {!service.is_active && <Badge tone="gray">Inactive</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-ink-muted">{formatDuration(service.duration_minutes)}</p>
                {service.description && <p className="mt-1 text-sm text-slate-200">{service.description}</p>}
              </div>
              <div className="flex items-center justify-between gap-6 border-t border-line pt-3 sm:border-0 sm:pt-0">
                <div className="sm:text-right">
                  <p className="font-semibold tabular-nums text-ink">{formatMoney(service.price_minor, currency)}</p>
                  <p className="text-xs text-ink-muted">
                    {formatMoney(computeDeposit(service.price_minor, depositPercent), currency)} deposit
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openForm(service)} aria-label={`Edit ${service.name}`}>
                    Edit
                  </Button>
                  <Button variant="danger-ghost" size="sm" onClick={() => setToDelete(service)} aria-label={`Remove ${service.name}`}>
                    Remove
                  </Button>
                </div>
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
        size="sm"
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
