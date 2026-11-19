/** 45 -> "45 min", 60 -> "1h", 90 -> "1h 30m". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m} min`;
}

/** "Europe/London" -> "Europe/London" with underscores replaced for display. */
export function formatTimezone(timezone: string): string {
  return timezone.replace(/_/g, ' ');
}
