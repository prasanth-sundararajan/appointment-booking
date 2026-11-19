import { ButtonLink } from '@/components/ui/Button';
import { PageWrapper } from '@/components/ui/PageWrapper';

export default function NotFoundPage() {
  return (
    <PageWrapper>
      <div className="mx-auto max-w-md py-12 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">Error 404</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Page not found</h1>
        <p className="mt-3 text-gray-600">The page you are looking for does not exist or has moved.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink to="/" variant="gradient">
            Back home
          </ButtonLink>
          <ButtonLink to="/explore" variant="outline">
            Explore businesses
          </ButtonLink>
        </div>
      </div>
    </PageWrapper>
  );
}
