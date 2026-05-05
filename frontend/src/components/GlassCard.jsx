export function GlassCard({ className = "", tone = "default", children }) {
  return (
    <section className={`glass-card tone-${tone} ${className}`.trim()}>
      {children}
    </section>
  );
}
