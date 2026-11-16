// Standard frame for the mission-console-style panels
export function Painel({ titulo, icone, children, extra, className = "" }: {
  titulo: string;
  icone?: React.ReactNode;
  children: React.ReactNode;
  extra?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative rounded-md border border-(--borda) bg-(--card) backdrop-blur-md p-4 ${className}`}>
      {/* Console-style corners */}
      <span className="pointer-events-none absolute -top-px -left-px h-3 w-3 border-t-2 border-l-2 border-(--canto)" />
      <span className="pointer-events-none absolute -bottom-px -right-px h-3 w-3 border-b-2 border-r-2 border-(--canto)" />
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-(--destaque)">
          {icone}
          {titulo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}
