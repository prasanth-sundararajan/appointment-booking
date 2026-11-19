import { lazy, Suspense, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { Layout } from '@/components/layout/Layout';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { createQueryClient } from '@/lib/queryClient';

// Module 1: Auth
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const AuthCallbackPage = lazy(() => import('@/pages/AuthCallbackPage'));
// Module 2: Businesses & Directory
const LandingPage = lazy(() => import('@/pages/LandingPage'));
const ExplorePage = lazy(() => import('@/pages/ExplorePage'));
const BusinessPage = lazy(() => import('@/pages/BusinessPage'));
const CreateBusinessPage = lazy(() => import('@/pages/CreateBusinessPage'));
const BusinessSettingsPage = lazy(() => import('@/pages/BusinessSettingsPage'));
// Module 3: Services & Staff
const ServicesPage = lazy(() => import('@/pages/ServicesPage'));
const StaffPage = lazy(() => import('@/pages/StaffPage'));
const AcceptInvitePage = lazy(() => import('@/pages/AcceptInvitePage'));
// Module 4: Availability
const AvailabilityPage = lazy(() => import('@/pages/AvailabilityPage'));
// Module 5: Bookings
const BookingWizardPage = lazy(() => import('@/pages/BookingWizardPage'));
const BookingSuccessPage = lazy(() => import('@/pages/BookingSuccessPage'));
const MyBookingsPage = lazy(() => import('@/pages/MyBookingsPage'));
const BookingDetailPage = lazy(() => import('@/pages/BookingDetailPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
// Module 6: Payments
const PaymentsPage = lazy(() => import('@/pages/PaymentsPage'));
// Module 8: Google Calendar
const CalendarSettingsPage = lazy(() => import('@/pages/CalendarSettingsPage'));
// Module 10: Dashboard
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const guard = (element: ReactNode) => <ProtectedRoute>{element}</ProtectedRoute>;

export function AppRoutes() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route element={<Layout />}>
          {/* Public */}
          <Route index element={<LandingPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="auth/callback" element={<AuthCallbackPage />} />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="b/:slug" element={<BusinessPage />} />
          <Route path="invite/:token" element={<AcceptInvitePage />} />

          {/* Customer */}
          <Route path="profile" element={guard(<ProfilePage />)} />
          <Route path="b/:slug/book" element={guard(<BookingWizardPage />)} />
          <Route path="bookings" element={guard(<MyBookingsPage />)} />
          <Route path="bookings/success" element={guard(<BookingSuccessPage />)} />
          <Route path="bookings/:id" element={guard(<BookingDetailPage />)} />
          <Route path="settings" element={guard(<SettingsPage />)} />
          <Route path="settings/calendar" element={guard(<CalendarSettingsPage />)} />

          {/* Owner / staff dashboard */}
          <Route path="dashboard" element={guard(<DashboardPage />)} />
          <Route path="dashboard/businesses/new" element={guard(<CreateBusinessPage />)} />
          <Route path="dashboard/b/:id" element={guard(<DashboardLayout />)}>
            <Route index element={<Navigate to="calendar" replace />} />
            <Route path="settings" element={<BusinessSettingsPage />} />
            <Route path="services" element={<ServicesPage />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="availability" element={<AvailabilityPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="payments" element={<PaymentsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export function AppProviders({ children, queryClient }: { children: ReactNode; queryClient?: QueryClient }) {
  const [client] = useState<QueryClient>(() => queryClient ?? createQueryClient());
  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  );
}
