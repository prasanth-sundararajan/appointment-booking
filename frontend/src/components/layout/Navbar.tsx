import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { GradientButton } from '@/components/ui/GradientButton';

interface NavItem {
  to: string;
  label: string;
}

function navItemsFor(isAuthenticated: boolean, isBusinessUser: boolean): NavItem[] {
  const items: NavItem[] = [{ to: '/explore', label: 'Explore' }];
  if (isAuthenticated) items.push({ to: '/bookings', label: 'My bookings' });
  if (isBusinessUser) items.push({ to: '/dashboard', label: 'Dashboard' });
  return items;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
  );

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isBusinessUser =
    user !== null && (user.role !== 'customer' || user.owned_businesses.length > 0 || user.staff_memberships.length > 0);
  const items = navItemsFor(isAuthenticated, isBusinessUser);

  const handleLogout = async () => {
    await logout();
    setOpen(false);
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/70 backdrop-blur-lg">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-pink-500 text-sm text-white">
            S
          </span>
          SlotEase
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {isAuthenticated ? (
            <>
              <NavLink to="/settings" className={linkClass}>
                {user?.full_name || user?.email}
              </NavLink>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
                Log in
              </Button>
              <GradientButton size="sm" onClick={() => navigate('/register')}>
                Get started
              </GradientButton>
            </>
          )}
        </div>

        <motion.button
          type="button"
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
              clipRule="evenodd"
            />
          </svg>
        </motion.button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-gray-100 bg-white md:hidden"
          >
            <div className="flex flex-col gap-1 p-4">
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} className={linkClass} onClick={() => setOpen(false)}>
                  {item.label}
                </NavLink>
              ))}
              {isAuthenticated ? (
                <>
                  <NavLink to="/settings" className={linkClass} onClick={() => setOpen(false)}>
                    Settings
                  </NavLink>
                  <Button variant="outline" size="sm" onClick={handleLogout} className="mt-2">
                    Log out
                  </Button>
                </>
              ) : (
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" size="sm" fullWidth onClick={() => { setOpen(false); navigate('/login'); }}>
                    Log in
                  </Button>
                  <GradientButton size="sm" fullWidth onClick={() => { setOpen(false); navigate('/register'); }}>
                    Get started
                  </GradientButton>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
