import { RequesterAvatar, type RequesterInfo } from './RequesterAvatar';

type RequesterSectionProps = {
  requester: RequesterInfo | null;
  submittedById?: string | null;
};

export function RequesterSection({ requester, submittedById }: RequesterSectionProps) {
  if (!requester) return null;

  return (
    <section className="rounded-[28px] border border-white/40 bg-gradient-to-br from-white/95 via-slate-50/70 to-primary/5 p-5 shadow-[0_30px_80px_-45px_rgba(30,41,59,0.6)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Requester</p>
          <p className="text-base font-semibold text-slate-900">{requester.name}</p>
          {requester.email && <p className="text-xs text-slate-500">{requester.email}</p>}
        </div>
        {submittedById && (
          <span className="rounded-full border border-white/40 bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
            UID {submittedById}
          </span>
        )}
      </div>
      <div className="mt-4 flex items-center gap-4 rounded-2xl border border-white/50 bg-white/80 p-4 shadow-inner shadow-slate-900/5">
        <RequesterAvatar info={requester} size="md" />
        <div className="flex-1 text-sm text-slate-600">
          {requester.profile?.presence?.state ? (
            <p className="font-medium text-slate-900">Presence: {requester.profile.presence.state}</p>
          ) : (
            <p className="text-xs text-slate-500">Profile synced from mobile app</p>
          )}
          {requester.profile?.presence?.lastSeen && (
            <p className="text-xs text-slate-500">Last active {new Date(requester.profile.presence.lastSeen).toLocaleString()}</p>
          )}
        </div>
      </div>
    </section>
  );
}
