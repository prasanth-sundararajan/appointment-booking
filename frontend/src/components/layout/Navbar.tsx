import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { initialsOf, isBusinessUser } from '@/lib/roles';
import { ButtonLink } from '@/components/ui/Button';
import { Logo } from './Logo';

interface NavItem {
  to: string;
  label: string;
}

function navItemsFor(isAuthenticated: boolean, business: boolean): NavItem[] {
  const items: NavItem[] = [{ to: '/explore', label: 'Explore' }];
  if (isAuthenticated) items.push({ to: '/bookings', label: 'My bookings' });
  if (business) items.push({ to: '/dashboard', label: 'Dashboard' });
  return items;
}

const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
  );

const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center rounded-lg px-3 py-2.5 text-base font-medium transition-colors',
    isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-800 hover:bg-gray-100',
  );

function Avatar({ name, email }: { name: string | null; email: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800"
    >
      {initialsOf(name, email)}
    </span>
  );
}

function UserMenu({ onLogout, business }: { onLogout: () => void; business: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(index + 1) % items.length]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length]?.focus();
      } else if (event.key === 'Tab') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const itemClass =
    'flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:outline-none';

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100"
      >
        <Avatar name={user.full_name} email={user.email} />
        <span className="hidden max-w-[10rem] truncate lg:inline">{user.full_name || user.email}</span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-500" aria-hidden="true">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label="Account"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-gray-200 bg-white p-1.5 shadow-pop"
          >
            <div className="border-b border-gray-100 px-3 pb-2.5 pt-2">
              <p className="truncate text-sm font-semibold text-gray-900">{user.full_name || 'Your account'}</p>
              <p className="truncate text-xs text-gray-600">{user.email}</p>
            </div>
            <div className="py-1">
              <Link role="menuitem" to="/profile" className={itemClass} onClick={() => setOpen(false)}>
                Profile
              </Link>
              <Link role="menuitem" to="/bookings" className={itemClass} onClick={() => setOpen(false)}>
                My bookings
              </Link>
              {business && (
                <Link role="menuitem" to="/settings/calendar" className={itemClass} onClick={() => setOpen(false)}>
                  Calendar sync
                </Link>
              )}
              <Link role="menuitem" to="/settings" className={itemClass} onClick={() => setOpen(false)}>
                Settings
              </Link>
            </div>
            <div className="border-t border-gray-100 pt-1">
              <button
                role="menuitem"
                type="button"
                className={cn(itemClass, 'text-red-700 hover:bg-red-50 hover:text-red-800 focus:bg-red-50')}
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
              >
                Log out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const business = isBusinessUser(user);
  const items = navItemsFor(isAuthenticated, business);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('overflow-hidden');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('overflow-hidden');
    };
  }, [open]);

  const handleLogout = async () => {
    await logout();
    setOpen(false);
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/85 backdrop-blur-lg">
      <a
        href="#main"
        className="sr-only rounded-md bg-white px-3 py-2 text-sm font-medium text-brand-700 shadow focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50"
      >
        Skip to content
      </a>
      <nav className="mx-auto flex h-16 max-w-page items-center justify-between gap-4 px-4 sm:px-6 lg:px-8" aria-label="Main">
        <div className="flex items-center gap-6">
          <Logo />
          <div className="hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} className={desktopLinkClass}>
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {isAuthenticated ? (
            <UserMenu onLogout={handleLogout} business={business} />
          ) : (
            <>
              <Link
                to="/register?role=owner"
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              >
                For businesses
              </Link>
              <ButtonLink to="/login" variant="ghost" size="sm">
                Log in
              </ButtonLink>
              <ButtonLink to="/register" variant="gradient" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </div>

        <button
          type="button"
          className="-mr-2 rounded-lg p-2 text-gray-700 hover:bg-gray-100 md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              className="absolute inset-0 bg-gray-950/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              id="mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="absolute inset-y-0 right-0 flex w-[85%] max-w-xs flex-col bg-white shadow-pop"
            >
              <div className="flex h-16 items-center justify-between border-b border-gray-100 px-4">
                <Logo />
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
              {isAuthenticated && user && (
                <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-4">
                  <Avatar name={user.full_name} email={user.email} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{user.full_name || 'Your account'}</p>
                    <p className="truncate text-xs text-gray-600">{user.email}</p>
                  </div>
                </div>
              )}
              <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} className={mobileLinkClass}>
                    {item.label}
                  </NavLink>
                ))}
                {isAuthenticated ? (
                  <>
                    <NavLink to="/profile" className={mobileLinkClass}>
                      Profile
                    </NavLink>
                    <NavLink to="/settings" end className={mobileLinkClass}>
                      Settings
                    </NavLink>
                  </>
                ) : (
                  <NavLink to="/register?role=owner" className={mobileLinkClass}>
                    For businesses
                  </NavLink>
                )}
              </div>
              <div className="border-t border-gray-100 p-4">
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full rounded-lg px-3 py-2.5 text-left text-base font-medium text-red-700 hover:bg-red-50"
                  >
                    Log out
                  </button>
                ) : (
                  <div className="grid gap-2">
                    <ButtonLink to="/register" variant="gradient" fullWidth>
                      Get started
                    </ButtonLink>
                    <ButtonLink to="/login" variant="outline" fullWidth>
                      Log in
                    </ButtonLink>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
}
