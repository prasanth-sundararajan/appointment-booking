import { motion } from 'framer-motion';
import { MeshBackground } from '@/components/layout/MeshBackground';
import { ButtonLink } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { formatMoney } from '@/lib/money';
import { canOwnBusiness, isBusinessUser } from '@/lib/roles';

const CUSTOMER_STEPS = [
  { title: 'Find a business', body: 'Search by name, category or city and see real prices up front.' },
  { title: 'Pick a live slot', body: 'Times update in real time, so the slot you pick is really free.' },
  { title: 'Pay a small deposit', body: 'Your booking is confirmed instantly, with a clear refund rule.' },
];

const BUSINESS_STEPS = [
  { title: 'Create your page', body: 'Add your services, prices and team. Get a shareable booking link.' },
  { title: 'Set your hours', body: 'Weekly hours and time off per staff member. Slots build themselves.' },
  { title: 'Get paid, fewer no-shows', body: 'Deposits are collected at booking and refunds follow your rules.' },
];

const FEATURES = [
  { title: 'Live availability', body: 'Slots disappear the moment someone books them. No double-bookings.' },
  { title: 'Deposits & refunds', body: 'Choose 10-100% deposits and a cancellation cutoff. Refunds are automatic.' },
  { title: 'Team scheduling', body: 'Each staff member has their own services, hours, time off and calendar.' },
  { title: 'Google Calendar sync', body: 'Bookings appear in Google and your busy times block slots, both ways.' },
];

const MOCK_SLOTS = ['09:00', '09:30', '10:30', '11:00', '14:00', '15:30'];

function StepList({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="space-y-5">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
            {index + 1}
          </span>
          <div>
            <h4 className="font-semibold text-gray-900">{step.title}</h4>
            <p className="mt-0.5 text-sm text-gray-600">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Static preview of the booking widget (decorative). */
function BookingPreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-brand-200/60 to-accent-100/60 blur-2xl" />
      <div className="relative rounded-2xl border border-gray-200 bg-white p-5 shadow-pop sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 font-bold text-white">
            G
          </span>
          <div>
            <p className="font-semibold text-gray-900">Glow Studio</p>
            <p className="text-xs text-gray-600">Haircut &amp; style &middot; 45 min</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Thursday 12 March &middot; Morning</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {MOCK_SLOTS.map((time, i) => (
            <span
              key={time}
              className={
                i === 2
                  ? 'rounded-lg border-2 border-brand-600 bg-brand-600 py-2 text-center text-sm font-semibold text-white'
                  : 'rounded-lg border border-gray-200 py-2 text-center text-sm font-medium text-gray-800'
              }
            >
              {time}
            </span>
          ))}
        </div>
        <div className="mt-5 space-y-1.5 rounded-xl bg-gray-50 p-4 text-sm">
          <div className="flex justify-between text-gray-700">
            <span>Price</span>
            <span>{formatMoney(50000, 'INR', 'en-IN')}</span>
          </div>
          <div className="flex justify-between font-semibold text-brand-800">
            <span>Deposit today (15%)</span>
            <span>{formatMoney(7500, 'INR', 'en-IN')}</span>
          </div>
          <p className="pt-1 text-xs text-gray-600">Cancel at least 8h before for a full refund.</p>
        </div>
        <span className="mt-4 block rounded-lg bg-brand-600 py-2.5 text-center text-sm font-semibold text-white">
          Pay {formatMoney(7500, 'INR', 'en-IN')} deposit
        </span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const business = isBusinessUser(user);
  const ownerCta = user
    ? canOwnBusiness(user) || business
      ? { to: '/dashboard', label: 'Go to dashboard' }
      : { to: '/profile', label: 'Set up my business' }
    : { to: '/register?role=owner', label: 'List your business' };

  return (
    <>
      <MeshBackground />

      {/* Hero */}
      <section className="mx-auto grid max-w-page items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:pb-24">
        <div className="text-center lg:text-left">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-sm font-medium text-brand-800"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Real-time booking with deposits
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-gray-900 sm:text-5xl lg:text-display"
          >
            Appointments without the{' '}
            <span className="bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">back-and-forth</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mx-auto mt-5 max-w-xl text-lg text-gray-600 lg:mx-0"
          >
            Customers book a live slot in seconds. Businesses get a shareable booking page, deposits that cut no-shows,
            and two-way Google Calendar sync.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start"
          >
            <ButtonLink to="/explore" variant="gradient" size="lg">
              Book an appointment
            </ButtonLink>
            <ButtonLink to={ownerCta.to} variant="outline" size="lg">
              {ownerCta.label}
            </ButtonLink>
          </motion.div>
          <p className="mt-4 text-sm text-gray-600">Free to start. No card needed to create your page.</p>
        </div>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <BookingPreview />
        </motion.div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-heading" className="border-y border-gray-200 bg-white">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="how-heading" className="text-3xl font-bold text-gray-900">
              How it works
            </h2>
            <p className="mt-3 text-gray-600">Three steps on each side of the booking.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-6 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">For customers</p>
              <h3 className="mt-1 text-xl font-bold text-gray-900">Book in under a minute</h3>
              <div className="mt-6">
                <StepList steps={CUSTOMER_STEPS} />
              </div>
              <ButtonLink to="/explore" variant="primary" className="mt-8">
                Explore businesses
              </ButtonLink>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-6 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">For businesses</p>
              <h3 className="mt-1 text-xl font-bold text-gray-900">Take bookings while you work</h3>
              <div className="mt-6">
                <StepList steps={BUSINESS_STEPS} />
              </div>
              <ButtonLink to={ownerCta.to} variant="primary" className="mt-8">
                {ownerCta.label}
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section aria-labelledby="features-heading" className="mx-auto max-w-page px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <h2 id="features-heading" className="text-center text-3xl font-bold text-gray-900">
          Everything a booking needs
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-card border border-gray-200 bg-white p-6 shadow-card">
              <h3 className="font-semibold text-gray-900">{feature.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
        <div className="mx-auto max-w-page overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-12 text-center sm:px-12">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready when you are</h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-100">
            Find a slot that suits you, or give your customers a booking page they will actually use.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink to="/explore" size="lg" variant="outline" className="border-white bg-white text-brand-800 hover:bg-brand-50">
              Find a business
            </ButtonLink>
            <ButtonLink
              to={ownerCta.to}
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:border-white hover:bg-white/10"
            >
              {ownerCta.label}
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
