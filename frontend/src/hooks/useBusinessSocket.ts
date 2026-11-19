import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { post } from '@/services/api';
import { useToast } from '@/hooks/useToast';
import type {
  Booking,
  BusinessSocketChannel,
  DashboardSocketEvent,
  Slot,
  SlotEventPayload,
  SlotSocketEvent,
} from '@/types';

type SocketEvent = SlotSocketEvent | DashboardSocketEvent;

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
/** Close codes the backend uses for a rejected/expired token. */
const AUTH_CLOSE_CODES = new Set([1008, 4001, 4401, 4403]);

const SLOT_EVENTS = new Set<string>(['slot.taken', 'slot.freed']);
const DASHBOARD_EVENTS = new Set<string>([
  'booking.created',
  'booking.confirmed',
  'booking.cancelled',
  'booking.rescheduled',
]);

interface WsTicketResponse {
  ticket: string;
  expires_in: number;
}

/** Exchange the access token (sent by the API client) for a fresh single-use WS ticket. */
async function fetchWsTicket(businessId: number): Promise<string | null> {
  try {
    const data = await post<WsTicketResponse, { business_id: number }>('/api/ws/ticket', {
      business_id: businessId,
    });
    return data.ticket;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Parse a raw WS message. Accepts `{type, data}` and the `{event, payload}` variant. */
export function parseSocketEvent(raw: unknown): SocketEvent | null {
  if (typeof raw !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const type = parsed.type ?? parsed.event;
  const data = parsed.data ?? parsed.payload;
  if (typeof type !== 'string' || !isRecord(data)) return null;
  if (SLOT_EVENTS.has(type)) {
    return { type, data: data as unknown as SlotEventPayload } as SlotSocketEvent;
  }
  if (DASHBOARD_EVENTS.has(type)) {
    return { type, data: data as unknown as Booking } as DashboardSocketEvent;
  }
  return null;
}

function overlaps(slot: Slot, event: SlotEventPayload): boolean {
  return (
    new Date(slot.start_at).getTime() < new Date(event.end_at).getTime() &&
    new Date(event.start_at).getTime() < new Date(slot.end_at).getTime()
  );
}

/** Optimistically drop a taken slot from every cached slot list so the grid animates it out at once. */
export function removeTakenSlot(slots: Slot[], event: SlotEventPayload): Slot[] {
  return slots.flatMap((slot) => {
    if (!overlaps(slot, event)) return [slot];
    const staffIds = slot.staff_ids ?? [];
    if (staffIds.length === 0) return [];
    if (!staffIds.includes(event.staff_id)) return [slot];
    const remaining = staffIds.filter((id) => id !== event.staff_id);
    return remaining.length > 0 ? [{ ...slot, staff_ids: remaining }] : [];
  });
}

function invalidateBusiness(queryClient: QueryClient, businessId: number): void {
  void queryClient.invalidateQueries({ queryKey: ['slots', businessId] });
  void queryClient.invalidateQueries({ queryKey: ['business-bookings', businessId] });
  void queryClient.invalidateQueries({ queryKey: ['stats', businessId] });
}

/**
 * Subscribe to a business WebSocket channel.
 * - `slots`: public, `slot.taken` / `slot.freed`.
 * - `dashboard`: owner/staff (single-use ticket in `?ticket=`, fetched before every
 *   (re)connect), booking lifecycle events + toast.
 * Reconnects with exponential backoff and invalidates TanStack Query caches on each event.
 */
export function useBusinessSocket(businessId: number | undefined, channel: 'slots' | 'dashboard'): void {
  const queryClient = useQueryClient();
  const toast = useToast();
  const toastRef = useRef(toast);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    if (businessId === undefined || Number.isNaN(businessId)) return;
    if (typeof WebSocket === 'undefined') return;

    const ch: BusinessSocketChannel = channel;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;

    const scheduleReconnect = () => {
      if (disposed) return;
      const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
      const jitter = Math.random() * 0.3 * delay;
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        void connect();
      }, delay + jitter);
    };

    const handleEvent = (event: SocketEvent) => {
      if (event.type === 'slot.taken') {
        queryClient.setQueriesData<Slot[]>({ queryKey: ['slots', businessId] }, (old) =>
          Array.isArray(old) ? removeTakenSlot(old, event.data) : old,
        );
      }
      invalidateBusiness(queryClient, businessId);

      if (event.type.startsWith('booking.')) {
        const booking = event.data as Booking;
        if (typeof booking.id === 'number') {
          void queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
        }
        if (ch === 'dashboard' && (event.type === 'booking.created' || event.type === 'booking.confirmed')) {
          const when =
            typeof booking.start_at === 'string'
              ? new Date(booking.start_at).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : undefined;
          if (event.type === 'booking.created') {
            toastRef.current.info('New booking request', when ? `Awaiting deposit for ${when}` : undefined);
          } else {
            toastRef.current.success('Booking confirmed', when ? `Deposit paid for ${when}` : undefined);
          }
        }
      }
    };

    const connect = async () => {
      if (disposed) return;
      let url = `${env.wsUrl}/ws/businesses/${businessId}/${ch}`;
      if (ch === 'dashboard') {
        // Tickets are single-use and expire after 60s, so always fetch a fresh one.
        const ticket = await fetchWsTicket(businessId);
        if (disposed) return;
        if (!ticket) {
          scheduleReconnect();
          return;
        }
        url += `?ticket=${encodeURIComponent(ticket)}`;
      }

      const ws = new WebSocket(url);
      socket = ws;

      ws.onopen = () => {
        // After a reconnect we may have missed events, so refresh everything once.
        if (attempt > 0) invalidateBusiness(queryClient, businessId);
        attempt = 0;
      };
      ws.onmessage = (message: MessageEvent) => {
        const event = parseSocketEvent(message.data);
        if (event) handleEvent(event);
      };
      ws.onerror = () => {
        ws.close();
      };
      ws.onclose = (closeEvent: CloseEvent) => {
        if (socket === ws) socket = null;
        if (disposed) return;
        // Auth failures (e.g. an expired ticket) just retry: the next attempt fetches a
        // new ticket, and the API client refreshes the access token if needed.
        if (AUTH_CLOSE_CODES.has(closeEvent.code)) attempt = Math.max(attempt, 1);
        scheduleReconnect();
      };
    };

    void connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.close();
        socket = null;
      }
    };
  }, [businessId, channel, queryClient]);
}

export default useBusinessSocket;
