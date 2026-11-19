import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BusinessForm } from '@/components/business/BusinessForm';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardBusiness } from '@/hooks/useMyBusinesses';
import { useToast } from '@/hooks/useToast';
import { businessToFormValues } from '@/lib/businessRules';
import { toApiError } from '@/services/api';
import { businessKeys, businessesService } from '@/services/businesses';
import type { ApiError, BusinessCreate } from '@/types';

export default function BusinessSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const businessId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { reload } = useAuth();
  const { business, isOwner, isLoading, error, refetch } = useDashboardBusiness(businessId);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deactivate = useMutation<void, ApiError>({
    mutationFn: () => businessesService.deactivate(businessId),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: businessKeys.all }), reload()]);
      toast.success('Business deactivated', 'It no longer appears in the directory.');
      navigate('/dashboard');
    },
    onError: (err) => toast.error('Could not deactivate', toApiError(err).message),
  });

  if (isLoading) return <LoadingBlock />;
  if (!isOwner) return <EmptyState title="Owners only" description="Only the business owner can change settings." />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!business) return null;

  const handleSubmit = async (payload: BusinessCreate) => {
    setServerErrors({});
    try {
      const updated = await businessesService.update(businessId, payload);
      queryClient.setQueryData(businessKeys.mineById(businessId), updated);
      await Promise.all([queryClient.invalidateQueries({ queryKey: businessKeys.all }), reload()]);
      toast.success('Settings saved');
    } catch (err) {
      const apiError = toApiError(err);
      setServerErrors(apiError.fieldErrors);
      toast.error('Could not save settings', apiError.message);
    }
  };

  return (
    <PageWrapper title="Business settings" subtitle={`Public page: /b/${business.slug}`} contained={false}>
      <BusinessForm
        key={business.updated_at}
        initialValues={businessToFormValues(business)}
        onSubmit={handleSubmit}
        submitLabel="Save settings"
        serverErrors={serverErrors}
      />

      {business.is_active && (
        <Card hoverable={false} className="mt-6 border-red-100">
          <CardHeader
            title="Deactivate business"
            subtitle="Hides your booking page and removes it from the directory. Existing bookings are kept."
            action={
              <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
                Deactivate
              </Button>
            }
          />
        </Card>
      )}

      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Deactivate ${business.name}?`}
        description="Customers will no longer be able to find or book this business."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep active
            </Button>
            <Button variant="danger" isLoading={deactivate.isPending} onClick={() => deactivate.mutate()}>
              Deactivate
            </Button>
          </>
        }
      />
    </PageWrapper>
  );
}
