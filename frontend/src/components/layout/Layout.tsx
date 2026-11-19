import { Link, Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { LogoMark } from './Logo';
import { Toaster } from '@/components/ui/Toast';

function Footer() {
  const year = new Date().getFullYear();
  const linkClass = 'rounded text-sm text-ink-muted hover:text-white';
  return (
    <footer className="border-t border-line bg-navy-950/60 backdrop-blur-lg">
      <div className="mx-auto grid max-w-page gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr] lg:px-8">
        <div>
          <div className="flex items-center gap-2 font-bold text-ink">
            <LogoMark className="h-7 w-7" />
            SlotEase
          </div>
          <p className="mt-3 max-w-xs text-sm text-ink-muted">
            Live availability, deposits that cut no-shows, and two-way Google Calendar sync.
          </p>
        </div>
        <nav aria-label="For customers">
          <h2 className="text-sm font-semibold text-ink">For customers</h2>
          <ul className="mt-3 space-y-2">
            <li>
              <Link to="/explore" className={linkClass}>
                Find a business
              </Link>
            </li>
            <li>
              <Link to="/bookings" className={linkClass}>
                My bookings
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="For businesses">
          <h2 className="text-sm font-semibold text-ink">For businesses</h2>
          <ul className="mt-3 space-y-2">
            <li>
              <Link to="/register?role=owner" className={linkClass}>
                Create a booking page
              </Link>
            </li>
            <li>
              <Link to="/dashboard" className={linkClass}>
                Dashboard
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-page px-4 py-5 text-sm text-ink-muted sm:px-6 lg:px-8">&copy; {year} SlotEase</p>
      </div>
    </footer>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const isApp = pathname.startsWith('/dashboard');

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
      {!isApp && <Footer />}
      <Toaster />
    </div>
  );
}
