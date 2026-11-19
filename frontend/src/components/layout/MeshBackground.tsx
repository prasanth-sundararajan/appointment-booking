export function MeshBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-b from-brand-50/80 via-white to-gray-50" />
      <div className="absolute -top-32 left-1/4 h-[28rem] w-[28rem] rounded-full bg-brand-200/40 blur-3xl" />
      <div className="absolute -top-16 right-0 h-80 w-80 rounded-full bg-accent-100/60 blur-3xl" />
    </div>
  );
}
