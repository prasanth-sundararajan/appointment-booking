/** Decorative purple glows layered over the app-wide navy-to-purple body gradient. */
export function MeshBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute -top-40 left-1/4 h-[32rem] w-[32rem] rounded-full bg-brand-600/25 blur-3xl" />
      <div className="absolute -top-24 right-0 h-96 w-96 rounded-full bg-accent-500/15 blur-3xl" />
      <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />
    </div>
  );
}
