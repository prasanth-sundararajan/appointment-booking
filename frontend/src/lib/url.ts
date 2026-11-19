/**
 * Absolute URL for an in-app path, honouring the Vite base path
 * (the app may be served under e.g. /techstack/appointment-booking/).
 * Use for links people copy or share; use router <Link> for navigation.
 */
export function absoluteAppUrl(path: string, origin: string = window.location.origin): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${base}${clean}`;
}

/** Public booking page URL for a business slug. */
export function publicBusinessUrl(slug: string): string {
  return absoluteAppUrl(`/b/${slug}`);
}
