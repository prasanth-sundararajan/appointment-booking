import { motion } from 'framer-motion';
import { ButtonLink } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { cn } from '@/lib/cn';
import { onboardingProgress, type OnboardingStep } from '@/lib/onboarding';

export interface OnboardingChecklistProps {
  steps: OnboardingStep[];
  publicUrl: string | null;
  onLinkCopied: () => void;
}

function StepIcon({ done, index }: { done: boolean; index: number }) {
  if (done) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z"
          />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-white text-xs font-semibold text-gray-600">
      {index + 1}
    </span>
  );
}

/** Owner setup checklist, shown on the dashboard until every step is done. */
export function OnboardingChecklist({ steps, publicUrl, onLinkCopied }: OnboardingChecklistProps) {
  const { done, total } = onboardingProgress(steps);
  const nextId = steps.find((s) => !s.done)?.id;

  return (
    <section
      aria-labelledby="onboarding-heading"
      className="mb-6 overflow-hidden rounded-card border border-brand-200 bg-white shadow-card"
    >
      <div className="bg-gradient-to-r from-brand-50 to-white px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="onboarding-heading" className="text-lg font-semibold text-gray-900">
              Finish setting up your booking page
            </h2>
            <p className="mt-0.5 text-sm text-gray-700">Customers can book as soon as these steps are done.</p>
          </div>
          <p className="text-sm font-semibold text-brand-800">
            {done} of {total} complete
          </p>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-brand-100"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <motion.div
            className="h-full rounded-full bg-brand-600"
            initial={{ width: 0 }}
            animate={{ width: `${(done / total) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>
      <ol className="divide-y divide-gray-100">
        {steps.map((step, index) => {
          const isNext = step.id === nextId;
          return (
            <li
              key={step.id}
              className={cn('flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6', isNext && 'bg-brand-50/40')}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <StepIcon done={step.done} index={index} />
                <div className="min-w-0">
                  <p className={cn('font-medium', step.done ? 'text-gray-600 line-through decoration-gray-400' : 'text-gray-900')}>
                    {step.title}
                    <span className="sr-only">{step.done ? ' (done)' : ' (to do)'}</span>
                  </p>
                  {!step.done && <p className="mt-0.5 text-sm text-gray-600">{step.description}</p>}
                </div>
              </div>
              {!step.done && (
                <div className="pl-10 sm:pl-0">
                  {step.id === 'share' ? (
                    publicUrl && (
                      <CopyButton
                        value={publicUrl}
                        label="Copy booking link"
                        variant={isNext ? 'primary' : 'outline'}
                        onCopied={onLinkCopied}
                      />
                    )
                  ) : (
                    step.to && (
                      <ButtonLink to={step.to} size="sm" variant={isNext ? 'primary' : 'outline'}>
                        {step.actionLabel}
                      </ButtonLink>
                    )
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
