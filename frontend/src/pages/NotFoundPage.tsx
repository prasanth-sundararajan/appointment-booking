import { useNavigate } from 'react-router-dom';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { PageWrapper } from '@/components/ui/PageWrapper';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <PageWrapper>
      <GlassCard hoverable={false} className="mx-auto max-w-md text-center">
        <p className="text-5xl font-extrabold text-brand-600">404</p>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">Page not found</h1>
        <p className="mt-1 text-sm text-gray-500">The page you are looking for does not exist.</p>
        <GradientButton className="mt-6" onClick={() => navigate('/')}>
          Back home
        </GradientButton>
      </GlassCard>
    </PageWrapper>
  );
}
