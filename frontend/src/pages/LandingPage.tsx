import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MeshBackground } from '@/components/layout/MeshBackground';
import { AnimatedList } from '@/components/ui/AnimatedList';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientButton } from '@/components/ui/GradientButton';
import { PageWrapper } from '@/components/ui/PageWrapper';

const steps = [
  { title: 'Find a business', body: 'Search the directory by category or city.' },
  { title: 'Pick a live slot', body: 'Availability updates in real time, so no double-booking.' },
  { title: 'Pay a small deposit', body: 'Your slot is confirmed instantly, with a clear refund rule.' },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <>
      <MeshBackground />
      <PageWrapper>
        <section className="py-16 text-center sm:py-24">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-gray-900 sm:text-6xl"
          >
            Appointments without the{' '}
            <span className="bg-gradient-to-r from-brand-600 to-pink-500 bg-clip-text text-transparent">
              back-and-forth
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-6 max-w-xl text-lg text-gray-600"
          >
            SlotEase gives your business a shareable booking page, live availability, deposits that cut no-shows,
            and two-way Google Calendar sync.
          </motion.p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <GradientButton size="lg" onClick={() => navigate('/register')}>
              Start for free
            </GradientButton>
            <Button variant="outline" size="lg" className="rounded-full" onClick={() => navigate('/explore')}>
              Explore businesses
            </Button>
          </div>
        </section>

        <section className="pb-16">
          <h2 className="mb-8 text-center text-2xl font-bold text-gray-900">How it works</h2>
          <AnimatedList className="grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <GlassCard key={step.title} className="h-full">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{step.body}</p>
              </GlassCard>
            ))}
          </AnimatedList>
        </section>
      </PageWrapper>
    </>
  );
}
