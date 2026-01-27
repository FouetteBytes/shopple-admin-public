'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Image from 'next/image';
import { Activity, DocumentText, Messages3, People, Refresh, SearchNormal1 } from 'iconsax-react';
import { adminUserInsightsApi, AdminAISessionSummary, AdminUserSummary, AdminSearchHistoryEntry, AdminShoppingListSummary, AdminTimelineEvent, AdminUserInsightsDetail, AdminUserPresence, AdminUserProfile } from '@/lib/adminUserInsightsApi';
import { useGlobalToast } from '@/contexts/ToastContext';
import { resolveAvatarPresentation } from '@/utils/avatar';
import PageContent from '@/components/layout/PageContent';
import { PageHero } from '@/components/shared/PageHero';
import { PageHeader } from '@/components/layout/PageHeader';

import { UserManagementControls } from '@/components/users/UserManagementControls';

interface UserListItemProps {
  user: AdminUserSummary;
  selected: boolean;
  onSelect: (uid: string) => void;
}

const DEFAULT_POLL_INTERVAL = 30_000;

function getDisplayName(profile?: AdminUserProfile | null): string {
  if (!profile) return 'Unknown user';
  return (
    profile.fullName ||
    profile.displayName ||
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
    profile.email ||
    profile.uid ||
    'Unknown user'
  );
}

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return 'Unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const diff = date.getTime() - Date.now();
  const seconds = Math.round(diff / 1000);
  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.34524, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];
  let duration = seconds;
  let unit: Intl.RelativeTimeFormatUnit = 'second';
  for (const [amount, nextUnit] of divisions) {
    if (Math.abs(duration) < amount) {
      unit = nextUnit;
      break;
    }
    duration /= amount;
  }
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  return rtf.format(Math.round(duration), unit);
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return 'Unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

function formatCurrency(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  const absValue = Math.abs(value);
  const fractionDigits = absValue >= 1000 ? 0 : 2;
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatScheduleRange(schedule?: AdminShoppingListSummary['schedule']): string | null {
  if (!schedule) return null;
  const formatDate = (iso?: string | null) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString();
  };
  const start = formatDate(schedule.startDate);
  const end = formatDate(schedule.endDate);
  if (start && end) {
    return `${start} → ${end}`;
  }
  if (start) {
    return `Starts ${start}`;
  }
  if (end) {
    return `Ends ${end}`;
  }
  return null;
}

function PresenceBadge({ presence }: { presence?: AdminUserPresence | null }) {
  const state = presence?.state || 'offline';
  const isOnline = state === 'online';
  const isIdle = state === 'idle' || state === 'away';
  const color = isOnline ? 'bg-emerald-500' : isIdle ? 'bg-amber-500' : 'bg-gray-400';
  const note = presence?.customStatus || presence?.statusMessage;
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`}></span>
      <span className="capitalize">{state}</span>
      {note ? <span className="text-gray-400 normal-case">• {note}</span> : null}
    </div>
  );
}

function UserAvatar({ profile, size = 40 }: { profile?: AdminUserProfile | null; size?: number }) {
  const { imageUrl, fit, backgroundStyle, showBackground, initials } = resolveAvatarPresentation(profile);
  const containerStyle: CSSProperties = { width: size, height: size };
  const containerClasses = [
    'relative rounded-full overflow-hidden flex items-center justify-center font-semibold transition-colors',
    showBackground ? 'text-white' : 'bg-gray-100 text-gray-700',
  ].join(' ');

  return (
    <div className={containerClasses} style={containerStyle}>
      {showBackground ? <div className="absolute inset-0" style={backgroundStyle} aria-hidden /> : null}
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={profile?.fullName ?? profile?.displayName ?? 'User avatar'}
          className={`relative z-10 w-full h-full ${fit === 'contain' ? 'object-contain p-1' : 'object-cover'}`}
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          unoptimized
        />
      ) : (
        <span className="relative z-10 text-sm" aria-hidden>
          {initials}
        </span>
      )}
    </div>
  );
}

function UserListItem({ user, selected, onSelect }: UserListItemProps) {
  const name = getDisplayName(user.profile);
  const lastChanged = user.presence?.lastChanged ? formatRelativeTime(user.presence.lastChanged) : 'Unknown';
  const state = user.presence?.state ?? 'offline';
  const stats = user.stats;

  return (
    <button
      type="button"
      onClick={() => onSelect(user.uid)}
      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors flex items-start gap-3 ${
        selected ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent hover:border-gray-300 bg-white'
      }`}
    >
      <UserAvatar profile={user.profile} size={40} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
          <PresenceBadge presence={user.presence} />
        </div>
        <p className="text-xs text-gray-500">Last change {lastChanged}</p>
        <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-gray-600">
          <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full">
            <DocumentText size={12} />
            {stats?.shoppingLists ?? 0} lists
          </span>
          <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full">
            <People size={12} />
            {stats?.friends ?? 0} friends
          </span>
          <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full">
            <SearchNormal1 size={12} />
            {stats?.recentSearches ?? 0} searches
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-1">State: {state}</p>
      </div>
    </button>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16">
      <Activity size={40} className="text-gray-300" />
      <h3 className="mt-4 text-lg font-semibold text-gray-800">{title}</h3>
      <p className="mt-2 text-sm text-gray-500 max-w-sm">{message}</p>
    </div>
  );
}

function InsightsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white shadow-sm border border-gray-100 rounded-xl p-5 space-y-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{title}</h3>
      </header>
      <div className="space-y-3 text-sm text-gray-600">{children}</div>
    </section>
  );
}

function QuickStatTile({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-lg p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <p className="text-lg font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default function ActiveUsersPage() {
  const { error: showError, info } = useGlobalToast();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserInsightsDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [timeline, setTimeline] = useState<AdminTimelineEvent[] | null>(null);
  const [timelineGeneratedAt, setTimelineGeneratedAt] = useState<string | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [search, setSearch] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const timelineAbortRef = useRef<AbortController | null>(null);

  const loadUsers = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const data = await adminUserInsightsApi.listOnlineUsers();
        setUsers(data.users);
        setLastUpdated(data.updatedAt);
        setTotalCount(typeof data.totalCount === 'number' ? data.totalCount : data.users.length);
        const derivedOnlineCount = data.users.filter((item) => item.presence?.state === 'online').length;
        setOnlineCount(typeof data.onlineCount === 'number' ? data.onlineCount : derivedOnlineCount);

        const firstUserId = data.users.length > 0 ? data.users[0].uid : null;
        if (data.users.length === 0) {
          setSelectedUserId(null);
        } else if (!selectedUserId) {
          setSelectedUserId(firstUserId);
        } else {
          const exists = data.users.some((user) => user.uid === selectedUserId);
          if (!exists && firstUserId) {
            setSelectedUserId(firstUserId);
          }
        }
      } catch (err: any) {
        showError('Failed to load users', err?.message ?? String(err));
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [selectedUserId, showError]
  );

  useEffect(() => {
    let mounted = true;
    loadUsers().catch(() => undefined);
    const interval = setInterval(() => {
      if (mounted) {
        loadUsers(true).catch(() => undefined);
      }
    }, DEFAULT_POLL_INTERVAL);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [loadUsers]);

  const loadDetail = useCallback(
    async (uid: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setDetailLoading(true);
      try {
        const data = await adminUserInsightsApi.getUserInsights(uid);
        if (!controller.signal.aborted) {
          setDetail(data);
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          showError('Failed to load user insights', err?.message ?? String(err));
        }
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      }
    },
    [showError]
  );

  const loadTimeline = useCallback(
    async (uid: string) => {
      timelineAbortRef.current?.abort();
      const controller = new AbortController();
      timelineAbortRef.current = controller;
      setTimelineLoading(true);
      try {
        const data = await adminUserInsightsApi.getUserTimeline(uid);
        if (!controller.signal.aborted) {
          setTimeline(data.events ?? []);
          setTimelineGeneratedAt(data.generatedAt ?? null);
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          showError('Failed to load user timeline', err?.message ?? String(err));
        }
      } finally {
        if (!controller.signal.aborted) {
          setTimelineLoading(false);
        }
      }
    },
    [showError]
  );

  useEffect(() => {
    if (selectedUserId) {
      // PARALLEL LOADING: Load detail and timeline simultaneously
      const loadUserData = async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        timelineAbortRef.current = controller;
        
        setDetailLoading(true);
        setTimelineLoading(true);

        const [detailResult, timelineResult] = await Promise.allSettled([
          adminUserInsightsApi.getUserInsights(selectedUserId),
          adminUserInsightsApi.getUserTimeline(selectedUserId)
        ]);

        if (!controller.signal.aborted) {
          // Handle detail result
          if (detailResult.status === 'fulfilled') {
            setDetail(detailResult.value);
          } else {
            showError('Failed to load user insights', detailResult.reason?.message ?? String(detailResult.reason));
          }
          setDetailLoading(false);

          // Handle timeline result
          if (timelineResult.status === 'fulfilled') {
            setTimeline(timelineResult.value.events ?? []);
            setTimelineGeneratedAt(timelineResult.value.generatedAt ?? null);
          } else {
            showError('Failed to load user timeline', timelineResult.reason?.message ?? String(timelineResult.reason));
          }
          setTimelineLoading(false);
        }
      };
      
      loadUserData().catch(() => undefined);
    } else {
      setDetail(null);
      setTimeline(null);
      setTimelineGeneratedAt(null);
    }
  }, [selectedUserId, showError]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      timelineAbortRef.current?.abort();
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user: AdminUserSummary) => {
      const profile = user.profile;
      const haystack = [
        getDisplayName(profile).toLowerCase(),
        profile?.email?.toLowerCase() ?? '',
        profile?.uid?.toLowerCase() ?? '',
      ].join(' ');
      return haystack.includes(term);
    });
  }, [users, search]);

  const handleRefresh = useCallback(async () => {
    await loadUsers().catch(() => undefined);
    if (selectedUserId) {
      await loadDetail(selectedUserId).catch(() => undefined);
      await loadTimeline(selectedUserId).catch(() => undefined);
    }
    info('User presence refreshed', 'Latest profiles and activity timeline loaded');
  }, [info, loadDetail, loadTimeline, loadUsers, selectedUserId]);

  const renderSearchHistory = (items: AdminSearchHistoryEntry[]) => {
    if (!items.length) {
      return <p className="text-sm text-gray-500">No recent searches recorded.</p>;
    }
    return (
      <ul className="divide-y divide-gray-100">
        {items.map((entry, index) => (
          <li key={`${entry.timestamp ?? 'ts'}-${index}`} className="py-2 flex items-start gap-3">
            <SearchNormal1 size={16} className="mt-0.5 text-primary" />
            <div>
              <p className="text-gray-800 text-sm">{entry.query || 'Unknown query'}</p>
              <p className="text-xs text-gray-500">{formatDateTime(entry.timestamp)}</p>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const renderAISessions = (items: AdminAISessionSummary[]) => {
    if (!items.length) {
      return <p className="text-sm text-gray-500">No AI assistant sessions yet.</p>;
    }

    const formatDuration = (durationMs?: number | null) => {
      if (typeof durationMs !== 'number' || Number.isNaN(durationMs)) return undefined;
      if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
      return `${(durationMs / 1000).toFixed(1)} s`;
    };

    return (
      <ul className="space-y-3">
        {items.map((session) => {
          const status = (session.status || (session.failedCount ? 'failed' : 'success'))?.toLowerCase();
          const isFailure = status === 'failed';
          const statusLabel = isFailure ? 'Failed' : 'Success';
          const statusClasses = isFailure
            ? 'text-red-600 bg-red-100 border border-red-200'
            : 'text-emerald-700 bg-emerald-100 border border-emerald-200';
          const durationLabel = formatDuration(session.durationMs);
          const addedPhrases = Array.isArray(session.addedPhrases) ? session.addedPhrases.slice(0, 4) : [];
          const failedDetails = (session.details?.failedPhrases as Record<string, unknown> | undefined) ?? undefined;
          const failedInput = typeof session.inputText === 'string' ? session.inputText : typeof failedDetails?.input === 'string' ? failedDetails.input : undefined;

          return (
            <li key={session.id} className="border border-gray-100 rounded-lg p-4 bg-white space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{session.summary || 'AI assistant request'}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full ${statusClasses}`}>
                      {statusLabel}
                    </span>
                    {typeof session.rating === 'number' && (
                      <span className="inline-flex items-center px-2 py-0.5 text-[11px] text-amber-700 bg-amber-100 border border-amber-200 rounded-full">
                        Rating {session.rating}/5
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{formatDateTime(session.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  {durationLabel ? <span>Duration: {durationLabel}</span> : null}
                  {typeof session.addedCount === 'number' ? <span>Added items: {session.addedCount}</span> : null}
                  {session.listId ? <span>List: {session.listId}</span> : null}
                </div>
              </div>

              {addedPhrases.length > 0 ? (
                <div className="text-xs text-gray-600">
                  <p className="uppercase tracking-wide text-[11px] text-gray-500 font-semibold">Added phrases</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {addedPhrases.map((phrase, index) => (
                      <li key={`${session.id}-phrase-${index}`}>{phrase}</li>
                    ))}
                    {session.addedPhrases && session.addedPhrases.length > addedPhrases.length ? (
                      <li className="text-gray-400">
                        +{session.addedPhrases.length - addedPhrases.length} more phrase(s)
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              {isFailure && (failedInput || failedDetails) ? (
                <div className="rounded border border-red-100 bg-red-50 p-3 text-xs text-red-700 space-y-1">
                  <p className="uppercase tracking-wide text-[11px] font-semibold">Failure details</p>
                  {failedInput ? <p className="font-medium">Prompt: {failedInput}</p> : null}
                  {failedDetails ? (
                    <ul className="space-y-0.5">
                      {Object.entries(failedDetails)
                        .filter(([key]) => key !== 'input')
                        .map(([key, value]) => (
                          <li key={`${session.id}-failed-${key}`}>
                            <span className="font-medium capitalize">{key}:</span>{' '}
                            <span>{String(value)}</span>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {!isFailure && session.details && Object.keys(session.details).length > 0 ? (
                <div className="rounded border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600 space-y-0.5">
                  <p className="uppercase tracking-wide text-[11px] font-semibold">Session details</p>
                  {Object.entries(session.details)
                    .filter(([key]) => key !== 'failedPhrases')
                    .map(([key, value]) => (
                      <p key={`${session.id}-detail-${key}`}>
                        <span className="font-medium capitalize">{key}:</span> {String(value)}
                      </p>
                    ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  const describeTimelineEvent = (event: AdminTimelineEvent): string => {
    const data = (event.data ?? {}) as Record<string, unknown>;
    const fallback = event.title || 'Activity recorded';
    switch (event.type) {
      case 'search': {
        const query = typeof data.query === 'string' ? data.query : undefined;
        return query ? `Searched for “${query}”` : fallback;
      }
      case 'ai_session': {
        const summary = typeof data.summary === 'string' ? data.summary : undefined;
        const rating = typeof data.rating === 'number' ? data.rating : undefined;
        return [summary || 'AI assistant session', typeof rating === 'number' ? `Rating ${rating}/5` : null]
          .filter(Boolean)
          .join(' • ');
      }
      case 'shopping_list': {
        const name = typeof data.name === 'string' ? data.name : 'Shopping list';
        const total = typeof data.totalItems === 'number' ? data.totalItems : undefined;
        const completed = typeof data.completedItems === 'number' ? data.completedItems : undefined;
        return total != null && completed != null
          ? `${name} (${completed}/${total} items completed)`
          : `${name} updated`;
      }
      case 'friend': {
        const friendName = typeof data.displayName === 'string' ? data.displayName : typeof data.uid === 'string' ? data.uid : 'Friend';
        return `Connected with ${friendName}`;
      }
      case 'presence': {
        const status = typeof data.state === 'string' ? (data.state as string) : 'unknown';
        return `Presence changed to ${status}`;
      }
      default:
        return fallback;
    }
  };

  const formatTimelineTitle = (event: AdminTimelineEvent): string => {
    if (event.title && event.title.trim().length > 0) {
      return event.title;
    }
    const label = event.type.replace(/_/g, ' ');
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const renderShoppingLists = (lists: AdminShoppingListSummary[]) => {
    if (!lists.length) {
      return <p className="text-sm text-gray-500">No shopping lists found.</p>;
    }
    return (
      <div className="space-y-3">
        {lists.map((list) => {
          const lastUpdate = list.updatedAt ?? list.lastActivity ?? null;
          const budget = list.budget;
          const completionPercent = typeof list.completionRate === 'number' && !Number.isNaN(list.completionRate)
            ? Math.round(list.completionRate * 100)
            : null;
          const scheduleLabel = formatScheduleRange(list.schedule);
          const members = list.members ?? [];
          const displayedMembers = members.slice(0, 5);
          const remainingMembers = Math.max(0, members.length - displayedMembers.length);
          const pendingInviteCount = list.pendingInvites?.length ?? 0;
          const topItems = (list.items ?? []).slice(0, 3);
          const extraItems = Math.max(0, (list.items?.length ?? 0) - topItems.length);
          const memberCount = list.collaboration?.memberCount ?? members.length;
          const activeCount = list.collaboration?.activeCount ?? 0;
          const viewerRole = list.collaboration?.viewerRole;
          const budgetLimit = budget?.limit;
          const budgetEstimated = budget?.estimated;
          const budgetRemaining = budget?.remaining;
          const overBudgetAmount = budget?.isOver && typeof budgetLimit === 'number' && typeof budgetEstimated === 'number'
            ? budgetEstimated - budgetLimit
            : null;
          const ownerProfile = list.owner?.profile
            ?? (list.owner?.uid ? members.find((member) => member.uid === list.owner?.uid)?.profile ?? null : null);
          const ownerName = ownerProfile ? getDisplayName(ownerProfile) : list.owner?.uid ?? 'Unknown owner';

          return (
            <div key={list.id} className="border border-gray-100 rounded-lg p-4 bg-white shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{list.name || 'Untitled list'}</p>
                    {list.isShared ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                        Shared
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
                        Private
                      </span>
                    )}
                    {viewerRole ? (
                      <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                        Your role: <span className="font-medium capitalize">{viewerRole}</span>
                      </span>
                    ) : null}
                    {list.status ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5 capitalize">
                        {list.status}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Updated {lastUpdate ? formatRelativeTime(lastUpdate) : 'Unknown'}
                    {lastUpdate ? ` (${formatDateTime(lastUpdate)})` : ''}
                  </p>
                  {scheduleLabel ? <p className="text-xs text-gray-500 mt-1">Schedule: {scheduleLabel}</p> : null}
                  {list.description ? <p className="text-xs text-gray-600 mt-2">{list.description}</p> : null}
                </div>
                <div className="text-xs text-gray-500 flex flex-col items-start sm:items-end gap-1">
                  <span>
                    {list.completedItems ?? 0}/{list.totalItems ?? 0} items
                    {completionPercent != null ? ` • ${completionPercent}% complete` : ''}
                  </span>
                  <span>
                    Members: {memberCount}
                    {activeCount ? ` (${activeCount} active)` : ''}
                  </span>
                  {pendingInviteCount ? <span>Pending invites: {pendingInviteCount}</span> : null}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                  <p className="uppercase tracking-wide text-[11px] text-gray-500 font-semibold">Budget</p>
                  <p>Limit: {formatCurrency(budgetLimit)}</p>
                  <p>Planned spend: {formatCurrency(budgetEstimated)}</p>
                  <p className={budget?.isOver ? 'text-red-600 font-medium' : 'text-emerald-600'}>
                    {budget?.isOver
                      ? `Over by ${formatCurrency(overBudgetAmount ?? 0)}`
                      : `Remaining: ${formatCurrency(budgetRemaining)}`}
                  </p>
                </div>
                <div className="bg-white border border-gray-100 rounded-lg p-3 text-xs text-gray-600 space-y-2">
                  <p className="uppercase tracking-wide text-[11px] text-gray-500 font-semibold">Collaborators</p>
                  {members.length ? (
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {displayedMembers.map((member) => (
                          <div key={member.uid} className="w-8 h-8 rounded-full border-2 border-white shadow-sm bg-white flex items-center justify-center">
                            <UserAvatar profile={member.profile} size={32} />
                          </div>
                        ))}
                      </div>
                      {remainingMembers > 0 ? (
                        <span className="text-[11px] text-gray-500">+{remainingMembers} more</span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-500">No collaborators yet.</p>
                  )}
                  {ownerProfile ? (
                    <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-1">
                      <UserAvatar profile={ownerProfile} size={28} />
                      <div className="text-[11px] text-gray-600">
                        <p className="font-medium text-gray-700">Owner</p>
                        <p>{ownerName}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-lg p-3 text-xs text-gray-600">
                <p className="uppercase tracking-wide text-[11px] text-gray-500 font-semibold mb-2">Recent items</p>
                {topItems.length ? (
                  <ul className="space-y-1">
                    {topItems.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3">
                        <span className={`text-gray-800 ${item.isCompleted ? 'line-through' : ''}`}>
                          {item.name || 'Unnamed item'}
                        </span>
                        <span className="text-gray-500">
                          {item.quantity ?? 0}
                          {item.unit ? ` ${item.unit}` : ''}
                        </span>
                      </li>
                    ))}
                    {extraItems > 0 ? (
                      <li className="text-gray-500">+{extraItems} more items tracked</li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="text-[11px] text-gray-500">No recent items captured.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <PageHeader 
        title="Active Users" 
        subtitle="Real-time user monitoring" 
        icon={People}
        onRefresh={handleRefresh} 
      />
      <PageContent>
        <div className="space-y-6">
            <PageHero
                title="Active Users"
                description="Monitor who is online right now and explore rich user insights."
                badges={lastUpdated && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                        Last updated {formatRelativeTime(lastUpdated)}
                    </span>
                )}
            >
                <button
                    type="button"
                    onClick={handleRefresh}
                    className="inline-flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                    <Refresh size={16} /> Refresh
                </button>
            </PageHero>

            <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
        <section className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
            <div className="relative">
              <SearchNormal1 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email"
                className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Total users</p>
              <p className="text-2xl font-semibold text-gray-900">{totalCount}</p>
              <p className="text-xs text-gray-400 mt-1">Pulled from the Firestore users collection.</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Online now</p>
              <p className="text-2xl font-semibold text-emerald-600">{onlineCount}</p>
              <p className="text-xs text-gray-400 mt-1">Determined by real-time status documents.</p>
            </div>
          </div>

          <div className="space-y-3 max-h-[calc(100vh-240px)] overflow-y-auto pr-1">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-20 bg-white border border-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <EmptyState
                title={search.trim() ? 'No matching users' : 'No users found'}
                message={
                  search.trim()
                    ? 'We could not find any users matching your search. Try a different name or email.'
                    : 'No user accounts were found. Once users sign up, they will appear here.'
                }
              />
            ) : (
              filteredUsers.map((user: AdminUserSummary) => (
                <UserListItem
                  key={user.uid}
                  user={user}
                  selected={user.uid === selectedUserId}
                  onSelect={setSelectedUserId}
                />
              ))
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6">
            {detailLoading || !detail ? (
              <div className="animate-pulse space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-20 bg-gray-100 rounded" />
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <UserAvatar profile={detail.profile} size={64} />
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">{getDisplayName(detail.profile)}</h2>
                      <p className="text-sm text-gray-500">{detail.profile?.email ?? 'Email unavailable'}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <PresenceBadge presence={detail.presence} />
                        <span className="text-xs text-gray-500">
                          Last change {formatRelativeTime(detail.presence?.lastChanged)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <UserManagementControls 
                    uid={detail.profile?.uid || selectedUserId || ''} 
                    isBanned={detail.profile?.isBanned}
                    onUpdate={handleRefresh}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <QuickStatTile label="Active lists" value={detail.shoppingLists.length} icon={<DocumentText size={18} />} />
                  <QuickStatTile label="Friends" value={detail.friends.count} icon={<People size={18} />} />
                  <QuickStatTile label="Friends online" value={detail.friends.onlineNow.length} icon={<Activity size={18} />} />
                  <QuickStatTile label="Recent searches" value={detail.searchHistory.length} icon={<SearchNormal1 size={18} />} />
                  <QuickStatTile label="AI sessions" value={detail.aiSessions.length} icon={<Messages3 size={18} />} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <InsightsSection title="Shopping lists">
                    {renderShoppingLists(detail.shoppingLists)}
                  </InsightsSection>
                  <InsightsSection title="Friends">
                    {detail.friends.items.length === 0 ? (
                      <p className="text-sm text-gray-500">No friends connected yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {detail.friends.items.map((friend) => (
                          <li key={friend.uid} className="flex items-center justify-between text-sm text-gray-700">
                            <span>{friend.displayName || friend.uid}</span>
                            <span className="text-xs text-gray-500">
                              Since {formatDateTime(friend.since)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </InsightsSection>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <InsightsSection title="Recent searches">
                    {renderSearchHistory(detail.searchHistory)}
                  </InsightsSection>
                  <InsightsSection title="AI sessions">
                    {renderAISessions(detail.aiSessions)}
                  </InsightsSection>
                </div>

                <InsightsSection title="Activity timeline">
                  {timelineLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="h-16 bg-gray-100 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : !timeline || timeline.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No recent cross-surface activity captured yet.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {timeline.map((event, index) => (
                        <li key={`${event.type}-${event.timestamp}-${index}`} className="border border-gray-100 rounded-lg p-4 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                {formatTimelineTitle(event)}
                              </p>
                              <p className="text-xs text-gray-500 capitalize">
                                {event.type.replace(/_/g, ' ')}
                              </p>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              <p>{formatRelativeTime(event.timestamp)}</p>
                              <p>{formatDateTime(event.timestamp)}</p>
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-gray-600">
                            {describeTimelineEvent(event)}
                          </p>
                          {event.source && (
                            <p className="mt-2 text-[11px] uppercase tracking-wide text-gray-400">
                              Source: {event.source.replace(/_/g, ' ')}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {timelineGeneratedAt && (
                    <p className="text-[11px] text-gray-400 mt-3">
                      Generated {formatRelativeTime(timelineGeneratedAt)} (at {formatDateTime(timelineGeneratedAt)})
                    </p>
                  )}
                </InsightsSection>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
      </PageContent>
    </div>
  );
}
