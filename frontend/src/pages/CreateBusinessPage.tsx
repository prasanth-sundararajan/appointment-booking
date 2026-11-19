import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BusinessForm } from '@/components/business/BusinessForm';
import { PageWrapper } from '@/components/ui/PageWrapper';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { defaultBusinessFormValues } from '@/lib/businessRules';
import { toApiError } from '@/services/api';
import { businessKeys, businessesService } from '@/services/businesses';
import type { BusinessCreate } from '@/types';

export default function CreateBusinessPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { reload } = useAuth();
  const [initialValues] = useState(defaultBusinessFormValues);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (payload: BusinessCreate) => {
    setServerErrors({});
    try {
      const business = await businessesService.create(payload);
      await Promise.all([queryClient.invalidateQueries({ queryKey: businessKeys.all }), reload()]);
      toast.success('Business created', 'Next, add the services you offer.');
      navigate(`/dashboard/b/${business.id}/services`);
    } catch (error) {
      const apiError = toApiError(error);
      setServerErrors(apiError.fieldErrors);
      toast.error('Could not create business', apiError.message);
    }
  };

  return (
    <PageWrapper
      title="Create your business"
      subtitle="Set up your public booking page. You can change everything later in settings."
      className="max-w-4xl"
    >
      <BusinessForm
        initialValues={initialValues}
        onSubmit={handleSubmit}
        submitLabel="Create business"
        serverErrors={serverErrors}
      />
    </PageWrapper>
  );
}
