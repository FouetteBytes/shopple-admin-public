export type StatAccent = 'primary' | 'amber' | 'emerald' | 'rose' | 'blue' | 'indigo' | 'violet';

type GlassStatCardProps = {
  label: string;
  value: number | string;
  subtext?: string;
  accent?: StatAccent;
  icon?: any;
  className?: string;
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

const gradientMap: Record<StatAccent, string> = {
  primary: 'from-indigo-500/20 via-sky-500/15 to-purple-500/10',
  amber: 'from-amber-500/25 via-orange-400/20 to-yellow-400/10',
  emerald: 'from-emerald-500/20 via-green-400/15 to-teal-400/10',
  rose: 'from-rose-500/25 via-pink-500/15 to-orange-400/10',
  blue: 'from-sky-500/25 via-cyan-400/15 to-indigo-400/10',
  indigo: 'from-indigo-500/20 via-blue-500/15 to-purple-500/10',
  violet: 'from-violet-500/20 via-purple-500/15 to-fuchsia-500/10',
};

const chipMap: Record<StatAccent, string> = {
  primary: 'bg-indigo-100 text-indigo-700',
  amber: 'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  rose: 'bg-rose-100 text-rose-700',
  blue: 'bg-sky-100 text-sky-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  violet: 'bg-violet-100 text-violet-700',
};

export function GlassStatCard({ label, value, subtext, accent = 'primary', icon: Icon, className }: GlassStatCardProps) {
  return (
    <div className={cn('relative overflow-hidden rounded-[28px] border border-white/40 bg-white/85 p-5 shadow-[0_40px_80px_-40px_rgba(15,23,42,0.4)] backdrop-blur', className)}>
      {accent && <div className={cn('absolute inset-0 opacity-80 blur-2xl', `bg-gradient-to-br ${gradientMap[accent]}`)} aria-hidden />}
      <div className="relative space-y-3">
        <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
            {Icon && <Icon size={20} className={cn('opacity-50', chipMap[accent].split(' ')[1])} />}
        </div>
        <div className="flex items-end gap-3">
          <p className="text-3xl font-bold text-slate-900">{value}</p>
          {subtext ? <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm backdrop-blur', chipMap[accent])}>{subtext}</span> : null}
        </div>
      </div>
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-3xl border border-white/30 bg-white/60" aria-hidden />
    </div>
  );
}
