import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Toaster } from '@/components/ui/Toast';

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-gray-100 bg-white py-6 text-center text-sm text-gray-500">
        &copy; {new Date().getFullYear()} SlotEase
      </footer>
      <Toaster />
    </div>
  );
}
