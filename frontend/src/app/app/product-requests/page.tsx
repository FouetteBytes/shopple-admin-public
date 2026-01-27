'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { DocumentText, Flash, Warning2, Gallery, Activity, Timer1, Eye, Add } from 'iconsax-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  productRequestsApi,
  type AssignedAdmin,
  type ProductRequestDetail,
  type ProductRequestListResponse,
  type ProductRequestStats,
  type ProductRequestStatus,
  type ProductRequestType,
} from '@/lib/productRequestApi';
import { useGlobalToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { extractRequesterInfo } from './components/RequesterAvatar';
import { ProductDatabaseSearchEnhanced } from './components/ProductDatabaseSearchEnhanced';
import { RequestFilters } from './components/RequestFilters';
import { RequestListItem } from './components/RequestListItem';
import { RequestDetailHeader } from './components/RequestDetailHeader';
import { RequesterSection } from './components/RequesterSection';
import { ProductInfoSection } from './components/ProductInfoSection';
import { PhotoGallery } from './components/PhotoGallery';
import { IssueDetails } from './components/IssueDetails';
import { LabelsSection } from './components/LabelsSection';
import { AdminNotesSection } from './components/AdminNotesSection';
import { ActivityTimeline } from './components/ActivityTimeline';
import { ProductUpdateModal } from './components/ProductUpdateModal';
import { RejectionModal } from './components/RejectionModal';
import { PendingProductsSection } from './components/PendingProductsSection';
import { GlassSubTabs } from '@/components/shared/GlassSubTabs';
import { GlassStatCard, type StatAccent } from '@/components/shared/GlassStatCard';
import { API_BASE_URL } from '@/lib/api';
import { PageHero } from '@/components/shared/PageHero';
import { PageHeader } from '@/components/layout/PageHeader';

type TaggedProductSummary = {
  id?: string;
  name?: string;
  brand_name?: string;
  image_url?: string;
  size?: number | string;
  sizeUnit?: string;
  sizeRaw?: string;
  category?: string;
  variety?: string;
};
import {
  PRIORITY_OPTIONS,
  STATUS_TRANSITIONS,
  STATUS_META,
  REQUEST_TYPE_META,
  PRIORITY_META,
  defaultFilters,
  type Filters,
} from './constants';
import { formatDate, matchesDateRange } from './utils';

const ISSUE_FIELDS = [
  { incorrect: 'incorrectName', correct: 'correctName', label: 'Name' },
  { incorrect: 'incorrectBrand', correct: 'correctBrand', label: 'Brand' },
  { incorrect: 'incorrectSize', correct: 'correctSize', label: 'Size' },
  { incorrect: 'incorrectPrice', correct: 'correctPrice', label: 'Price' },
];

type IssueRow = { label: string; incorrect?: string; correct?: string };

type DetailTabKey = 'overview' | 'media' | 'activity';

type DetailTabConfig = {
  key: DetailTabKey;
  label: string;
  description: string;
  icon: typeof DocumentText;
  accentGradient: string;
};

type RequestStatCard = {
  key: string;
  label: string;
  value: number;
  subtext: string;
  accent: StatAccent;
};

const DETAIL_TABS: DetailTabConfig[] = [
  {
    key: 'overview',
    label: 'Overview',
    description: 'Requester, metadata & quick actions',
    icon: DocumentText,
    accentGradient: 'bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-transparent',
  },
  {
    key: 'media',
    label: 'Media Lab',
    description: 'Attachments, annotations & image tweaks',
    icon: Gallery,
    accentGradient: 'bg-gradient-to-br from-sky-500/20 via-cyan-500/10 to-transparent',
  },
  {
    key: 'activity',
    label: 'Activity & Notes',
    description: 'Internal notes and audit trail',
    icon: Activity,
    accentGradient: 'bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-transparent',
  },
];

function buildIssueRows(issue: ProductRequestDetail['issue']): IssueRow[] {
  if (!issue) return [];
  const rows: IssueRow[] = [];
  ISSUE_FIELDS.forEach((field) => {
    const incorrectValue = (issue as Record<string, string | undefined>)[field.incorrect];
    const correctValue = (issue as Record<string, string | undefined>)[field.correct];
    if (incorrectValue || correctValue) {
      rows.push({ label: field.label, incorrect: incorrectValue, correct: correctValue });
    }
  });
  return rows;
}

function getAdminIdentity(user: ReturnType<typeof useAuth>['user'] | null) {
  if (!user) return undefined;
  return {
    id: user.uid,
    name: user.displayName || user.email,
    email: user.email,
  };
}

export default function ProductRequestsPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [list, setList] = useState<ProductRequestListResponse | null>(null);
  const [stats, setStats] = useState<ProductRequestStats | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductRequestDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [bulkSelection, setBulkSelection] = useState<string[]>([]);
  const [bulkAssignToSelf, setBulkAssignToSelf] = useState(true);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [productUpdateModal, setProductUpdateModal] = useState<string | null>(null);
  const [linkedProduct, setLinkedProduct] = useState<TaggedProductSummary | null>(null);
  const [linkedProductLoading, setLinkedProductLoading] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'requests' | 'pending'>('requests');
  const [pendingProductsCount, setPendingProductsCount] = useState(0);
  const [detailTab, setDetailTab] = useState<DetailTabKey>('overview');
  const [showCompleted, setShowCompleted] = useState(false);

  const { success, error: showError, info } = useGlobalToast();
  const { user } = useAuth();
  const adminIdentity = useMemo(() => getAdminIdentity(user), [user]);

  const detailRequester = useMemo(() => extractRequesterInfo(detail?.submittedBy), [detail?.submittedBy]);

  const filteredItems = useMemo(() => {
    if (!list) return [];
    return list.items.filter((item) => matchesDateRange(item.createdAt, filters.dateRange));
  }, [list, filters.dateRange]);

  const activeRequests = useMemo(() => filteredItems.filter((item) => item.status !== 'completed'), [filteredItems]);
  const completedRequests = useMemo(() => filteredItems.filter((item) => item.status === 'completed'), [filteredItems]);
  const displayedItems = useMemo(() => (showCompleted ? filteredItems : activeRequests), [filteredItems, activeRequests, showCompleted]);
  const visibleRequestIds = useMemo(() => displayedItems.map((item) => item.id), [displayedItems]);
  const mainTabs = useMemo(
    () => [
      {
        key: 'requests' as const,
        label: 'Requests queue',
        description:
          completedRequests.length > 0
            ? `${activeRequests.length} active • ${completedRequests.length} completed`
            : `${activeRequests.length} active`,
        icon: DocumentText,
        accentGradient: 'bg-gradient-to-br from-indigo-500/20 via-sky-400/20 to-transparent',
      },
      {
        key: 'pending' as const,
        label: 'Pending products',
        description: pendingProductsCount > 0 ? `${pendingProductsCount} awaiting catalog` : 'Nothing waiting right now',
        icon: Gallery,
        accentGradient: 'bg-gradient-to-br from-rose-500/20 via-orange-400/20 to-transparent',
        badgeValue: pendingProductsCount > 0 ? pendingProductsCount : undefined,
        badgeClassName: 'bg-rose-500',
      },
    ],
    [activeRequests.length, completedRequests.length, pendingProductsCount]
  );
  const detailSubTabs = useMemo(
    () =>
      DETAIL_TABS.map((tab) => ({
        key: tab.key,
        label: tab.label,
        description: tab.description,
        icon: tab.icon,
        accentGradient: tab.accentGradient,
      })),
    []
  );
  const bulkSelectedCount = bulkSelection.length;
  const allVisibleSelected = useMemo(() => {
    if (visibleRequestIds.length === 0) return false;
    return visibleRequestIds.every((id) => bulkSelection.includes(id));
  }, [visibleRequestIds, bulkSelection]);

  useEffect(() => {
    if (!list) {
      setBulkSelection([]);
      return;
    }
    setBulkSelection((prev) => prev.filter((id) => list.items.some((item) => item.id === id)));
  }, [list]);

  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/pending-products?status=pending`);
        if (!response.ok) return;
        const data = await response.json();
        setPendingProductsCount(data.items?.length ?? 0);
      } catch (err) {
        console.error('Failed to fetch pending products count:', err);
      }
    };
    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 30000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  useEffect(() => {
    if (!detail?.id) return;
    setDetailTab('overview');
  }, [detail?.id]);

  useEffect(() => {
    if (completedRequests.length === 0 && showCompleted) {
      setShowCompleted(false);
    }
  }, [completedRequests.length, showCompleted]);

  const pendingCount = stats?.status?.pending ?? 0;
  const reviewCount = stats?.status?.inReview ?? 0;
  const todaysCount = stats?.totals?.requestsToday ?? 0;
  const highPriorityCount = stats?.totals?.highPriority ?? 0;
  const requestTypeStats = stats?.requestType;

  const overviewStatCards: RequestStatCard[] = [
    {
      key: 'pending',
      label: 'Pending',
      value: pendingCount,
      subtext: 'Awaiting triage in the queue',
      accent: 'amber',
    },
    {
      key: 'review',
      label: 'In review',
      value: reviewCount,
      subtext: 'Currently being processed',
      accent: 'primary',
    },
    {
      key: 'today',
      label: 'Today',
      value: todaysCount,
      subtext: 'Submitted in the last 24h',
      accent: 'emerald',
    },
    {
      key: 'high-priority',
      label: 'High priority',
      value: highPriorityCount,
      subtext: 'Flagged as urgent',
      accent: 'rose',
    },
  ];

  const requestTypeCards: RequestStatCard[] = [
    {
      key: 'new-product',
      label: 'New product',
      value: requestTypeStats?.newProduct ?? 0,
      subtext: 'Awaiting catalog entry',
      accent: 'blue',
    },
    {
      key: 'update-product',
      label: 'Updates',
      value: requestTypeStats?.updateProduct ?? 0,
      subtext: 'Corrections to existing data',
      accent: 'primary',
    },
    {
      key: 'report-error',
      label: 'Errors',
      value: requestTypeStats?.reportError ?? 0,
      subtext: 'High urgency issues',
      accent: 'rose',
    },
    {
      key: 'price-update',
      label: 'Price updates',
      value: requestTypeStats?.priceUpdate ?? 0,
      subtext: 'Store-specific price changes',
      accent: 'amber',
    },
  ];

  const handleSelect = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setLoadingDetail(true);
      try {
        const data = await productRequestsApi.get(id);
        setDetail(data);
      } catch (err: any) {
        showError('Failed to load request details', err?.message ?? String(err));
      } finally {
        setLoadingDetail(false);
      }
    },
    [showError]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingList(true);
      try {
        const [listResponse, statsResponse] = await Promise.all([
          productRequestsApi.list({
            status: filters.status,
            requestType: filters.requestType,
            priority: filters.priority,
            search: filters.search,
            page: filters.page,
            pageSize: filters.pageSize,
          }),
          productRequestsApi.getStats().catch((err) => {
            console.warn('Failed to load product request stats', err);
            return null;
          }),
        ]);

        if (cancelled) return;
        setList(listResponse);
        if (statsResponse) {
          setStats(statsResponse);
        }
        setLastRefreshedAt(new Date());

        // Auto-select the first item only when no item is selected and the list is non-empty.
        // Use a ref to avoid selectedId dependencies that trigger re-fetches.
        setSelectedId((currentSelected) => {
          if (!currentSelected && listResponse.items.length > 0) {
            // Trigger detail fetch for first item
            const firstId = listResponse.items[0].id;
            setLoadingDetail(true);
            productRequestsApi.get(firstId).then((data) => {
              if (!cancelled) {
                setDetail(data);
                setLoadingDetail(false);
              }
            }).catch((err) => {
              if (!cancelled) {
                showError('Failed to load request details', err?.message ?? String(err));
                setLoadingDetail(false);
              }
            });
            return firstId;
          } else if (currentSelected && !listResponse.items.some((item) => item.id === currentSelected)) {
            // Selected item no longer in list
            setDetail(null);
            return null;
          }
          return currentSelected;
        });
      } catch (err: any) {
        if (!cancelled) {
          showError('Failed to load product requests', err?.message ?? String(err));
        }
      } finally {
        if (!cancelled) {
          setLoadingList(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filters.status, filters.requestType, filters.priority, filters.search, filters.page, filters.pageSize, refreshKey, showError]);

  useEffect(() => {
    let cancelled = false;
    async function fetchTaggedProduct() {
      if (!detail?.taggedProductId) {
        if (!cancelled) {
          setLinkedProduct(null);
        }
        return;
      }

      setLinkedProductLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/products/${detail.taggedProductId}`);
        if (!response.ok) throw new Error('Failed to fetch tagged product');
        const data = await response.json();
        if (!cancelled) {
          setLinkedProduct((data.product as TaggedProductSummary) ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to load tagged product metadata', err);
          setLinkedProduct(null);
        }
      } finally {
        if (!cancelled) {
          setLinkedProductLoading(false);
        }
      }
    }

    fetchTaggedProduct();
    return () => {
      cancelled = true;
    };
  }, [detail?.taggedProductId]);

  const refreshDetailAndList = useCallback(
    async (id?: string) => {
      try {
        const detailPromise = id ? productRequestsApi.get(id) : Promise.resolve(null);
        const [detailResponse] = await Promise.all([
          detailPromise,
          productRequestsApi.list({
            status: filters.status,
            requestType: filters.requestType,
            priority: filters.priority,
            search: filters.search,
            page: filters.page,
            pageSize: filters.pageSize,
          }).then((data) => {
            setList(data);
            if (!selectedId && data.items.length > 0) {
              handleSelect(data.items[0].id);
            }
            return data;
          }),
          productRequestsApi.getStats().then(setStats),
        ]);
        if (detailResponse) {
          setDetail(detailResponse);
        }
        setLastRefreshedAt(new Date());
      } catch (err: any) {
        showError('Unable to refresh requests', err?.message ?? String(err));
      }
    },
    [filters, handleSelect, selectedId, showError]
  );

  useEffect(() => {
    if (!autoRefresh) return;
    if (typeof window === 'undefined') return;

    let unsubscribe: (() => void) | null = null;
    let fallbackInterval: number | null = null;
    let didEmitInitialSnapshot = false;

    const triggerRefresh = () => {
      setRefreshKey((prev) => prev + 1);
    };

    const startFallbackInterval = () => {
      if (fallbackInterval !== null) return;
      fallbackInterval = window.setInterval(triggerRefresh, 60000);
    };

    try {
      const updatesQuery = query(collection(db, 'product_requests'), orderBy('updatedAt', 'desc'), limit(1));
      unsubscribe = onSnapshot(
        updatesQuery,
        () => {
          if (!didEmitInitialSnapshot) {
            didEmitInitialSnapshot = true;
            return;
          }
          triggerRefresh();
        },
        (err) => {
          console.warn('Realtime updates unavailable, falling back to interval polling', err);
          startFallbackInterval();
        }
      );
    } catch (err) {
      console.warn('Failed to establish realtime product request subscription', err);
      startFallbackInterval();
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      if (fallbackInterval !== null) {
        window.clearInterval(fallbackInterval);
      }
    };
  }, [autoRefresh]);

  const handleAddNote = useCallback(async () => {
    if (!selectedId || !noteDraft.trim()) return;
    setActionLoading(true);
    try {
      await productRequestsApi.addNote(selectedId, noteDraft.trim(), adminIdentity);
      success('Note added', 'Your note was saved to the request');
      setNoteDraft('');
      await refreshDetailAndList(selectedId);
    } catch (err: any) {
      showError('Failed to add note', err?.message ?? String(err));
    } finally {
      setActionLoading(false);
    }
  }, [selectedId, noteDraft, adminIdentity, refreshDetailAndList, success, showError]);

  const handleStatusChange = useCallback(
    async (nextStatus: ProductRequestStatus) => {
      if (!selectedId) return;
      setActionLoading(true);
      try {
        await productRequestsApi.update(selectedId, { status: nextStatus }, adminIdentity);
        success('Status updated', `Request marked as ${STATUS_META[nextStatus]?.label ?? nextStatus}`);
        await refreshDetailAndList(selectedId);
      } catch (err: any) {
        showError('Failed to update status', err?.message ?? String(err));
      } finally {
        setActionLoading(false);
      }
    },
    [selectedId, adminIdentity, refreshDetailAndList, success, showError]
  );

  const handleStartReview = useCallback(async () => {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      const assignment: AssignedAdmin = {
        adminId: adminIdentity?.id,
        adminName: adminIdentity?.name,
      };
      await productRequestsApi.update(selectedId, { status: 'inReview', assignedTo: assignment }, adminIdentity);
      success('Review started', 'Request assigned and moved to in-review');
      await refreshDetailAndList(selectedId);
    } catch (err: any) {
      showError('Failed to start review', err?.message ?? String(err));
    } finally {
      setActionLoading(false);
    }
  }, [selectedId, adminIdentity, refreshDetailAndList, success, showError]);

  const handlePriorityChange = useCallback(
    async (priority: string) => {
      if (!selectedId) return;
      setActionLoading(true);
      try {
        await productRequestsApi.update(selectedId, { priority }, adminIdentity);
        success('Priority updated', `Marked as ${priority}`);
        await refreshDetailAndList(selectedId);
      } catch (err: any) {
        showError('Failed to update priority', err?.message ?? String(err));
      } finally {
        setActionLoading(false);
      }
    },
    [selectedId, adminIdentity, refreshDetailAndList, success, showError]
  );

  const handleLabelAdd = useCallback(async () => {
    if (!selectedId || !labelDraft.trim()) return;
    const nextLabel = labelDraft.trim();
    if (detail?.labels?.includes(nextLabel)) {
      setLabelDraft('');
      return;
    }
    setActionLoading(true);
    try {
      const labels = [...(detail?.labels ?? []), nextLabel];
      await productRequestsApi.update(selectedId, { labels }, adminIdentity);
      success('Label added', nextLabel);
      setLabelDraft('');
      await refreshDetailAndList(selectedId);
    } catch (err: any) {
      showError('Failed to add label', err?.message ?? String(err));
    } finally {
      setActionLoading(false);
    }
  }, [selectedId, detail?.labels, labelDraft, adminIdentity, refreshDetailAndList, success, showError]);

  const handleLabelRemove = useCallback(
    async (label: string) => {
      if (!selectedId || !detail?.labels) return;
      setActionLoading(true);
      try {
        const labels = detail.labels.filter((item) => item !== label);
        await productRequestsApi.update(selectedId, { labels }, adminIdentity);
        await refreshDetailAndList(selectedId);
      } catch (err: any) {
        showError('Failed to remove label', err?.message ?? String(err));
      } finally {
        setActionLoading(false);
      }
    },
    [selectedId, detail?.labels, adminIdentity, refreshDetailAndList, showError]
  );

  const handleReject = useCallback(async () => {
    if (!selectedId) return;
    setShowRejectionModal(true);
  }, [selectedId]);

  const handleConfirmRejection = useCallback(async (reason: string) => {
    if (!selectedId) return;
    setActionLoading(true);
    setShowRejectionModal(false);
    try {
      await productRequestsApi.update(selectedId, { status: 'rejected' }, adminIdentity);
      if (reason?.trim()) {
        await productRequestsApi.addNote(selectedId, `Rejected: ${reason.trim()}`, adminIdentity);
      }
      success('Request rejected', 'Submitter will see the update');
      await refreshDetailAndList(selectedId);
    } catch (err: any) {
      showError('Failed to reject request', err?.message ?? String(err));
    } finally {
      setActionLoading(false);
    }
  }, [selectedId, adminIdentity, refreshDetailAndList, success, showError]);

  const handleCopy = useCallback((value: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      info('Copy manually', value);
      return;
    }
    navigator.clipboard.writeText(value).then(() => info('Copied', value));
  }, [info]);

  const handleCreatePendingProduct = useCallback(async () => {
    if (!selectedId || !detail) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/pending-products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: selectedId })
      });

      if (!response.ok) throw new Error('Failed to create pending product');
      
      const data = await response.json();
      if (data.success) {
        success('Added to queue', 'Product added to "Products to be Added" list');
      }
    } catch (err: any) {
      showError('Failed to add to queue', err?.message ?? String(err));
    }
  }, [selectedId, detail, success, showError]);


  const handleBulkSelectionChange = useCallback((id: string, selected: boolean) => {
    setBulkSelection((prev) => {
      const exists = prev.includes(id);
      if (selected && !exists) {
        return [...prev, id];
      }
      if (!selected && exists) {
        return prev.filter((item) => item !== id);
      }
      return prev;
    });
  }, []);

  const handleToggleSelectVisible = useCallback(() => {
    setBulkSelection((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleRequestIds.includes(id));
      }
      const merged = new Set(prev);
      visibleRequestIds.forEach((id) => merged.add(id));
      return Array.from(merged);
    });
  }, [allVisibleSelected, visibleRequestIds]);

  const clearBulkSelection = useCallback(() => setBulkSelection([]), []);

  const handleBulkAcknowledge = useCallback(async () => {
    if (bulkSelection.length === 0) return;
    setBulkActionLoading(true);
    try {
      const assignTo = bulkAssignToSelf && adminIdentity?.id
        ? { adminId: adminIdentity.id, adminName: adminIdentity.name }
        : undefined;
      const result = await productRequestsApi.bulkAcknowledge(bulkSelection, assignTo ? { assignTo } : undefined, adminIdentity);
      const failureCount = result.failed?.length ?? 0;
      const successCount = result.updated ?? Math.max(0, bulkSelection.length - failureCount);
      if (successCount > 0) {
        success('Requests acknowledged', `${successCount} moved to in-review`);
      }
      if (failureCount > 0 && result.failed && result.failed.length > 0) {
        const summary = result.failed
          .slice(0, 3)
          .map((item) => (item.reason ? `${item.id}: ${item.reason}` : item.id))
          .join('; ');
        info('Some requests skipped', summary);
      }
      setBulkSelection([]);
      await refreshDetailAndList(selectedId ?? undefined);
    } catch (err: any) {
      showError('Bulk acknowledge failed', err?.message ?? String(err));
    } finally {
      setBulkActionLoading(false);
    }
  }, [bulkSelection, bulkAssignToSelf, adminIdentity, info, refreshDetailAndList, selectedId, showError, success]);

  const selectedStatusTransitions = detail ? STATUS_TRANSITIONS[detail.status] ?? [] : [];
  const issueRows = useMemo(() => buildIssueRows(detail?.issue), [detail?.issue]);
  const detailLabels = detail?.labels ?? [];
  const formattedLastRefresh = lastRefreshedAt ? formatDate(lastRefreshedAt.toISOString()) : null;
  const photoUrls = detail?.photoUrls ?? [];
  const handleFiltersChange = useCallback((update: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...update }));
  }, []);
  const handleManualRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <>
      <PageHeader 
        title="Product Requests" 
        subtitle="Manage user submissions" 
        icon={DocumentText}
        onRefresh={handleManualRefresh} 
      />
      <div className="space-y-6">
        <PageHero
            title="Crowdsourced product requests"
            description="Handle new product suggestions, corrections, error reports, and price updates submitted from the mobile app."
            category="Product request system"
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
                <h2 className="text-sm font-semibold text-gray-800 px-1">Requests overview</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <GlassStatCard 
                    label="Pending" 
                    value={pendingCount.toLocaleString()} 
                    subtext="Queue" 
                    accent="amber" 
                    icon={Timer1} 
                  />
                  <GlassStatCard 
                    label="In review" 
                    value={reviewCount.toLocaleString()} 
                    subtext="Active" 
                    accent="violet" 
                    icon={Eye} 
                  />
                  <GlassStatCard 
                    label="Today" 
                    value={todaysCount.toLocaleString()} 
                    subtext="24h" 
                    accent="emerald" 
                    icon={Activity} 
                  />
                  <GlassStatCard 
                    label="Urgent" 
                    value={highPriorityCount.toLocaleString()} 
                    subtext="High" 
                    accent="rose" 
                    icon={Flash} 
                  />
                </div>
            </div>

            <div className="space-y-4">
                <h2 className="text-sm font-semibold text-gray-800 px-1">Request types</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <GlassStatCard 
                    label="New" 
                    value={requestTypeStats?.newProduct?.toLocaleString() ?? '0'} 
                    subtext="Add" 
                    accent="blue" 
                    icon={Add} 
                  />
                  <GlassStatCard 
                    label="Updates" 
                    value={requestTypeStats?.updateProduct?.toLocaleString() ?? '0'} 
                    subtext="Edit" 
                    accent="indigo" 
                    icon={Activity} 
                  />
                  <GlassStatCard 
                    label="Errors" 
                    value={requestTypeStats?.reportError?.toLocaleString() ?? '0'} 
                    subtext="Fix" 
                    accent="rose" 
                    icon={Warning2} 
                  />
                  <GlassStatCard 
                    label="Prices" 
                    value={requestTypeStats?.priceUpdate?.toLocaleString() ?? '0'} 
                    subtext="Cost" 
                    accent="amber" 
                    icon={Flash} 
                  />
                </div>
            </div>
        </div>

        <div className="w-full">
          <div className="w-full">
            <RequestFilters
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onRefresh={handleManualRefresh}
              autoRefresh={autoRefresh}
              onAutoRefreshChange={setAutoRefresh}
              formattedLastRefresh={formattedLastRefresh}
            />

            {/* Tab Navigation */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
            >
              <GlassSubTabs tabs={mainTabs} activeKey={activeTab} onChange={(key) => setActiveTab(key)} layoutId="mainTabs" />
            </motion.div>

            {activeTab === 'requests' ? (
              <motion.div 
                key="requests-tab"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="grid gap-4 lg:grid-cols-[1.05fr_1.5fr]"
              >
              <motion.section 
                whileHover={{ boxShadow: '0 40px 90px -40px rgba(30,41,59,0.35)' }}
                transition={{ duration: 0.3 }}
                className="rounded-[34px] border border-white/40 bg-gradient-to-br from-white/95 via-white/60 to-primary/5 shadow-[0_45px_120px_-60px_rgba(15,23,42,0.55)] backdrop-blur"
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800">Requests</h2>
                    <p className="text-xs text-gray-500">
                      {activeRequests.length} active
                      {completedRequests.length > 0 ? ` • ${completedRequests.length} completed hidden` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs text-gray-500">
                    {filters.dateRange !== 'any' && <span>Filtered by time</span>}
                    {visibleRequestIds.length > 0 && (
                      <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          checked={allVisibleSelected}
                          onChange={handleToggleSelectVisible}
                        />
                        Select visible ({visibleRequestIds.length})
                      </label>
                    )}
                    {bulkSelectedCount > 0 && (
                      <button onClick={clearBulkSelection} className="text-primary hover:underline">
                        Clear selection
                      </button>
                    )}
                  </div>
                </header>
                {bulkSelectedCount > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                    <div className="flex items-center gap-2 text-primary">
                      <Flash size={16} />
                      <span className="font-semibold">{bulkSelectedCount} selected</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          checked={bulkAssignToSelf && Boolean(adminIdentity)}
                          disabled={!adminIdentity}
                          onChange={(e) => setBulkAssignToSelf(e.target.checked)}
                        />
                        Assign to me
                      </label>
                      <button
                        onClick={handleBulkAcknowledge}
                        disabled={bulkActionLoading}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-primary/50"
                      >
                        {bulkActionLoading ? 'Processing…' : 'Acknowledge selected'}
                      </button>
                    </div>
                  </div>
                )}
                <div className="relative isolate">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/40 bg-gradient-to-b from-white/90 via-white/30 to-primary/5 opacity-80 shadow-[0_30px_80px_-35px_rgba(30,41,59,0.65)]"
                  />
                  <div aria-hidden className="pointer-events-none absolute inset-x-4 top-0 h-12 rounded-t-[32px] bg-gradient-to-b from-white via-white/80 to-transparent" />
                  <div aria-hidden className="pointer-events-none absolute inset-x-4 bottom-0 h-12 rounded-b-[32px] bg-gradient-to-t from-white via-white/80 to-transparent" />
                  <div
                    className="relative max-h-[720px] space-y-3 overflow-y-auto px-3 py-4 pr-4 [scrollbar-width:thin]"
                    style={{ scrollbarColor: 'rgba(99,102,241,0.35) transparent' }}
                  >
                    {loadingList && (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                        <span className="h-3 w-3 animate-ping rounded-full bg-primary" /> Loading requests...
                      </div>
                    )}
                    {!loadingList && displayedItems.length === 0 && (
                      <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-gray-500">
                        <Warning2 size={18} />
                        <p>{completedRequests.length > 0 ? 'All matching requests are completed. Reveal them to view history.' : 'No product requests match the current filters.'}</p>
                        {completedRequests.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowCompleted(true)}
                            className="rounded-full border border-white/60 bg-white/90 px-4 py-1.5 text-xs font-semibold text-primary shadow-sm"
                          >
                            Show completed ({completedRequests.length})
                          </button>
                        )}
                      </div>
                    )}
                    {displayedItems.map((item) => (
                      <RequestListItem
                        key={item.id}
                        item={item}
                        selected={selectedId === item.id}
                        bulkSelected={bulkSelection.includes(item.id)}
                        onSelect={handleSelect}
                        onBulkToggle={handleBulkSelectionChange}
                      />
                    ))}
                    {!showCompleted && completedRequests.length > 0 && (
                      <div className="mt-4 rounded-2xl border border-white/50 bg-white/70 px-4 py-3 text-xs text-slate-600 shadow-inner">
                        Completed requests hidden.{' '}
                        <button type="button" onClick={() => setShowCompleted(true)} className="font-semibold text-primary">
                          Show all {completedRequests.length}
                        </button>
                      </div>
                    )}
                    {showCompleted && completedRequests.length > 0 && (
                      <div className="mt-5 space-y-3 rounded-[26px] border border-emerald-100 bg-emerald-50/70 p-4 text-xs text-emerald-700">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold uppercase tracking-wide">Completed requests</p>
                          <button type="button" onClick={() => setShowCompleted(false)} className="text-emerald-600 underline">
                            Hide
                          </button>
                        </div>
                        {completedRequests.map((item) => (
                          <RequestListItem
                            key={`completed-${item.id}`}
                            item={item}
                            selected={selectedId === item.id}
                            bulkSelected={bulkSelection.includes(item.id)}
                            onSelect={handleSelect}
                            onBulkToggle={handleBulkSelectionChange}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.section>

              <motion.section 
                whileHover={{ boxShadow: '0 40px 90px -40px rgba(30,41,59,0.35)' }}
                transition={{ duration: 0.3 }}
                className="flex min-h-[700px] flex-col rounded-[34px] border border-white/40 bg-gradient-to-br from-white/95 via-white/60 to-primary/5 shadow-[0_45px_120px_-60px_rgba(15,23,42,0.55)] backdrop-blur"
              >
              {loadingDetail && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-sm text-gray-500">Loading request...</p>
                </div>
              )}
              {!loadingDetail && !detail && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-gray-500">
                  <DocumentText size={24} /> Select a request to inspect details
                </div>
              )}
              {!loadingDetail && detail && (
                <div className="flex flex-1 flex-col">
                  <RequestDetailHeader
                    detail={detail}
                    actionLoading={actionLoading}
                    onPriorityChange={handlePriorityChange}
                    onStartReview={handleStartReview}
                    onReject={handleReject}
                    onStatusChange={handleStatusChange}
                    statusTransitions={selectedStatusTransitions}
                    onCopyId={handleCopy}
                    onCreatePending={handleCreatePendingProduct}
                  />

                  <div className="flex-1 space-y-6 overflow-auto px-5 py-5">
                    <div className="space-y-4">
                      <GlassSubTabs
                        tabs={detailSubTabs}
                        activeKey={detailTab}
                        onChange={setDetailTab}
                        layoutId="detailSubTabs"
                        className="rounded-3xl border border-white/40 bg-white/80 p-3 shadow-inner shadow-slate-200/70"
                        columnsClassName="sm:grid-cols-3"
                      />

                      <div className="rounded-[32px] border border-white/40 bg-gradient-to-br from-white/95 via-slate-50/70 to-primary/5 p-5 shadow-[0_45px_120px_-60px_rgba(15,23,42,0.65)] backdrop-blur">
                        <AnimatePresence mode="wait">
                          {detailTab === 'overview' && (
                            <motion.div
                              key="detail-overview"
                              initial={{ opacity: 0, y: 16 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -16 }}
                              transition={{ duration: 0.25 }}
                              className="space-y-5"
                            >
                              <RequesterSection
                                requester={detailRequester}
                                submittedById={typeof detail.submittedBy?.id === 'string' ? detail.submittedBy.id : undefined}
                              />
                              <ProductInfoSection
                                detail={detail}
                                linkedProduct={linkedProduct}
                                linkedProductLoading={linkedProductLoading}
                                onCopyTaggedId={handleCopy}
                                onUpdateProduct={setProductUpdateModal}
                              />
                              <IssueDetails issue={detail.issue} issueRows={issueRows} />

                              {(detail.taggedProductId || detail.requestType !== 'newProduct') && (
                                <section className="rounded-[26px] border border-white/40 bg-white/85 p-5 shadow-inner shadow-primary/10">
                                  <div className="flex flex-col gap-1">
                                    <h3 className="text-sm font-semibold text-slate-900">Quick product search</h3>
                                    <p className="text-xs text-slate-500">Verify catalog presence before responding</p>
                                  </div>
                                  <div className="mt-3">
                                    <ProductDatabaseSearchEnhanced
                                      taggedProductId={detail.taggedProductId || linkedProduct?.id}
                                      productName={linkedProduct?.name || detail.productName}
                                      brand={linkedProduct?.brand_name || detail.brand}
                                      onUpdateProduct={(productId) => setProductUpdateModal(productId)}
                                    />
                                  </div>
                                </section>
                              )}

                              <LabelsSection
                                labels={detailLabels}
                                labelDraft={labelDraft}
                                onLabelDraftChange={setLabelDraft}
                                onAddLabel={handleLabelAdd}
                                onRemoveLabel={handleLabelRemove}
                                actionLoading={actionLoading}
                              />
                            </motion.div>
                          )}
                          {detailTab === 'media' && (
                            <motion.div
                              key="detail-media"
                              initial={{ opacity: 0, y: 16 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -16 }}
                              transition={{ duration: 0.25 }}
                              className="space-y-5"
                            >
                              <PhotoGallery photoUrls={photoUrls} requestId={detail.id} />
                              {photoUrls.length === 0 && (
                                <div className="rounded-[26px] border border-dashed border-white/50 bg-white/70 p-5 text-sm text-slate-500">
                                  No media attached yet. Encourage requesters to upload photos so the catalog team can verify details faster.
                                </div>
                              )}
                            </motion.div>
                          )}
                          {detailTab === 'activity' && (
                            <motion.div
                              key="detail-activity"
                              initial={{ opacity: 0, y: 16 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -16 }}
                              transition={{ duration: 0.25 }}
                              className="space-y-5"
                            >
                              <AdminNotesSection
                                notes={detail.adminNotes}
                                noteDraft={noteDraft}
                                onNoteDraftChange={setNoteDraft}
                                onAddNote={handleAddNote}
                                actionLoading={actionLoading}
                                productName={detail.productName}
                                requestType={detail.requestType}
                              />
                              <ActivityTimeline activity={detail.activity} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </motion.section>
            </motion.div>
            ) : (
              <motion.div
                key="pending-tab"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="rounded-b-xl bg-white shadow-sm"
              >
                <PendingProductsSection />
              </motion.div>
            )}
          </div>

        </div>
        
        {/* Product Update Modal */}
        <AnimatePresence>
          {productUpdateModal && (
            <ProductUpdateModal
              productId={productUpdateModal}
              onClose={() => setProductUpdateModal(null)}
              onSuccess={() => {
                setRefreshKey((prev) => prev + 1);
              }}
            />
          )}
        </AnimatePresence>

        {/* Rejection Modal */}
        {showRejectionModal && detail && (
          <RejectionModal
            productName={detail.productName}
            requestType={detail.requestType}
            onConfirm={handleConfirmRejection}
            onCancel={() => setShowRejectionModal(false)}
          />
        )}
      </div>
    </>
  );
}
