import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export const HOLD_MINUTES = 10;

export interface HoldCountdownProps {
  /** ISO timestamp the hold expires at. */
  expiresAt: string;
  onExpire?: () => void;
  className?: string;
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Countdown for the 10-minute slot hold. */
export function HoldCountdown({ expiresAt, onExpire, className }: HoldCountdownProps) {
  const target = new Date(expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const onExpireRef = useRef(onExpire);
  const firedRef = useRef(false);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    firedRef.current = false;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [target]);

  const remaining = target - now;
  const expired = remaining <= 0;

  useEffect(() => {
    if (expired && !firedRef.current) {
      firedRef.current = true;
      onExpireRef.current?.();
    }
  }, [expired]);

  const urgent = remaining < 2 * 60 * 1000;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      role="timer"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium',
        expired ? 'bg-gray-100 text-gray-600' : urgent ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800',
        className,
      )}
    >
      {expired ? 'Hold expired' : <>Slot held for {formatRemaining(remaining)}</>}
    </motion.div>
  );
}
