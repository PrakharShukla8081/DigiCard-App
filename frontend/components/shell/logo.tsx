export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 font-display text-[17px] font-extrabold tracking-tight text-fg">
      <span className="relative grid size-[30px] place-items-center rounded-[9px] bg-fg" aria-hidden>
        <span className="block h-[10px] w-[14px] rounded-[3px] bg-accent" style={{ boxShadow: "4px 4px 0 -1px var(--bg)" }} />
      </span>
      {!compact && <span>Beno Card</span>}
    </span>
  );
}
