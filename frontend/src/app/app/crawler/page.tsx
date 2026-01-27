"use client"

import PageNavbar, { PageNavbarIconButton, PageNavbarLeftContent, PageNavbarPrimaryButton, PageNavbarRightContent } from '@/components/layout/PageNavbar'
import { Add, CalendarEdit, DirectNotification, Notification, SearchNormal1, Setting4, Activity, Play, Stop, Refresh, Trash, DocumentText1, Timer1, ArrowUp2, Eye, FolderOpen } from 'iconsax-react'
import PageContent from '@/components/layout/PageContent'
import CrawlerCard from '@/components/crawler/CrawlerCard'
import AutomationScheduleRail from '@/components/crawler/AutomationScheduleRail'
import { OutlineButton } from '@/components/ui/Button'
import FileViewerModal from '@/components/files/FileViewerModal'
import SmartFileManager from '@/components/files/SmartFileManager'
import { useGlobalToast } from '@/contexts/ToastContext'
import { useState, useEffect, useCallback, useRef, useMemo, type ElementType, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { crawlerAPI } from '@/lib/api'
import { SQLiteDB } from '@/lib/database'
import type { CrawlerSchedule, LimitMode, ScheduleBatchMode, ScheduleSelectionMode, ScheduleType } from '@/types/crawler'
import { motion, AnimatePresence } from 'framer-motion'

import StatCard from '@/components/crawler/StatCard';
import CrawlerTabs from '@/components/crawler/CrawlerTabs';
import ActiveCrawlersSection from '@/components/crawler/ActiveCrawlersSection';
import GroupLaunchControls from '@/components/crawler/GroupLaunchControls';
import StoreCrawlersSection from '@/components/crawler/StoreCrawlersSection';
import { formatNumber } from '@/utils/format';
import { PageHero } from '@/components/shared/PageHero';
import { PageHeader } from '@/components/layout/PageHeader';
import { 
    COMMON_TIMEZONES, 
    CRAWLER_TABS, 
    STORE_STYLES, 
    STATUS_STYLES, 
    DASHBOARD_CACHE_KEY, 
    DASHBOARD_CACHE_TTL, 
    MIN_SCHEDULE_INTERVAL_MINUTES, 
    DEFAULT_MAX_ITEMS, 
    ACTIVE_REFRESH_INTERVAL_MS, 
    IDLE_REFRESH_INTERVAL_MS, 
    BACKGROUND_REFRESH_INTERVAL_MS, 
    FAILURE_BACKOFF_STEP_MS, 
    FAILURE_BACKOFF_MAX_MS, 
    LIMIT_MODE_OPTIONS,
    DEFAULT_CRAWLER_STATUS
} from './constants';
import { 
    GroupControlState, 
    SelectionPreset, 
    CadencePreset, 
    ScheduleFormState, 
    DashboardSnapshot, 
    StatCard as StatCardType, 
    CrawlerTab, 
    TabDefinition 
} from './types';
import { CrawlerStatus, CrawlerSpec, CrawlerInfo } from '@/types/crawler';

// Interfaces and types moved to ./types.ts and @/types/crawler.ts


// Constants moved to ./constants.ts
const getStoreStyle = (store: string) => STORE_STYLES[store] ?? STORE_STYLES.default;

const getStatusStyle = (status: string) => STATUS_STYLES[status] ?? STATUS_STYLES.inactive;


// Constants moved to ./constants.ts


function WebCrawler() {
    const { success, error: showError, warning, info, confirm } = useGlobalToast();
    const router = useRouter();


    const [crawlerStatus, setCrawlerStatus] = useState<CrawlerStatus>({
        available: false,
        active_crawlers: 0,
        total_available: 0
    });
    // Limit controls state
    const [crawlerLimits, setCrawlerLimits] = useState<{ [key: string]: { max?: number; crawlAll?: boolean; headless?: boolean } }>({});
    const [globalMaxItems, setGlobalMaxItems] = useState<string>('');
    const [globalCrawlAll, setGlobalCrawlAll] = useState<boolean>(false);
    const [globalHeadlessMode, setGlobalHeadlessMode] = useState<boolean>(false);
    const [rememberLimits, setRememberLimits] = useState<boolean>(false);

    // Load remembered limits on mount
    useEffect(() => {
        try {
            const remember = localStorage.getItem('crawlerRememberLimits');
            if (remember) setRememberLimits(remember === 'true');
            const savedLimits = localStorage.getItem('crawlerLimits');
            if (savedLimits) setCrawlerLimits(JSON.parse(savedLimits));
            const savedGlobalMax = localStorage.getItem('crawlerGlobalMaxItems');
            if (savedGlobalMax !== null) setGlobalMaxItems(savedGlobalMax);
            const savedGlobalAll = localStorage.getItem('crawlerGlobalCrawlAll');
            if (savedGlobalAll !== null) setGlobalCrawlAll(savedGlobalAll === 'true');
            const savedGlobalHeadless = localStorage.getItem('crawlerGlobalHeadlessMode');
            if (savedGlobalHeadless !== null) setGlobalHeadlessMode(savedGlobalHeadless === 'true');
        } catch (e) {
            console.warn('Failed to load saved crawler limits', e);
        }
    }, []);

    // Persist limits when changed and remember is on
    useEffect(() => {
        if (!rememberLimits) return;
        try {
            localStorage.setItem('crawlerLimits', JSON.stringify(crawlerLimits));
            localStorage.setItem('crawlerGlobalMaxItems', globalMaxItems);
            localStorage.setItem('crawlerGlobalCrawlAll', String(globalCrawlAll));
            localStorage.setItem('crawlerGlobalHeadlessMode', String(globalHeadlessMode));
            localStorage.setItem('crawlerRememberLimits', 'true');
        } catch (e) {
            console.warn('Failed to persist crawler limits', e);
        }
    }, [crawlerLimits, globalMaxItems, globalCrawlAll, globalHeadlessMode, rememberLimits]);

    const [availableCrawlers, setAvailableCrawlers] = useState<Record<string, any>>({});
    const [activeCrawlers, setActiveCrawlers] = useState<{[key: string]: CrawlerInfo}>({});
    const [recentActivity, setRecentActivity] = useState<any[]>([]);
    const [savedRecentActivity, setSavedRecentActivity] = useState<any[]>([]);
    const [crawlerResults, setCrawlerResults] = useState<{[key: string]: any}>({});
    const [outputFiles, setOutputFiles] = useState<{[key: string]: string[]}>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [autoRefreshing, setAutoRefreshing] = useState(false);
    const [pauseAutoRefresh, setPauseAutoRefresh] = useState(false);
    const [isDocumentVisible, setIsDocumentVisible] = useState(true);
    const documentVisibilityRef = useRef(isDocumentVisible);
    const pauseAutoRefreshRef = useRef(pauseAutoRefresh);
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (typeof document === 'undefined') return;
            setIsDocumentVisible(document.visibilityState !== 'hidden');
        };

        handleVisibilityChange();
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);
    useEffect(() => {
        documentVisibilityRef.current = isDocumentVisible;
    }, [isDocumentVisible]);
    useEffect(() => {
        pauseAutoRefreshRef.current = pauseAutoRefresh;
    }, [pauseAutoRefresh]);
    const refreshDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [activeTab, setActiveTab] = useState<CrawlerTab>('monitor');
    
    // Results filter state
    const [resultsFilter, setResultsFilter] = useState<{
        store: string;
        category: string;
        minItems: string;
        maxItems: string;
        dateFrom: string;
        dateTo: string;
    }>({
        store: '',
        category: '',
        minItems: '',
        maxItems: '',
        dateFrom: '',
        dateTo: ''
    });
    
    // File viewer modal state
    const [fileViewModal, setFileViewModal] = useState<{
        open: boolean;
        store: string;
        filename: string;
        content: any;
    }>({
        open: false,
        store: '',
        filename: '',
        content: null
    });

    // Dynamic crawler list - will be populated from backend
    const [allCrawlers, setAllCrawlers] = useState<CrawlerInfo[]>([]);
    const [startingAll, setStartingAll] = useState(false);
    const [startBatchMode, setStartBatchMode] = useState<ScheduleBatchMode>('parallel');
    const [groupLaunching, setGroupLaunching] = useState<string | null>(null);
    const [categoryLaunching, setCategoryLaunching] = useState<string | null>(null);

    const previousCrawlerStatesRef = useRef<{[key: string]: string}>({});
    const lastStatusSnapshotRef = useRef<CrawlerStatus | null>(null);
    const autoRefreshMetaRef = useRef<{ nextIntervalMs: number; failureCount: number }>({
        nextIntervalMs: IDLE_REFRESH_INTERVAL_MS,
        failureCount: 0
    });

    // Firebase file management state
    const [firebaseFiles, setFirebaseFiles] = useState<any[]>([]);
    const [firebaseLoading, setFirebaseLoading] = useState(false);

    // Concurrent crawlers setting
    const [maxConcurrentCrawlers, setMaxConcurrentCrawlers] = useState<number>(4);
    const [showConcurrencySettings, setShowConcurrencySettings] = useState(false);
    const [updatingConcurrency, setUpdatingConcurrency] = useState(false);

    const browserTimezone = useMemo(() => {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        } catch {
            return 'UTC';
        }
    }, []);

    const timezoneOptions = useMemo(() => {
        const pool = browserTimezone ? [browserTimezone, ...COMMON_TIMEZONES] : COMMON_TIMEZONES;
        return Array.from(new Set(pool));
    }, [browserTimezone]);

    const toDateTimeLocalValue = useCallback((iso: string) => {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '';
        const pad = (value: number) => value.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }, []);

    const cadencePresets = useMemo<CadencePreset[]>(() => {
        const soon = new Date(Date.now() + 2 * 60 * 60 * 1000);
        const soonLocal = toDateTimeLocalValue(soon.toISOString());
        return [
            {
                key: 'sunrise-sweep',
                label: 'Sunrise sweep',
                hint: 'Daily @ 06:00 in your timezone',
                type: 'daily',
                dailyTime: '06:00',
                timezone: browserTimezone,
            },
            {
                key: 'lunch-check',
                label: 'Lunch check-in',
                hint: 'Daily @ 12:30',
                type: 'daily',
                dailyTime: '12:30',
                timezone: browserTimezone,
            },
            {
                key: 'weekday-commute',
                label: 'Weekday mornings',
                hint: 'Mon–Fri @ 08:00',
                type: 'weekly',
                dailyTime: '08:00',
                weeklyDays: [0, 1, 2, 3, 4],
                timezone: browserTimezone,
            },
            {
                key: 'four-hour-watch',
                label: '4-hour pulse',
                hint: 'Interval every 4 hours',
                type: 'interval',
                intervalMinutes: String(MIN_SCHEDULE_INTERVAL_MINUTES),
                timezone: browserTimezone,
            },
            {
                key: 'tonight-only',
                label: 'Tonight only',
                hint: 'One-off run later today',
                type: 'one_time',
                oneTimeLocal: soonLocal,
                timezone: browserTimezone,
            },
        ];
    }, [browserTimezone, toDateTimeLocalValue]);

    const createScheduleDefaults = useCallback((): ScheduleFormState => ({
        name: '',
        description: '',
        enabled: true,
        selectionMode: 'all',
        store: 'keells',
        category: 'vegetables',
        selectedCategories: [],
        selectedStores: [],
        batchMode: 'parallel',
        maxItems: '',
        limitMode: 'default',
        headless: false,
        scheduleType: 'daily',
        oneTimeLocal: '',
        dailyTime: '06:00',
        timezone: browserTimezone,
        weeklyDays: [0],
        intervalMinutes: String(MIN_SCHEDULE_INTERVAL_MINUTES),
    }), [browserTimezone]);

    const WEEKDAY_LABELS = useMemo(() => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], []);

    const [schedules, setSchedules] = useState<CrawlerSchedule[]>([]);
    const [schedulesLoading, setSchedulesLoading] = useState(false);
    const [schedulerAvailable, setSchedulerAvailable] = useState(true);
    const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() => createScheduleDefaults());
    const [scheduleSaving, setScheduleSaving] = useState(false);
    const [scheduleError, setScheduleError] = useState<string | null>(null);
    const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
    const [scheduleExpanded, setScheduleExpanded] = useState(false);
    const [activeTargetPreset, setActiveTargetPreset] = useState<string | null>(null);
    const [activeCadencePreset, setActiveCadencePreset] = useState<string | null>(null);

    const loadSchedules = useCallback(async (options?: { silent?: boolean }) => {
        const silent = Boolean(options?.silent);
        if (!silent) {
            setSchedulesLoading(true);
        }
        setScheduleError(null);
        try {
            const response = await crawlerAPI.listSchedules();
            const newSchedules = response?.schedules ?? [];
            setSchedules(prev => JSON.stringify(prev) === JSON.stringify(newSchedules) ? prev : newSchedules);
            setSchedulerAvailable(true);
        } catch (error: any) {
            console.error('Failed to load schedules:', error);
            const status = (error as any)?.status;
            if (status === 503) {
                setSchedulerAvailable(false);
                setSchedules([]);
                setScheduleError(null);
            } else {
                const message = error instanceof Error ? error.message : 'Failed to load schedules';
                setScheduleError(message);
                setSchedulerAvailable(true);
            }
        } finally {
            if (!silent) {
                setSchedulesLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        void loadSchedules();
    }, [loadSchedules]);

    const availableCategoriesByStore = useMemo<Record<string, Set<string>>>(() => {
        const map: Record<string, Set<string>> = {};
        allCrawlers.forEach(crawler => {
            const store = crawler.store;
            if (!map[store]) {
                map[store] = new Set();
            }
            map[store].add(crawler.category);
        });
        return map;
    }, [allCrawlers]);

    const allCategoryList = useMemo(() => {
        const categorySet = new Set(allCrawlers.map(crawler => crawler.category));
        return Array.from(categorySet).sort();
    }, [allCrawlers]);

    const uniqueStores = useMemo(() => {
        const storeSet = new Set(allCrawlers.map(crawler => crawler.store));
        return Array.from(storeSet).sort();
    }, [allCrawlers]);

    const getUniqueStores = useCallback(() => uniqueStores, [uniqueStores]);

    const getUniqueCategories = useCallback((stores?: string | string[]) => {
        if (!stores) {
            return allCategoryList;
        }
        const storeList = Array.isArray(stores) ? stores.filter(Boolean) : [stores].filter(Boolean);
        if (storeList.length === 0) {
            return allCategoryList;
        }
        const categorySet = new Set<string>();
        storeList.forEach(store => {
            const available = availableCategoriesByStore[store];
            if (available) {
                available.forEach(category => categorySet.add(category));
            }
        });
        return categorySet.size > 0 ? Array.from(categorySet).sort() : allCategoryList;
    }, [allCategoryList, availableCategoriesByStore]);

    const updateScheduleForm = useCallback((updates: Partial<ScheduleFormState>) => {
        setScheduleForm(prev => ({ ...prev, ...updates }));
    }, []);

    const resetScheduleForm = useCallback(() => {
        setScheduleForm(createScheduleDefaults());
        setSelectedScheduleId(null);
        setScheduleError(null);
        setActiveTargetPreset(null);
        setActiveCadencePreset(null);
    }, [createScheduleDefaults]);

    const toggleScheduleStore = useCallback((store: string) => {
        setActiveTargetPreset(null);
        setScheduleForm(prev => {
            const exists = prev.selectedStores.includes(store);
            const selectedStores = exists
                ? prev.selectedStores.filter(value => value !== store)
                : [...prev.selectedStores, store];

            if (selectedStores.length === 0 || Object.keys(availableCategoriesByStore).length === 0) {
                return { ...prev, selectedStores };
            }

            const validCategories = new Set<string>();
            selectedStores.forEach(value => {
                const available = availableCategoriesByStore[value];
                if (available) {
                    available.forEach(category => validCategories.add(category));
                }
            });

            const filteredCategories = prev.selectedCategories.filter(category => validCategories.has(category));

            return { ...prev, selectedStores, selectedCategories: filteredCategories };
        });
    }, [availableCategoriesByStore]);

    const toggleScheduleCategory = useCallback((category: string) => {
        setActiveTargetPreset(null);
        setScheduleForm(prev => {
            const exists = prev.selectedCategories.includes(category);
            const selectedCategories = exists
                ? prev.selectedCategories.filter(value => value !== category)
                : [...prev.selectedCategories, category];
            return { ...prev, selectedCategories };
        });
    }, []);

    const toggleScheduleWeekday = useCallback((day: number) => {
        setActiveCadencePreset(null);
        setScheduleForm(prev => {
            const exists = prev.weeklyDays.includes(day);
            const next = exists
                ? prev.weeklyDays.filter(value => value !== day)
                : [...prev.weeklyDays, day];
            return { ...prev, weeklyDays: next.sort((a, b) => a - b) };
        });
    }, []);

    const setScheduleLimitMode = useCallback((mode: LimitMode) => {
        setScheduleForm(prev => {
            const nextMax = mode === 'custom'
                ? (prev.maxItems && prev.maxItems.trim().length > 0 ? prev.maxItems : String(DEFAULT_MAX_ITEMS))
                : '';
            return {
                ...prev,
                limitMode: mode,
                maxItems: nextMax,
            };
        });
    }, []);

    const setSelectionMode = useCallback((mode: ScheduleSelectionMode) => {
        setActiveTargetPreset(null);
        setScheduleForm(prev => {
            if (mode === 'all') {
                return {
                    ...prev,
                    selectionMode: mode,
                    selectedStores: [],
                    selectedCategories: [],
                };
            }

            if (mode === 'store' && prev.selectedStores.length > 0) {
                const validCategories = new Set(getUniqueCategories(prev.selectedStores));
                const nextCategories = prev.selectedCategories.filter(category => validCategories.has(category));
                return {
                    ...prev,
                    selectionMode: mode,
                    selectedCategories: nextCategories,
                };
            }

            return {
                ...prev,
                selectionMode: mode,
            };
        });
    }, [getUniqueCategories]);

    const setScheduleType = useCallback((type: ScheduleType) => {
        setActiveCadencePreset(null);
        setScheduleForm(prev => {
            if (type === prev.scheduleType) {
                return prev;
            }
            if (type === 'weekly' && prev.weeklyDays.length === 0) {
                return { ...prev, scheduleType: type, weeklyDays: [0] };
            }
            if (type === 'interval' && (!prev.intervalMinutes || Number(prev.intervalMinutes) <= 0)) {
                return { ...prev, scheduleType: type, intervalMinutes: '120' };
            }
            return { ...prev, scheduleType: type };
        });
    }, []);

    const applySelectionPreset = useCallback((preset: SelectionPreset) => {
        setActiveTargetPreset(preset.key);
        setScheduleForm(prev => {
            const nextStores = preset.stores
                ? [...preset.stores]
                : preset.mode === 'all'
                    ? []
                    : preset.mode === 'category'
                        ? []
                        : prev.selectedStores;
            const nextCategories = preset.categories
                ? [...preset.categories]
                : preset.mode === 'all'
                    ? []
                    : preset.mode === 'store'
                        ? []
                        : prev.selectedCategories;
            return {
                ...prev,
                selectionMode: preset.mode,
                selectedStores: nextStores,
                selectedCategories: nextCategories,
            };
        });
    }, []);

    const applyCadencePreset = useCallback((preset: CadencePreset) => {
        setActiveCadencePreset(preset.key);
        setScheduleForm(prev => ({
            ...prev,
            scheduleType: preset.type,
            dailyTime: preset.dailyTime ?? prev.dailyTime,
            weeklyDays: preset.type === 'weekly'
                ? (preset.weeklyDays && preset.weeklyDays.length > 0 ? preset.weeklyDays : prev.weeklyDays.length > 0 ? prev.weeklyDays : [0])
                : prev.weeklyDays,
            intervalMinutes: preset.type === 'interval'
                ? (preset.intervalMinutes ?? prev.intervalMinutes ?? '60')
                : prev.intervalMinutes,
            oneTimeLocal: preset.type === 'one_time'
                ? (preset.oneTimeLocal ?? prev.oneTimeLocal)
                : prev.oneTimeLocal,
            timezone: preset.timezone ?? prev.timezone,
        }));
    }, []);

    const updateCadenceField = useCallback((updates: Partial<ScheduleFormState>) => {
        setActiveCadencePreset(null);
        updateScheduleForm(updates);
    }, [updateScheduleForm]);

    const formatDateTime = (value?: string | null) => {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };

    const formatIntervalPhrase = (minutesRaw: any) => {
        const minutes = Number(minutesRaw);
        if (!Number.isFinite(minutes) || minutes <= 0) {
            return `${minutesRaw ?? '?'} minutes`;
        }
        const days = Math.floor(minutes / 1440);
        const hours = Math.floor((minutes % 1440) / 60);
        const mins = Math.floor(minutes % 60);
        const parts: string[] = [];
        if (days) {
            parts.push(`${days} day${days === 1 ? '' : 's'}`);
        }
        if (hours) {
            parts.push(`${hours}h`);
        }
        if (mins && parts.length < 2) {
            parts.push(`${mins}m`);
        }
        return parts.length > 0 ? parts.join(' ') : `${minutes}m`;
    };

    const describeSelection = (schedule: CrawlerSchedule) => {
        const selection = schedule.selection || {};
        const mode = (selection.mode || 'all') as string;
        if (mode === 'all') {
            return 'All crawlers';
        }
        if (mode === 'store') {
            const stores = Array.isArray(selection.stores) && selection.stores.length > 0
                ? selection.stores.join(', ')
                : 'All stores';
            const categories = Array.isArray(selection.categories) && selection.categories.length > 0
                ? selection.categories.join(', ')
                : 'All categories';
            return `Stores: ${stores} • Categories: ${categories}`;
        }
        if (mode === 'category') {
            const categories = Array.isArray(selection.categories) && selection.categories.length > 0
                ? selection.categories.join(', ')
                : 'All categories';
            const stores = Array.isArray(selection.stores) && selection.stores.length > 0
                ? selection.stores.join(', ')
                : 'All stores';
            return `Categories: ${categories} • Stores: ${stores}`;
        }
        if (mode === 'explicit') {
            const crawlers = Array.isArray(selection.crawlers) ? selection.crawlers.length : 0;
            return `Explicit list (${crawlers} crawlers)`;
        }
        return 'Custom selection';
    };

    const describeTiming = (schedule: CrawlerSchedule) => {
        const config = schedule.schedule || {};
        const type = (config.type || 'one_time') as ScheduleType;
        if (type === 'one_time') {
            return `One-time at ${formatDateTime(config.run_at)}`;
        }
        if (type === 'daily') {
            return `Daily at ${config.time_of_day || '00:00'} (${config.timezone || 'UTC'})`;
        }
        if (type === 'weekly') {
            const days = Array.isArray(config.days_of_week)
                ? config.days_of_week.map((day: any) => WEEKDAY_LABELS[Number(day) % 7] || String(day)).join(', ')
                : 'Weekly';
            return `Weekly on ${days} at ${config.time_of_day || '00:00'} (${config.timezone || 'UTC'})`;
        }
        if (type === 'interval') {
            const intervalMinutes = Number(config.interval_minutes) || MIN_SCHEDULE_INTERVAL_MINUTES;
            return `Every ${formatIntervalPhrase(intervalMinutes)}`;
        }
        return 'Custom cadence';
    };

    const findResultKeyForActivity = (activity: any) => {
        if (!activity || !activity.store) {
            return undefined;
        }
        const rawCategory = typeof activity.category === 'string' ? activity.category : '';
        const categoryVariants = Array.from(new Set([
            rawCategory,
            rawCategory ? `${rawCategory}s` : '',
            rawCategory ? rawCategory.replace(/s$/, '') : '',
            rawCategory ? rawCategory.replace(/_/g, '') : ''
        ].filter(Boolean)));

        if (categoryVariants.length === 0) {
            categoryVariants.push('');
        }

        return Object.keys(crawlerResults).find(key =>
            categoryVariants.some(variant => key.startsWith(`${activity.store}_${variant}`))
        );
    };

    const removeRecentActivity = async (activity: any) => {
        try {
            const confirmed = await confirm(
                'Remove Activity',
                `Remove ${activity.store} ${activity.category} from recent activities?`
            );

            if (!confirmed) return;

            const now = new Date().toISOString();
            const activityTimestamp = activity.timestamp || activity.completed_at;
            const activityToInsert = {
                id: generateActivityId(activity.store, activity.category, activity.crawler_id, activityTimestamp),
                store: activity.store,
                category: activity.category,
                crawler_id: activity.crawler_id || '',
                original_timestamp: activityTimestamp || now,
                cleared_at: now
            };

            await SQLiteDB.insertClearedActivity(activityToInsert);
            await SQLiteDB.cleanupOldClearedActivities(50);

            const allCleared = await SQLiteDB.getAllClearedActivities();
            setSavedRecentActivity(allCleared);

            setRecentActivity(prev => prev.filter(item =>
                !(item.store === activity.store && item.category === activity.category)
            ));

            success('Removed', `${activity.store} ${activity.category} removed from recent activities`);
        } catch (error) {
            console.error('Error removing activity:', error);
            showError('Remove Failed', 'Failed to remove activity. Please try again.');
        }
    };

    const buildSelectionPayload = useCallback((form: ScheduleFormState) => {
        if (form.selectionMode === 'all') {
            return { mode: 'all' };
        }
        if (form.selectionMode === 'store') {
            const payload: Record<string, any> = { mode: 'store' };
            const stores = form.selectedStores.length > 0 ? form.selectedStores : (form.store ? [form.store] : []);
            const knownStores = Object.keys(availableCategoriesByStore);
            const scopeStores = stores.length > 0 ? stores : knownStores;
            const allowedCategories = new Set<string>();
            if (scopeStores.length > 0) {
                scopeStores.forEach(store => {
                    const available = availableCategoriesByStore[store];
                    if (available) {
                        available.forEach(category => allowedCategories.add(category));
                    }
                });
            }
            const selectedCategories = form.selectedCategories.length > 0 ? form.selectedCategories : [];
            const categories = allowedCategories.size > 0
                ? selectedCategories.filter(category => allowedCategories.has(category))
                : selectedCategories;
            if (stores.length > 0) payload.stores = stores;
            if (categories.length > 0) payload.categories = categories;
            return payload;
        }
        if (form.selectionMode === 'category') {
            const payload: Record<string, any> = { mode: 'category' };
            const categories = form.selectedCategories.length > 0 ? form.selectedCategories : (form.category ? [form.category] : []);
            const stores = form.selectedStores.length > 0 ? form.selectedStores : [];
            if (categories.length > 0) payload.categories = categories;
            if (stores.length > 0) payload.stores = stores;
            return payload;
        }
        return { mode: form.selectionMode };
    }, [availableCategoriesByStore]);

    const resolveSelectionSpecs = useCallback((form: ScheduleFormState): CrawlerSpec[] => {
        const specs: CrawlerSpec[] = [];
        const availableStores = Object.keys(availableCategoriesByStore);
        if (availableStores.length === 0) {
            return specs;
        }

        const addStores = (stores: string[], categories?: string[]) => {
            const categoryFilter = categories && categories.length > 0 ? new Set(categories) : null;
            stores.forEach(store => {
                const available = availableCategoriesByStore[store];
                if (!available || available.size === 0) return;
                available.forEach(category => {
                    if (!categoryFilter || categoryFilter.has(category)) {
                        specs.push({ store, category });
                    }
                });
            });
        };

        switch (form.selectionMode) {
            case 'all':
                addStores(availableStores);
                break;
            case 'store': {
                const stores = form.selectedStores.length > 0
                    ? form.selectedStores
                    : (form.store ? [form.store] : availableStores);
                const categories = form.selectedCategories.length > 0 ? form.selectedCategories : undefined;
                addStores(stores, categories);
                break;
            }
            case 'category': {
                const stores = form.selectedStores.length > 0 ? form.selectedStores : availableStores;
                const categories = form.selectedCategories.length > 0
                    ? form.selectedCategories
                    : (form.category ? [form.category] : undefined);
                if (!categories) {
                    addStores(stores);
                } else {
                    const categorySet = new Set(categories);
                    stores.forEach(store => {
                        const available = availableCategoriesByStore[store];
                        if (!available) return;
                        available.forEach(category => {
                            if (categorySet.has(category)) {
                                specs.push({ store, category });
                            }
                        });
                    });
                }
                break;
            }
            default:
                break;
        }

        return specs;
    }, [availableCategoriesByStore]);

    const buildScheduleConfig = useCallback((form: ScheduleFormState) => {
        if (form.scheduleType === 'one_time') {
            return {
                type: 'one_time',
                run_at: new Date(form.oneTimeLocal).toISOString(),
                timezone: form.timezone,
            };
        }
        if (form.scheduleType === 'daily') {
            return {
                type: 'daily',
                time_of_day: form.dailyTime,
                timezone: form.timezone,
            };
        }
        if (form.scheduleType === 'weekly') {
            return {
                type: 'weekly',
                time_of_day: form.dailyTime,
                timezone: form.timezone,
                days_of_week: form.weeklyDays,
            };
        }
        if (form.scheduleType === 'interval') {
            return {
                type: 'interval',
                interval_minutes: Math.max(1, Number(form.intervalMinutes) || 0),
            };
        }
        return {};
    }, []);

    const validateScheduleForm = useCallback((form: ScheduleFormState) => {
        if (!form.name.trim()) {
            return 'Please give this schedule a name.';
        }
        if (form.scheduleType === 'one_time') {
            if (!form.oneTimeLocal) return 'Choose a date and time for the one-time run.';
            if (Number.isNaN(new Date(form.oneTimeLocal).getTime())) {
                return 'The chosen start time is not valid.';
            }
        }
        if ((form.scheduleType === 'daily' || form.scheduleType === 'weekly') && !form.dailyTime) {
            return 'Select a time of day for this schedule.';
        }
        if (form.scheduleType === 'weekly' && form.weeklyDays.length === 0) {
            return 'Pick at least one weekday for the weekly schedule.';
        }
        if (form.scheduleType === 'interval') {
            const interval = Number(form.intervalMinutes);
            if (!Number.isFinite(interval) || interval <= 0) {
                return 'Interval minutes must be greater than zero.';
            }
            if (interval < MIN_SCHEDULE_INTERVAL_MINUTES) {
                return `Interval schedules must be at least ${MIN_SCHEDULE_INTERVAL_MINUTES} minutes apart (≈${Math.floor(MIN_SCHEDULE_INTERVAL_MINUTES / 60)} hours).`;
            }
        }
        if (form.limitMode === 'custom') {
            const trimmed = form.maxItems.trim();
            const parsed = Number(trimmed);
            if (!trimmed || !Number.isFinite(parsed) || parsed <= 0) {
                return 'Provide a positive max items value when using a custom limit.';
            }
        }
        if (Object.keys(availableCategoriesByStore).length > 0) {
            const specs = resolveSelectionSpecs(form);
            if (specs.length === 0) {
                return 'No crawler targets match the selected stores or categories. Adjust your selection.';
            }
        }
        return null;
    }, [availableCategoriesByStore, resolveSelectionSpecs]);

    const handleScheduleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!schedulerAvailable) {
            showError('Scheduler unavailable', 'The crawler scheduler is not online. Try again after the service starts.');
            return;
        }

        const validation = validateScheduleForm(scheduleForm);
        if (validation) {
            setScheduleError(validation);
            return;
        }

        const payload: Record<string, any> = {
            label: scheduleForm.name.trim(),
            description: scheduleForm.description.trim() || undefined,
            enabled: scheduleForm.enabled,
            batch_mode: scheduleForm.batchMode,
            headless_mode: scheduleForm.headless,
            selection: buildSelectionPayload(scheduleForm),
            schedule: buildScheduleConfig(scheduleForm),
            limit_mode: scheduleForm.limitMode,
        };

        if (scheduleForm.limitMode === 'custom') {
            const parsed = Number(scheduleForm.maxItems.trim());
            payload.max_items = Math.floor(parsed);
        } else {
            delete payload.max_items;
        }

        setScheduleSaving(true);
        setScheduleError(null);

        try {
            if (selectedScheduleId) {
                await crawlerAPI.updateSchedule(selectedScheduleId, payload);
                success('Schedule updated', `${scheduleForm.name} now reflects the latest settings.`);
            } else {
                await crawlerAPI.createSchedule(payload);
                success('Schedule created', `${scheduleForm.name} will run automatically.`);
            }

            await loadSchedules();
            resetScheduleForm();
            if (!scheduleExpanded) {
                setScheduleExpanded(true);
            }
        } catch (error: any) {
            console.error('Failed to save schedule:', error);
            const message = error instanceof Error ? error.message : 'Failed to save schedule';
            setScheduleError(message);
            showError('Save failed', message);
        } finally {
            setScheduleSaving(false);
        }
    }, [schedulerAvailable, scheduleForm, selectedScheduleId, loadSchedules, resetScheduleForm, scheduleExpanded, success, showError, buildSelectionPayload, buildScheduleConfig, validateScheduleForm]);

    const handleEditSchedule = useCallback((schedule: CrawlerSchedule) => {
        const defaults = createScheduleDefaults();
        const selection = schedule.selection || {};
        const config = schedule.schedule || {};
        const derivedStores = Array.isArray(selection.stores) ? selection.stores.map(String) : [];
        const derivedCategories = Array.isArray(selection.categories) ? selection.categories.map(String) : [];
        const scheduleType = (config.type || defaults.scheduleType) as ScheduleType;
        const weeklySource = Array.isArray(config.days_of_week)
            ? config.days_of_week.map((day: any) => Number(day)).filter((day: number) => !Number.isNaN(day))
            : [];
        const rawLimitMode = schedule.limit_mode as LimitMode | undefined;
        const derivedLimitMode: LimitMode = rawLimitMode || (schedule.max_items !== undefined && schedule.max_items !== null ? 'custom' : 'default');
        const derivedMaxItems = derivedLimitMode === 'custom' && schedule.max_items !== undefined && schedule.max_items !== null
            ? String(schedule.max_items)
            : '';

        setSelectedScheduleId(schedule.id);
        setScheduleExpanded(true);
        setScheduleForm({
            ...defaults,
            name: schedule.label || '',
            description: schedule.description || '',
            enabled: schedule.enabled ?? true,
            selectionMode: (selection.mode || defaults.selectionMode) as ScheduleSelectionMode,
            store: derivedStores[0] || defaults.store,
            category: derivedCategories[0] || defaults.category,
            selectedStores: derivedStores,
            selectedCategories: derivedCategories,
            batchMode: (schedule.batch_mode || defaults.batchMode) as ScheduleBatchMode,
            limitMode: derivedLimitMode,
            maxItems: derivedMaxItems,
            headless: Boolean(schedule.headless_mode),
            scheduleType,
            oneTimeLocal: scheduleType === 'one_time' && config.run_at ? toDateTimeLocalValue(config.run_at) : '',
            dailyTime: config.time_of_day || defaults.dailyTime,
            timezone: config.timezone || defaults.timezone,
            weeklyDays: scheduleType === 'weekly'
                ? (weeklySource.length > 0 ? weeklySource : defaults.weeklyDays)
                : defaults.weeklyDays,
            intervalMinutes: scheduleType === 'interval' && config.interval_minutes
                ? String(config.interval_minutes)
                : defaults.intervalMinutes,
        });
        setScheduleError(null);
        setActiveTargetPreset(null);
        setActiveCadencePreset(null);
    }, [createScheduleDefaults, toDateTimeLocalValue]);

    const handleDeleteSchedule = useCallback(async (schedule: CrawlerSchedule) => {
        const confirmed = await confirm('Delete Schedule', `Remove "${schedule.label}" from automation?`);
        if (!confirmed) return;
        try {
            await crawlerAPI.deleteSchedule(schedule.id);
            success('Schedule removed', `${schedule.label} has been deleted.`);
            if (selectedScheduleId === schedule.id) {
                resetScheduleForm();
            }
            await loadSchedules();
        } catch (error: any) {
            console.error('Failed to delete schedule:', error);
            const message = error instanceof Error ? error.message : 'Failed to delete schedule';
            showError('Delete failed', message);
        }
    }, [confirm, success, selectedScheduleId, resetScheduleForm, loadSchedules, showError]);

    const handleToggleSchedule = useCallback(async (schedule: CrawlerSchedule) => {
        try {
            const nextEnabled = !schedule.enabled;
            await crawlerAPI.toggleSchedule(schedule.id, nextEnabled);
            success(nextEnabled ? 'Schedule enabled' : 'Schedule disabled', `${schedule.label} ${nextEnabled ? 'will run as planned' : 'is paused'}.`);
            if (selectedScheduleId === schedule.id) {
                updateScheduleForm({ enabled: nextEnabled });
            }
            await loadSchedules();
        } catch (error: any) {
            console.error('Failed to toggle schedule:', error);
            const message = error instanceof Error ? error.message : 'Failed to update schedule status';
            showError('Update failed', message);
        }
    }, [loadSchedules, selectedScheduleId, success, showError, updateScheduleForm]);

    const handleRunScheduleNow = useCallback(async (schedule: CrawlerSchedule) => {
        try {
            info('Manual trigger', `Running "${schedule.label}" immediately.`);
            await crawlerAPI.runScheduleNow(schedule.id);
            success('Schedule triggered', `${schedule.label} has been queued to run.`);
            await loadSchedules();
        } catch (error: any) {
            console.error('Failed to trigger schedule:', error);
            const message = error instanceof Error ? error.message : 'Failed to trigger schedule';
            showError('Trigger failed', message);
        }
    }, [info, success, loadSchedules, showError]);

    const [selectedStoreLaunch, setSelectedStoreLaunch] = useState<string>('');
    const [selectedCategoryLaunch, setSelectedCategoryLaunch] = useState<string>('');
    const [storeGroupConfig, setStoreGroupConfig] = useState<GroupControlState>({
        max: '',
        crawlAll: false,
        headless: false,
        crawlAllMixed: false,
        headlessMixed: false,
        maxMixed: false,
    });
    const [categoryGroupConfig, setCategoryGroupConfig] = useState<GroupControlState>({
        max: '',
        crawlAll: false,
        headless: false,
        crawlAllMixed: false,
        headlessMixed: false,
        maxMixed: false,
    });
    const storeCrawlAllRef = useRef<HTMLInputElement | null>(null);
    const storeHeadlessRef = useRef<HTMLInputElement | null>(null);
    const categoryCrawlAllRef = useRef<HTMLInputElement | null>(null);
    const categoryHeadlessRef = useRef<HTMLInputElement | null>(null);

    const cacheAppliedRef = useRef(false);
    const scheduleRefreshInFlightRef = useRef(false);
    const lastScheduleRefreshRef = useRef(0);
    const resultToastHistoryRef = useRef<Map<string, string>>(new Map());
    const resultsHydratedRef = useRef(false);


    const totalProductsScraped = useMemo(() => {
        return Object.values(crawlerResults).reduce((sum: number, result: any) => {
            if (!result) return sum;
            const count =
                result.count ??
                result.total_products ??
                (Array.isArray(result.items) ? result.items.length : 0) ??
                0;
            return sum + (typeof count === 'number' ? count : Number(count) || 0);
        }, 0);
    }, [crawlerResults]);

    const totalOutputFiles = useMemo(() => {
        return Object.values(outputFiles).reduce((sum, files) => sum + files.length, 0);
    }, [outputFiles]);

    const statCards = useMemo<StatCardType[]>(() => [
        {
            key: 'active',
            label: 'Active Crawlers',
            description: 'Jobs currently running across supermarket pipelines',
            value: loading ? '...' : formatNumber(crawlerStatus.active_crawlers),
            accent: 'from-emerald-500 to-teal-500',
            icon: Play,
        },
        {
            key: 'scraped',
            label: 'Products Scraped',
            description: 'Latest item totals harvested from recent runs',
            value: loading ? '...' : formatNumber(totalProductsScraped),
            accent: 'from-sky-500 to-indigo-500',
            icon: Activity,
        },
        {
            key: 'recent',
            label: 'Recent Runs',
            description: 'Tracked executions in the activity timeline',
            value: loading ? '...' : formatNumber(recentActivity.length),
            accent: 'from-amber-500 to-orange-500',
            icon: Timer1,
        },
        {
            key: 'outputs',
            label: 'Output Files',
            description: 'Crawler exports ready for QA or syncing',
            value: loading ? '...' : formatNumber(totalOutputFiles),
            accent: 'from-violet-500 to-purple-500',
            icon: DocumentText1,
        },
    ], [crawlerStatus.active_crawlers, formatNumber, loading, recentActivity.length, totalOutputFiles, totalProductsScraped]);

    const systemStatusChip = useMemo(() => {
        if (crawlerStatus.available) {
            return {
                label: 'Crawler service online',
                chipClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
                dotClass: 'bg-emerald-500',
            };
        }

        if (crawlerStatus.active_crawlers > 0) {
            return {
                label: 'Jobs running, awaiting status',
                chipClass: 'border border-amber-200 bg-amber-50 text-amber-700',
                dotClass: 'bg-amber-500',
            };
        }

        // Check if crawler is loading
        if (crawlerStatus.loading) {
            return {
                label: 'Initializing crawler service...',
                chipClass: 'border border-sky-200 bg-sky-50 text-sky-700',
                dotClass: 'bg-sky-500 animate-pulse',
            };
        }

        return {
            label: 'Crawler service offline',
            chipClass: 'border border-rose-200 bg-rose-50 text-rose-700',
            dotClass: 'bg-rose-500',
        };
    }, [crawlerStatus.active_crawlers, crawlerStatus.available, crawlerStatus.loading]);

    const persistDashboardSnapshot = useCallback((snapshot: DashboardSnapshot) => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(snapshot));
        } catch (err) {
            console.warn('Failed to persist crawler dashboard snapshot', err);
        }
    }, []);

    const latestDashboardStateRef = useRef<DashboardSnapshot>({
        status: DEFAULT_CRAWLER_STATUS,
        availableCrawlers: {},
        allCrawlers: [],
        activeCrawlers: {},
        crawlerResults: {},
        recentActivity: [],
        outputFiles: {},
        savedAt: Date.now()
    });

    useEffect(() => {
        latestDashboardStateRef.current = {
            status: crawlerStatus,
            availableCrawlers,
            allCrawlers,
            activeCrawlers,
            crawlerResults,
            recentActivity,
            outputFiles,
            savedAt: Date.now()
        };
    }, [crawlerStatus, availableCrawlers, allCrawlers, activeCrawlers, crawlerResults, recentActivity, outputFiles]);

    const persistSnapshotWithState = useCallback((overrides: Partial<DashboardSnapshot> = {}) => {
        const baseline = latestDashboardStateRef.current;
        persistDashboardSnapshot({
            ...baseline,
            ...overrides,
            savedAt: Date.now()
        });
    }, [persistDashboardSnapshot]);

    const persistSnapshotWithStateRef = useRef(persistSnapshotWithState);
    useEffect(() => {
        persistSnapshotWithStateRef.current = persistSnapshotWithState;
    }, [persistSnapshotWithState]);

    useEffect(() => {
        if (typeof window === 'undefined' || cacheAppliedRef.current) return;
        try {
            const cached = localStorage.getItem(DASHBOARD_CACHE_KEY);
            if (!cached) return;

            const snapshot: DashboardSnapshot = JSON.parse(cached);
            if (!snapshot) return;

            if (snapshot.savedAt && Date.now() - snapshot.savedAt > DASHBOARD_CACHE_TTL) {
                return;
            }
            setCrawlerStatus(snapshot.status || DEFAULT_CRAWLER_STATUS);
            setAvailableCrawlers(snapshot.availableCrawlers || {});
            setAllCrawlers(snapshot.allCrawlers || []);
            setActiveCrawlers(snapshot.activeCrawlers || {});
            setCrawlerResults(snapshot.crawlerResults || {});
            setRecentActivity(snapshot.recentActivity || []);
            setOutputFiles(snapshot.outputFiles || {});
            setLoading(false);

            cacheAppliedRef.current = true;
        } catch (err) {
            console.warn('Failed to restore crawler dashboard snapshot', err);
        }
    }, []);

    const syncSchedules = useCallback((options?: { force?: boolean; silent?: boolean }) => {
        const now = Date.now();
        const silent = options?.silent ?? true;
        if (scheduleRefreshInFlightRef.current) return;
        if (!options?.force && now - lastScheduleRefreshRef.current < 15000) {
            return;
        }
        scheduleRefreshInFlightRef.current = true;
        void loadSchedules({ silent }).catch(error => {
            console.warn('Background schedule refresh failed', error);
        }).finally(() => {
            scheduleRefreshInFlightRef.current = false;
            lastScheduleRefreshRef.current = Date.now();
        });
    }, [loadSchedules]);

    const syncSchedulesRef = useRef(syncSchedules);
    useEffect(() => {
        syncSchedulesRef.current = syncSchedules;
    }, [syncSchedules]);

    useEffect(() => {
        const interval = setInterval(() => {
            syncSchedules({ silent: true });
        }, 60000);
        return () => clearInterval(interval);
    }, [syncSchedules]);

    // Helper function to generate consistent activity IDs
    const generateActivityId = (store: string, category: string, crawlerId?: string, timestamp?: string): string => {
        const id = crawlerId || 'no_id';
        const ts = timestamp || new Date().toISOString();
        return `${store}_${category}_${id}_${ts}`;
    };

    // Helper function to check if activity is cleared using SQLite
    const isActivityCleared = async (activity: any): Promise<boolean> => {
        try {
            const timestamp = activity.timestamp || activity.completed_at || activity.start_time;
            if (!timestamp) {
                console.warn('Activity missing timestamp for clear check:', activity);
                return false;
            }
            
            const result = await SQLiteDB.isActivityCleared(
                activity.store, 
                activity.category, 
                timestamp, 
                activity.crawler_id
            );
            
            if (result) {
                console.log(`Activity ${activity.store}_${activity.category} is cleared`);
            }
            
            return result;
        } catch (error) {
            console.error('Error checking if activity is cleared:', error);
            return false;
        }
    };

    // Helper function to check if a result is cleared using SQLite (separate from activity clearing)
    const isResultCleared = async (resultId: string, result: any): Promise<boolean> => {
        try {
            const store = resultId.split('_')[0];
            const category = resultId.split('_')[1];
            const timestamp = result.completed_at || result.timestamp;
            if (!timestamp) {
                console.warn('Result missing timestamp for clear check:', resultId, result);
                return false;
            }
            
            const isCleared = await SQLiteDB.isResultCleared(store, category, timestamp, resultId);
            
            if (isCleared) {
                console.log(`Result ${resultId} is cleared`);
            }
            
            return isCleared;
        } catch (error) {
            console.error('Error checking if result is cleared:', error);
            return false;
        }
    };

    // Helper function to filter cleared activities (with memoization)
    const applyActivityFiltering = useCallback(async (activities: any[]): Promise<any[]> => {
        // Quick return if no activities to filter
        if (activities.length === 0) return activities;
        
        try {
            const filtered = [];
            console.log(`Filtering ${activities.length} activities for cleared status`);
            
            for (const activity of activities) {
                const isCleared = await isActivityCleared(activity);
                if (!isCleared) {
                    filtered.push(activity);
                } else {
                    console.log(`Filtering out cleared activity: ${activity.store}_${activity.category}`);
                }
            }
            
            console.log(`Activities after filtering: ${filtered.length} remaining`);
            return filtered;
        } catch (error) {
            console.error('Error filtering activities:', error);
            return activities; // Return all activities if filtering fails
        }
    }, []);

    // Helper function to filter cleared results (with memoization)
    const applyResultFiltering = useCallback(async (results: {[key: string]: any}): Promise<{[key: string]: any}> => {
        // Quick return if no results to filter
        if (Object.keys(results).length === 0) return results;
        
        try {
            const filteredResults: {[key: string]: any} = {};
            console.log(`Filtering ${Object.keys(results).length} results for cleared status`);
            
            for (const [resultId, result] of Object.entries(results)) {
                const isCleared = await isResultCleared(resultId, result);
                if (!isCleared) {
                    filteredResults[resultId] = result;
                } else {
                    console.log(`Filtering out cleared result: ${resultId}`);
                }
            }
            
            console.log(`Results after filtering: ${Object.keys(filteredResults).length} remaining`);
            return filteredResults;
        } catch (error) {
            console.error('Error filtering results:', error);
            return results; // Return all results if filtering fails
        }
    }, []);

    const applyActivityFilteringRef = useRef(applyActivityFiltering);
    const applyResultFilteringRef = useRef(applyResultFiltering);

    useEffect(() => {
        applyActivityFilteringRef.current = applyActivityFiltering;
    }, [applyActivityFiltering]);

    useEffect(() => {
        applyResultFilteringRef.current = applyResultFiltering;
    }, [applyResultFiltering]);

    // Debug function to show database statistics
    const showDatabaseStats = async () => {
        try {
            const stats = await SQLiteDB.getStats();
            const allClearedActivities = await SQLiteDB.getAllClearedActivities();
            const allClearedResults = await SQLiteDB.getAllClearedResults();
            
            const debugInfo = {
                databaseStats: stats,
                recentActivityCount: recentActivity.length,
                crawlerResultsCount: Object.keys(crawlerResults).length,
                outputFilesCount: Object.values(outputFiles).reduce((sum, files) => sum + files.length, 0),
                clearedActivitiesDetails: allClearedActivities.slice(0, 3), // Show last 3 for debugging
                clearedResultsDetails: allClearedResults.slice(0, 3), // Show last 3 for debugging
                currentTimestamp: new Date().toISOString()
            };
            
            console.log('=== Database & App State Debug Info ===');
            console.log(JSON.stringify(debugInfo, null, 2));
            
            info('Debug Info', `Database: ${stats.clearedActivities} activities, ${stats.clearedResults} results cleared. Check console for details.`);
        } catch (error) {
            console.error('Error getting database stats:', error);
            showError('Debug Failed', 'Failed to get database statistics');
        }
    };

    const getCrawlerDisplayStatus = (store: string, category: string) => {
        // First check if crawler is currently active
        const activeCrawler = Object.values(activeCrawlers).find((c: CrawlerInfo) => 
            c.store === store && c.category === category
        );
        
        if (activeCrawler) {
            // Check if this is a failed crawler with output files - treat as completed
            if (activeCrawler.status === 'failed' && (activeCrawler.items_found || 0) > 0) {
                const storeFiles = outputFiles[store] || [];
                const hasOutputFile = storeFiles.some((fileName: string) => {
                    const fileBaseName = fileName.replace('.json', '');
                    const parts = fileBaseName.split('_');
                    if (parts.length >= 2) {
                        const fileCategory = parts.slice(1).join('_');
                        
                        const categoryVariants = [
                            category,
                            category + 's',
                            category.replace(/s$/, ''),
                            category.replace('_', '')
                        ];
                        
                        return categoryVariants.some(variant => fileCategory === variant);
                    }
                    return false;
                });
                
                if (hasOutputFile) {
                    return {
                        ...activeCrawler,
                        status: 'completed' as const,
                        items_found: activeCrawler.items_found || activeCrawler.count || activeCrawler.total_products || 0 // Ensure items_found is available
                    };
                }
            }
            // Return active crawler with proper item count mapping
            return {
                ...activeCrawler,
                items_found: activeCrawler.items_found || activeCrawler.count || activeCrawler.total_products || 0 // Ensure items_found is available
            };
        }
        
        // If not active, check if it has completed results - be more flexible with key matching
        const resultKey = Object.keys(crawlerResults).find(key => {
            // Try exact match first
            if (key.startsWith(`${store}_${category}`)) return true;
            
            // Try with plurals/singulars for common mismatches
            const categoryVariants = [
                category,
                category + 's', // singular -> plural
                category.replace(/s$/, ''), // plural -> singular
                category.replace('_', '')  // remove underscores
            ];
            
            return categoryVariants.some(variant => 
                key.startsWith(`${store}_${variant}`)
            );
        });
        
        if (resultKey) {
            const result = crawlerResults[resultKey];
            return {
                store,
                category,
                status: 'completed' as const,
                items_found: result.count || result.total_products || (result.items ? result.items.length : 0) || 0,
                timestamp: result.completed_at || result.timestamp,
                crawler_id: resultKey
            };
        }
        
        // Default to inactive
        return { store, category, status: 'inactive' as const };
    };

    // File management functions
    const viewFileContent = async (store: string, filename: string, category?: string) => {
        try {
            const content = await crawlerAPI.loadFile(store, filename, category);
            setFileViewModal({
                open: true,
                store,
                filename,
                content
            });
        } catch (error) {
            console.error('Error loading file:', error);
            showError('Failed to Load File', 'Could not load the file content. Please try again.');
        }
    };

    const loadFileContent = async (store: string, filename: string, category?: string) => {
        try {
            const content = await crawlerAPI.loadFile(store, filename, category);
            setFileViewModal(prev => ({
                ...prev,
                content
            }));
        } catch (error) {
            console.error('Error loading file:', error);
            showError('Failed to Load File', 'Could not load the file content. Please try again.');
        }
    };

    const deleteFile = async (store: string, filename: string) => {
        const confirmed = await confirm(
            'Delete File', 
            `Are you sure you want to delete ${filename}? This will also remove the corresponding results.`
        );
        if (!confirmed) return;
        
        try {
            await crawlerAPI.deleteFile(store, filename);
            
            // Immediately refresh data to reflect the deletion
            await fetchCrawlerData();
            
            success('File Deleted', 'File and corresponding results deleted successfully');
        } catch (error) {
            console.error('Error deleting file:', error);
            showError('Delete Failed', 'Failed to delete the file. Please try again.');
        }
    };

    const sendFileToClassifier = async (products: any[]) => {
        try {
            if (products && products.length > 0) {
                // Store the products in localStorage so they can be picked up by the classifier
                localStorage.setItem('crawlerProducts', JSON.stringify(products));
                localStorage.setItem('crawlerProductsTimestamp', new Date().toISOString());
                
                // Show success message and suggest navigation
                const shouldNavigate = await confirm(
                    'Products Ready for Classification',
                    `Successfully prepared ${products.length} products for classification! Would you like to go to the Classification page now?`
                );
                
                if (shouldNavigate) {
                    // Use Next.js router for smooth navigation without auth refresh
                    router.push('/app/classifier');
                } else {
                    success('Products Ready', `${products.length} products are now available in the Classification page.`);
                }
            } else {
                warning('No Products', 'No products found to send to classifier');
            }
        } catch (error) {
            console.error('Error sending to classifier:', error);
            showError('Transfer Failed', 'Failed to send products to classifier. Please try again.');
        }
    };

    const loadFileAndSendToClassifier = async (store: string, filename: string, category?: string) => {
        try {
            const content = await crawlerAPI.loadFile(store, filename, category);
            if (content && content.items && content.items.length > 0) {
                await sendFileToClassifier(content.items);
            } else {
                warning('Empty File', 'No products found in this file');
            }
        } catch (error) {
            console.error('Error loading file for classifier:', error);
            showError('Load Failed', 'Failed to load file content for classifier');
        }
    };

    // Firebase file management functions
    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Helpers for limit keys and lookups
    const getLimitFor = useCallback((store: string, category: string): { max?: number; crawlAll?: boolean; headless?: boolean } => {
        return crawlerLimits[`${store}:${category}`] || {};
    }, [crawlerLimits]);

    const setLimitFor = useCallback((store: string, category: string, value: { max?: number; crawlAll?: boolean; headless?: boolean }) => {
        const key = `${store}:${category}`;
        setCrawlerLimits(prev => ({ ...prev, [key]: { ...prev[key], ...value } }));
    }, []);

    const parseMaxItems = useCallback((value: unknown): number | undefined => {
        if (value === null || value === undefined || value === '') {
            return undefined;
        }
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return undefined;
        }
        return Math.floor(parsed);
    }, []);

    const resolveMaxItems = useCallback((limitMax: unknown, useAll: boolean): number | undefined => {
        if (useAll) {
            return undefined;
        }
        const specific = parseMaxItems(limitMax);
        if (specific !== undefined) {
            return specific;
        }
        const globalResolved = parseMaxItems(globalMaxItems);
        if (globalResolved !== undefined) {
            return globalResolved;
        }
        return DEFAULT_MAX_ITEMS;
    }, [globalMaxItems, parseMaxItems]);

    const computeAdaptiveRefreshInterval = useCallback((params: { activeCount: number; hasRecentChange: boolean; visible: boolean; failureCount: number }) => {
        const { activeCount, hasRecentChange, visible, failureCount } = params;
        let interval = activeCount > 0 || hasRecentChange ? ACTIVE_REFRESH_INTERVAL_MS : IDLE_REFRESH_INTERVAL_MS;

        if (!visible) {
            interval = Math.max(interval, BACKGROUND_REFRESH_INTERVAL_MS);
        }

        if (failureCount > 0) {
            const backoff = Math.min(failureCount * FAILURE_BACKOFF_STEP_MS, FAILURE_BACKOFF_MAX_MS);
            interval += backoff;
        }

        return interval;
    }, []);

    const computeAdaptiveRefreshIntervalRef = useRef(computeAdaptiveRefreshInterval);
    useEffect(() => {
        computeAdaptiveRefreshIntervalRef.current = computeAdaptiveRefreshInterval;
    }, [computeAdaptiveRefreshInterval]);

    const loadFirebaseFiles = useCallback(async () => {
        setFirebaseLoading(true);
        try {
            const response = await fetch('/api/crawler/storage/files', {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                setFirebaseFiles(data.files || []);
            } else {
                showError('Storage Error', 'Failed to load Firebase files');
            }
        } catch (error) {
            console.error('Failed to load Firebase files:', error);
            showError('Storage Error', 'Failed to load Firebase files');
        } finally {
            setFirebaseLoading(false);
        }
    }, [showError]);

    const performFirebaseFileOperation = async (operation: string, cloudPath: string, successMessage: string) => {
        try {
            const response = await fetch('/api/crawler/storage/files', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    operation: operation,
                    cloud_path: cloudPath
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                success('File Operation', successMessage || result.message || 'Operation completed successfully');
                // Refresh the file list
                setTimeout(() => loadFirebaseFiles(), 1000);
            } else {
                showError('File Operation Failed', result.error || 'Operation failed');
            }
            
        } catch (error) {
            showError('File Operation Error', 'Error performing file operation');
        }
    };

    const downloadFileFromBrowser = async (fileName: string) => {
        try {
            window.open(`/api/crawler/storage/download?file=${encodeURIComponent(fileName)}`, '_blank');
        } catch (error) {
            showError('Download Error', 'Failed to download file');
        }
    };

    const downloadToLocal = async (fileName: string) => {
        const confirmed = await confirm(
            'Download to Local', 
            `Download ${fileName} to local storage for AI processing?`
        );
        if (confirmed) {
            await performFirebaseFileOperation('download', fileName, 'File downloaded to local storage');
        }
    };

    const keepOnlyInCloud = async (fileName: string) => {
        const confirmed = await confirm(
            'Keep Cloud Only', 
            `Keep ${fileName} only in cloud storage? Local copy will be removed if it exists.`
        );
        if (confirmed) {
            await performFirebaseFileOperation('keep_cloud_only', fileName, 'File is now kept only in cloud storage');
        }
    };

    const prepareForAI = async (fileName: string) => {
        const confirmed = await confirm(
            'Prepare for AI', 
            `Prepare ${fileName} for AI classifier processing?`
        );
        if (confirmed) {
            await performFirebaseFileOperation('prepare_ai', fileName, 'File prepared for AI processing');
        }
    };

    const deleteFirebaseFile = async (fileName: string) => {
        const confirmed = await confirm(
            'Delete File', 
            `Are you sure you want to delete ${fileName} from Firebase Storage?`
        );
        if (confirmed) {
            await performFirebaseFileOperation('delete', fileName, 'File deleted successfully');
        }
    };

    // Load Firebase files when the files tab is first accessed
    useEffect(() => {
        if (activeTab === 'files' && firebaseFiles.length === 0 && !firebaseLoading) {
            loadFirebaseFiles();
        }
    }, [activeTab, firebaseFiles.length, firebaseLoading, loadFirebaseFiles]);

    const renderScheduleSection = () => {
        const storeOptions = getUniqueStores();
        const categoryOptions = getUniqueCategories();
        const storeCategoryOptions = scheduleForm.selectedStores.length > 0
            ? getUniqueCategories(scheduleForm.selectedStores)
            : categoryOptions;
        const titleize = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
        const resolveTime = (value?: string | null) => {
            if (!value) return Number.MAX_SAFE_INTEGER;
            const parsed = new Date(value).getTime();
            return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
        };
        const sortedSchedules = [...schedules].sort((a, b) => {
            const timeA = resolveTime(a.next_run);
            const timeB = resolveTime(b.next_run);
            if (timeA !== timeB) return timeA - timeB;
            return (a.label || '').localeCompare(b.label || '');
        });

        const selectionModeOptions: Array<{ key: ScheduleSelectionMode; label: string; hint: string }> = [
            { key: 'all', label: 'All crawlers', hint: 'Trigger every available crawler' },
            { key: 'store', label: 'By store', hint: 'Run specific retailers' },
            { key: 'category', label: 'By category', hint: 'Focus on selected categories' },
        ];

        const scheduleTypeOptions: Array<{ key: ScheduleType; label: string; hint: string }> = [
            { key: 'daily', label: 'Daily', hint: 'Run once per day at a set time' },
            { key: 'weekly', label: 'Weekly', hint: 'Pick weekdays to execute' },
            { key: 'interval', label: 'Interval', hint: 'Repeat every N minutes' },
            { key: 'one_time', label: 'One-time', hint: 'Run once at a specific time' },
        ];

        const selectionPresets: SelectionPreset[] = [
            { key: 'all-everything', label: 'Everything', hint: 'All crawlers, every store', mode: 'all' },
        ];
        if (storeOptions.length > 0) {
            selectionPresets.push({
                key: `store-${storeOptions[0]}-full`,
                label: `${titleize(storeOptions[0])} full sweep`,
                hint: 'Every category from this retailer',
                mode: 'store',
                stores: [storeOptions[0]],
            });
        }
        if (categoryOptions.length > 0) {
            selectionPresets.push({
                key: `category-${categoryOptions[0]}-focus`,
                label: `${titleize(categoryOptions[0])} focus`,
                hint: 'Monitor this category across all stores',
                mode: 'category',
                categories: [categoryOptions[0]],
            });
        }
        if (storeOptions.length > 1) {
            selectionPresets.push({
                key: 'store-top-duo',
                label: `${titleize(storeOptions[0])} + ${titleize(storeOptions[1])}`,
                hint: 'Multi-retailer sweep',
                mode: 'store',
                stores: storeOptions.slice(0, 2),
            });
        }
        if (categoryOptions.length > 1) {
            selectionPresets.push({
                key: 'category-staples',
                label: 'Staple aisles',
                hint: `${titleize(categoryOptions[0])} + ${titleize(categoryOptions[1])}`,
                mode: 'category',
                categories: categoryOptions.slice(0, 2),
            });
        }

        const isEditing = Boolean(selectedScheduleId);

        return (
            <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                    <div className='flex items-start gap-3'>
                        <span className='inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary'>
                            <CalendarEdit size={18} />
                        </span>
                        <div>
                            <p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'>Automation</p>
                            <h3 className='mt-1 text-lg font-semibold text-slate-900'>Scheduled crawler runs</h3>
                            <p className='text-sm text-slate-500'>Orchestrate recurring crawler batches that survive restarts and run on time.</p>
                        </div>
                    </div>
                    <div className='flex shrink-0 flex-wrap gap-2'>
                        <button
                            type='button'
                            onClick={() => setScheduleExpanded(prev => !prev)}
                            className='inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-primary/50 hover:text-primary'
                        >
                            <Add size={16} />
                            {scheduleExpanded ? (isEditing ? 'Close editor' : 'Hide form') : isEditing ? 'Edit schedule' : 'New schedule'}
                        </button>
                        <button
                            type='button'
                            onClick={() => void loadSchedules()}
                            disabled={schedulesLoading}
                            className='inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60'
                        >
                            <Refresh size={16} className={schedulesLoading ? 'animate-spin' : ''} />
                            {schedulesLoading ? 'Refreshing…' : 'Refresh'}
                        </button>
                    </div>
                </div>

                {!schedulerAvailable ? (
                    <div className='mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700'>
                        The scheduler service is currently offline. Start the backend scheduler to manage automated runs.
                    </div>
                ) : (
                    <>
                        {scheduleExpanded && (
                            <form onSubmit={handleScheduleSubmit} className='mt-5 space-y-5 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 shadow-inner'>
                                <datalist id='timezone-options'>
                                    {timezoneOptions.map(zone => (
                                        <option value={zone} key={`tz-${zone}`} />
                                    ))}
                                </datalist>
                                <div className='grid gap-4 md:grid-cols-2'>
                                    <div>
                                        <label className='block text-xs font-semibold uppercase tracking-wide text-slate-500'>Schedule name</label>
                                        <input
                                            type='text'
                                            value={scheduleForm.name}
                                            onChange={(event) => updateScheduleForm({ name: event.target.value })}
                                            required
                                            className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                                            placeholder='Morning sweep'
                                        />
                                    </div>
                                    <div className='flex items-end justify-between gap-2'>
                                        <div>
                                            <label className='block text-xs font-semibold uppercase tracking-wide text-slate-500'>Automation state</label>
                                            <p className='mt-1 text-xs text-slate-500'>Toggle to enable or pause this schedule.</p>
                                        </div>
                                        <label className='inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600'>
                                            <input
                                                type='checkbox'
                                                checked={scheduleForm.enabled}
                                                onChange={(event) => updateScheduleForm({ enabled: event.target.checked })}
                                            />
                                            {scheduleForm.enabled ? 'Enabled' : 'Paused'}
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className='block text-xs font-semibold uppercase tracking-wide text-slate-500'>Description</label>
                                    <textarea
                                        value={scheduleForm.description}
                                        onChange={(event) => updateScheduleForm({ description: event.target.value })}
                                        rows={2}
                                        className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                                        placeholder='Optional context for teammates'
                                    />
                                </div>

                                <div>
                                    <p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-500'>Target crawlers</p>
                                    <div className='mt-2 flex flex-wrap gap-2'>
                                        {selectionModeOptions.map(option => {
                                            const isActive = scheduleForm.selectionMode === option.key;
                                            return (
                                                <button
                                                    key={option.key}
                                                    type='button'
                                                    onClick={() => setSelectionMode(option.key)}
                                                    className={`flex flex-col rounded-xl border px-3 py-2 text-left text-xs transition ${
                                                        isActive ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 bg-white text-slate-600 hover:border-primary/40'
                                                    }`}
                                                >
                                                    <span className='text-sm font-semibold'>{option.label}</span>
                                                    <span className='mt-0.5 text-[11px] text-slate-500'>{option.hint}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className='mt-4'>
                                        <p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500'>Quick target presets</p>
                                        <div className='mt-2 flex flex-wrap gap-2'>
                                            {selectionPresets.map(preset => {
                                                const isPresetActive = activeTargetPreset === preset.key;
                                                return (
                                                    <button
                                                        key={preset.key}
                                                        type='button'
                                                        onClick={() => applySelectionPreset(preset)}
                                                        className={`flex flex-col rounded-xl border px-3 py-2 text-left text-xs transition ${
                                                            isPresetActive
                                                                ? 'border-primary bg-gradient-to-br from-primary/10 via-white to-white text-primary shadow-sm'
                                                                : 'border-slate-200 bg-white text-slate-600 hover:border-primary/40'
                                                        }`}
                                                    >
                                                        <span className='text-sm font-semibold'>{preset.label}</span>
                                                        <span className='mt-0.5 text-[11px] text-slate-500'>{preset.hint}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {scheduleForm.selectionMode === 'store' && (
                                        <div className='mt-4 space-y-4'>
                                            <div>
                                                <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Stores</p>
                                                <div className='mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3'>
                                                    {storeOptions.map(store => (
                                                        <label key={`store-${store}`} className='flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700'>
                                                            <input
                                                                type='checkbox'
                                                                checked={scheduleForm.selectedStores.includes(store)}
                                                                onChange={() => toggleScheduleStore(store)}
                                                            />
                                                            <span className='capitalize'>{store}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                                <p className='mt-2 text-xs text-slate-500'>Leave unchecked to include every store.</p>
                                            </div>
                                            <div>
                                                <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Categories</p>
                                                {storeCategoryOptions.length === 0 ? (
                                                    <p className='mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700'>
                                                        No categories are available for the selected stores.
                                                    </p>
                                                ) : (
                                                    <div className='mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
                                                        {storeCategoryOptions.map(category => (
                                                            <label key={`store-category-${category}`} className='flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700'>
                                                                <input
                                                                    type='checkbox'
                                                                    checked={scheduleForm.selectedCategories.includes(category)}
                                                                    onChange={() => toggleScheduleCategory(category)}
                                                                />
                                                                <span className='capitalize'>{category.replace(/_/g, ' ')}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                                <p className='mt-2 text-xs text-slate-500'>Leave unchecked to run every category for the selected stores.</p>
                                            </div>
                                        </div>
                                    )}

                                    {scheduleForm.selectionMode === 'category' && (
                                        <div className='mt-4 space-y-4'>
                                            <div>
                                                <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Categories</p>
                                                <div className='mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
                                                    {categoryOptions.map(category => (
                                                        <label key={`category-${category}`} className='flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700'>
                                                            <input
                                                                type='checkbox'
                                                                checked={scheduleForm.selectedCategories.includes(category)}
                                                                onChange={() => toggleScheduleCategory(category)}
                                                            />
                                                            <span className='capitalize'>{category.replace(/_/g, ' ')}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                                <p className='mt-2 text-xs text-slate-500'>Pick the categories to run. Leave empty for every category.</p>
                                            </div>
                                            <div>
                                                <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Optional store filter</p>
                                                <div className='mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3'>
                                                    {storeOptions.map(store => (
                                                        <label key={`category-store-${store}`} className='flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700'>
                                                            <input
                                                                type='checkbox'
                                                                checked={scheduleForm.selectedStores.includes(store)}
                                                                onChange={() => toggleScheduleStore(store)}
                                                            />
                                                            <span className='capitalize'>{store}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                                <p className='mt-2 text-xs text-slate-500'>Leave empty to apply across all stores.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-500'>Run cadence</p>
                                    <div className='mt-2 flex flex-wrap gap-2'>
                                        {scheduleTypeOptions.map(option => {
                                            const isActive = scheduleForm.scheduleType === option.key;
                                            return (
                                                <button
                                                    key={option.key}
                                                    type='button'
                                                    onClick={() => setScheduleType(option.key)}
                                                    className={`flex flex-col rounded-xl border px-3 py-2 text-left text-xs transition ${
                                                        isActive ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200'
                                                    }`}
                                                >
                                                    <span className='text-sm font-semibold'>{option.label}</span>
                                                    <span className='mt-0.5 text-[11px] text-slate-500'>{option.hint}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className='mt-4'>
                                        <p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500'>Quick cadence presets</p>
                                        <div className='mt-2 grid gap-2 sm:grid-cols-2'>
                                            {cadencePresets.map(preset => {
                                                const isPresetActive = activeCadencePreset === preset.key;
                                                return (
                                                    <button
                                                        key={preset.key}
                                                        type='button'
                                                        onClick={() => applyCadencePreset(preset)}
                                                        className={`flex flex-col rounded-xl border px-3 py-2 text-left text-xs transition ${
                                                            isPresetActive
                                                                ? 'border-emerald-400 bg-gradient-to-br from-emerald-50 via-white to-white text-emerald-700 shadow-sm'
                                                                : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200'
                                                        }`}
                                                    >
                                                        <span className='text-sm font-semibold'>{preset.label}</span>
                                                        <span className='mt-0.5 text-[11px] text-slate-500'>{preset.hint}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {(scheduleForm.scheduleType === 'daily' || scheduleForm.scheduleType === 'weekly') && (
                                        <div className='mt-4 grid gap-4 md:grid-cols-2'>
                                            <div>
                                                <label className='block text-xs font-semibold uppercase tracking-wide text-slate-500'>Time of day</label>
                                                <input
                                                    type='time'
                                                    value={scheduleForm.dailyTime}
                                                    onChange={(event) => updateCadenceField({ dailyTime: event.target.value })}
                                                    className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                                                />
                                            </div>
                                            <div>
                                                <label className='block text-xs font-semibold uppercase tracking-wide text-slate-500'>Timezone</label>
                                                <input
                                                    type='text'
                                                    value={scheduleForm.timezone}
                                                    list='timezone-options'
                                                    onChange={(event) => updateCadenceField({ timezone: event.target.value })}
                                                    className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                                                    placeholder='e.g. Asia/Colombo'
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {scheduleForm.scheduleType === 'weekly' && (
                                        <div className='mt-3'>
                                            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Weekdays</p>
                                            <div className='mt-2 flex flex-wrap gap-2'>
                                                {WEEKDAY_LABELS.map((label, index) => {
                                                    const isSelected = scheduleForm.weeklyDays.includes(index);
                                                    return (
                                                        <button
                                                            key={`weekday-${label}`}
                                                            type='button'
                                                            onClick={() => toggleScheduleWeekday(index)}
                                                            className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${
                                                                isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 bg-white text-slate-600 hover:border-primary/40'
                                                            }`}
                                                        >
                                                            {label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {scheduleForm.scheduleType === 'interval' && (
                                        <div className='mt-4 grid gap-4 md:grid-cols-2'>
                                            <div>
                                                <label className='block text-xs font-semibold uppercase tracking-wide text-slate-500'>Repeat every</label>
                                                <input
                                                    type='number'
                                                    min={MIN_SCHEDULE_INTERVAL_MINUTES}
                                                    step={5}
                                                    value={scheduleForm.intervalMinutes}
                                                    onChange={(event) => updateCadenceField({ intervalMinutes: event.target.value })}
                                                    className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                                                />
                                                <p className='mt-1 text-xs text-slate-500'>Minutes between runs (minimum {MIN_SCHEDULE_INTERVAL_MINUTES} minutes ≈ 4 hours)</p>
                                            </div>
                                            <div>
                                                <label className='block text-xs font-semibold uppercase tracking-wide text-slate-500'>Timezone anchor</label>
                                                <input
                                                    type='text'
                                                    value={scheduleForm.timezone}
                                                    list='timezone-options'
                                                    onChange={(event) => updateCadenceField({ timezone: event.target.value })}
                                                    className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                                                    placeholder='e.g. Asia/Colombo'
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {scheduleForm.scheduleType === 'one_time' && (
                                        <div className='mt-4 grid gap-4 md:grid-cols-2'>
                                            <div>
                                                <label className='block text-xs font-semibold uppercase tracking-wide text-slate-500'>Run at</label>
                                                <input
                                                    type='datetime-local'
                                                    value={scheduleForm.oneTimeLocal}
                                                    onChange={(event) => updateCadenceField({ oneTimeLocal: event.target.value })}
                                                    className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                                                />
                                            </div>
                                            <div>
                                                <label className='block text-xs font-semibold uppercase tracking-wide text-slate-500'>Timezone</label>
                                                <input
                                                    type='text'
                                                    value={scheduleForm.timezone}
                                                    list='timezone-options'
                                                    onChange={(event) => updateCadenceField({ timezone: event.target.value })}
                                                    className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                                                    placeholder='e.g. Asia/Colombo'
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-500'>Limit behavior</p>
                                    <div className='mt-2 grid gap-2 sm:grid-cols-3'>
                                        {LIMIT_MODE_OPTIONS.map(option => {
                                            const isActive = scheduleForm.limitMode === option.key;
                                            return (
                                                <button
                                                    key={`limit-mode-${option.key}`}
                                                    type='button'
                                                    onClick={() => setScheduleLimitMode(option.key)}
                                                    className={`flex flex-col rounded-xl border px-3 py-2 text-left text-xs transition ${
                                                        isActive
                                                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm'
                                                            : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200'
                                                    }`}
                                                >
                                                    <span className='text-sm font-semibold'>{option.label}</span>
                                                    <span className='mt-0.5 text-[11px] text-slate-500'>{option.hint}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {scheduleForm.limitMode === 'custom' && (
                                        <div className='mt-3 grid gap-3 sm:grid-cols-2'>
                                            <div className='max-w-xs'>
                                                <label className='block text-xs font-semibold uppercase tracking-wide text-slate-500'>Max items</label>
                                                <input
                                                    type='number'
                                                    min={1}
                                                    value={scheduleForm.maxItems}
                                                    onChange={(event) => updateScheduleForm({ maxItems: event.target.value })}
                                                    className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                                                    placeholder={`e.g. ${DEFAULT_MAX_ITEMS}`}
                                                />
                                                <p className='mt-1 text-xs text-slate-500'>Stops each run after reaching this cap.</p>
                                            </div>
                                            <div className='rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600'>
                                                Helpful when you want to keep runs short or limit inventory churn for noisy categories.
                                            </div>
                                        </div>
                                    )}
                                    {scheduleForm.limitMode === 'default' && (
                                        <p className='mt-2 text-xs text-slate-500'>Follows crawler defaults (≈{DEFAULT_MAX_ITEMS} items) or any per-crawler overrides you set elsewhere.</p>
                                    )}
                                    {scheduleForm.limitMode === 'all' && (
                                        <p className='mt-2 text-xs text-slate-500'>Disables caps entirely. Expect longer runtimes while the crawler sweeps every product.</p>
                                    )}
                                </div>

                                <div className='grid gap-4 md:grid-cols-2'>
                                    <div>
                                        <label className='block text-xs font-semibold uppercase tracking-wide text-slate-500'>Batch execution</label>
                                        <select
                                            value={scheduleForm.batchMode}
                                            onChange={(event) => updateScheduleForm({ batchMode: event.target.value as ScheduleBatchMode })}
                                            className='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                                        >
                                            <option value='parallel'>Parallel</option>
                                            <option value='sequential'>Sequential</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className='block text-xs font-semibold uppercase tracking-wide text-slate-500'>Browser visibility</label>
                                        <p className='mt-1 text-xs text-slate-500'>Keep Chrome hidden on the runner with headless mode. Disable it only when you need to watch every interaction.</p>
                                        <label className='mt-2 flex gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 shadow-inner'>
                                            <input
                                                type='checkbox'
                                                className='mt-1'
                                                checked={scheduleForm.headless}
                                                onChange={(event) => updateScheduleForm({ headless: event.target.checked })}
                                            />
                                            <div>
                                                <p className='text-sm font-semibold text-slate-900'>
                                                    {scheduleForm.headless ? 'Hide browser windows (headless)' : 'Show browser windows while crawling'}
                                                </p>
                                                <p className='text-xs text-slate-500'>
                                                    {scheduleForm.headless
                                                        ? 'Chrome stays invisible so schedules can run quietly in the background.'
                                                        : 'Chrome will open visible windows so you can observe the crawler step-by-step.'}
                                                </p>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                {scheduleError && (
                                    <div className='rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
                                        {scheduleError}
                                    </div>
                                )}

                                <div className='flex flex-wrap items-center justify-end gap-2'>
                                    {isEditing && (
                                        <button
                                            type='button'
                                            onClick={resetScheduleForm}
                                            className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300'
                                        >
                                            Cancel edit
                                        </button>
                                    )}
                                    <button
                                        type='submit'
                                        disabled={scheduleSaving}
                                        className='inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/60'
                                    >
                                        {scheduleSaving ? 'Saving…' : isEditing ? 'Update schedule' : 'Create schedule'}
                                    </button>
                                </div>
                            </form>
                        )}

                        <div className='mt-6'>
                            <AutomationScheduleRail
                                schedules={sortedSchedules}
                                loading={schedulesLoading}
                                onRunNow={handleRunScheduleNow}
                                onToggle={handleToggleSchedule}
                                onEdit={handleEditSchedule}
                                onDelete={handleDeleteSchedule}
                                describeSelection={describeSelection}
                                describeTiming={describeTiming}
                            />
                        </div>
                    </>
                )}
            </div>
        );
    };

    useEffect(() => {
        if (!selectedStoreLaunch && allCrawlers.length > 0) {
            const stores = Array.from(new Set(allCrawlers.map(c => c.store))).sort();
            if (stores.length > 0) {
                setSelectedStoreLaunch(stores[0]);
            }
        }
        if (!selectedCategoryLaunch && allCrawlers.length > 0) {
            const categories = Array.from(new Set(allCrawlers.map(c => c.category))).sort();
            if (categories.length > 0) {
                setSelectedCategoryLaunch(categories[0]);
            }
        }
    }, [allCrawlers, selectedStoreLaunch, selectedCategoryLaunch]);

    const getGroupCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const crawler of allCrawlers) {
            const keyStore = `store::${crawler.store}`;
            counts[keyStore] = (counts[keyStore] ?? 0) + 1;
            const keyCategory = `category::${crawler.category}`;
            counts[keyCategory] = (counts[keyCategory] ?? 0) + 1;
        }
        counts['all'] = allCrawlers.length;
        return counts;
    }, [allCrawlers]);

    const buildSpecsFromCrawlers = useCallback((filter: (crawler: CrawlerInfo) => boolean) => {
        return allCrawlers
            .filter(filter)
            .map((crawler) => {
                const limit = crawlerLimits[`${crawler.store}:${crawler.category}`] || {};
                const useAll = limit.crawlAll ?? globalCrawlAll;
                const max = resolveMaxItems(limit.max, useAll);
                const headless = limit.headless ?? globalHeadlessMode;

                const spec: { store: string; category: string; max_items?: number; headless_mode?: boolean } = {
                    store: crawler.store,
                    category: crawler.category,
                };
                if (max !== undefined) {
                    spec.max_items = max;
                }
                if (headless) {
                    spec.headless_mode = true;
                }
                return spec;
            });
    }, [allCrawlers, crawlerLimits, globalCrawlAll, globalHeadlessMode, resolveMaxItems]);

    const deriveGroupSettings = useCallback((crawlers: CrawlerInfo[]): GroupControlState => {
        if (crawlers.length === 0) {
            return {
                max: '',
                crawlAll: globalCrawlAll,
                headless: globalHeadlessMode,
                crawlAllMixed: false,
                headlessMixed: false,
                maxMixed: false,
            };
        }

        const effective = crawlers.map((crawler) => {
            const limit = crawlerLimits[`${crawler.store}:${crawler.category}`] || {};
            const useAll = (limit.crawlAll ?? globalCrawlAll) === true;
            const headless = (limit.headless ?? globalHeadlessMode) === true;
            const resolvedMax = resolveMaxItems(limit.max, useAll) ?? undefined;
            return { useAll, headless, resolvedMax };
        });

        const allCrawlAll = effective.every(entry => entry.useAll);
        const noCrawlAll = effective.every(entry => !entry.useAll);
        const crawlAllMixed = !(allCrawlAll || noCrawlAll);

        const allHeadless = effective.every(entry => entry.headless);
        const noHeadless = effective.every(entry => !entry.headless);
        const headlessMixed = !(allHeadless || noHeadless);

        const firstMax = effective[0].resolvedMax ?? undefined;
        const maxMixed = !effective.every(entry => (entry.resolvedMax ?? null) === (firstMax ?? null));
        const maxValue = maxMixed ? '' : firstMax !== undefined ? String(firstMax) : '';

        return {
            max: maxValue,
            crawlAll: crawlAllMixed ? false : allCrawlAll,
            headless: headlessMixed ? false : allHeadless,
            crawlAllMixed,
            headlessMixed,
            maxMixed,
        };
    }, [crawlerLimits, globalCrawlAll, globalHeadlessMode, resolveMaxItems]);

    const applyGroupLimitUpdates = useCallback((scope: { store?: string; category?: string }, updates: { max?: number | undefined; crawlAll?: boolean; headless?: boolean }) => {
        const targets = allCrawlers.filter(crawler => {
            if (scope.store && crawler.store !== scope.store) return false;
            if (scope.category && crawler.category !== scope.category) return false;
            return true;
        });

        if (targets.length === 0) {
            return;
        }

        targets.forEach(target => {
            setLimitFor(target.store, target.category, updates);
        });
    }, [allCrawlers, setLimitFor]);

    useEffect(() => {
        if (!selectedStoreLaunch) {
            setStoreGroupConfig(deriveGroupSettings([]));
            return;
        }
        const relevant = allCrawlers.filter(crawler => crawler.store === selectedStoreLaunch);
        setStoreGroupConfig(deriveGroupSettings(relevant));
    }, [allCrawlers, deriveGroupSettings, selectedStoreLaunch]);

    useEffect(() => {
        if (!selectedCategoryLaunch) {
            setCategoryGroupConfig(deriveGroupSettings([]));
            return;
        }
        const relevant = allCrawlers.filter(crawler => crawler.category === selectedCategoryLaunch);
        setCategoryGroupConfig(deriveGroupSettings(relevant));
    }, [allCrawlers, deriveGroupSettings, selectedCategoryLaunch]);

    useEffect(() => {
        if (storeCrawlAllRef.current) {
            storeCrawlAllRef.current.indeterminate = storeGroupConfig.crawlAllMixed;
        }
    }, [storeGroupConfig.crawlAllMixed]);

    useEffect(() => {
        if (storeHeadlessRef.current) {
            storeHeadlessRef.current.indeterminate = storeGroupConfig.headlessMixed;
        }
    }, [storeGroupConfig.headlessMixed]);

    useEffect(() => {
        if (categoryCrawlAllRef.current) {
            categoryCrawlAllRef.current.indeterminate = categoryGroupConfig.crawlAllMixed;
        }
    }, [categoryGroupConfig.crawlAllMixed]);

    useEffect(() => {
        if (categoryHeadlessRef.current) {
            categoryHeadlessRef.current.indeterminate = categoryGroupConfig.headlessMixed;
        }
    }, [categoryGroupConfig.headlessMixed]);

    const handleStoreGroupMaxChange = useCallback((value: string) => {
        if (!selectedStoreLaunch) {
            return;
        }
        const sanitized = value.replace(/[^0-9]/g, '');
        setStoreGroupConfig(prev => ({
            ...prev,
            max: sanitized,
            maxMixed: false,
        }));
        const parsed = parseMaxItems(sanitized);
        applyGroupLimitUpdates({ store: selectedStoreLaunch }, { max: parsed });
    }, [applyGroupLimitUpdates, parseMaxItems, selectedStoreLaunch]);

    const handleCategoryGroupMaxChange = useCallback((value: string) => {
        if (!selectedCategoryLaunch) {
            return;
        }
        const sanitized = value.replace(/[^0-9]/g, '');
        setCategoryGroupConfig(prev => ({
            ...prev,
            max: sanitized,
            maxMixed: false,
        }));
        const parsed = parseMaxItems(sanitized);
        applyGroupLimitUpdates({ category: selectedCategoryLaunch }, { max: parsed });
    }, [applyGroupLimitUpdates, parseMaxItems, selectedCategoryLaunch]);

    const handleStoreGroupCrawlAllToggle = useCallback(() => {
        if (!selectedStoreLaunch) {
            return;
        }
        const nextValue = storeGroupConfig.crawlAllMixed ? true : !storeGroupConfig.crawlAll;
        setStoreGroupConfig(prev => ({
            ...prev,
            crawlAll: nextValue,
            crawlAllMixed: false,
            max: nextValue ? '' : prev.max,
            maxMixed: nextValue ? false : prev.maxMixed,
        }));
        const updates: { crawlAll: boolean; max?: number | undefined } = { crawlAll: nextValue };
        if (nextValue) {
            updates.max = undefined;
        }
        applyGroupLimitUpdates({ store: selectedStoreLaunch }, updates);
    }, [applyGroupLimitUpdates, selectedStoreLaunch, storeGroupConfig.crawlAll, storeGroupConfig.crawlAllMixed]);

    const handleCategoryGroupCrawlAllToggle = useCallback(() => {
        if (!selectedCategoryLaunch) {
            return;
        }
        const nextValue = categoryGroupConfig.crawlAllMixed ? true : !categoryGroupConfig.crawlAll;
        setCategoryGroupConfig(prev => ({
            ...prev,
            crawlAll: nextValue,
            crawlAllMixed: false,
            max: nextValue ? '' : prev.max,
            maxMixed: nextValue ? false : prev.maxMixed,
        }));
        const updates: { crawlAll: boolean; max?: number | undefined } = { crawlAll: nextValue };
        if (nextValue) {
            updates.max = undefined;
        }
        applyGroupLimitUpdates({ category: selectedCategoryLaunch }, updates);
    }, [applyGroupLimitUpdates, categoryGroupConfig.crawlAll, categoryGroupConfig.crawlAllMixed, selectedCategoryLaunch]);

    const handleStoreGroupHeadlessToggle = useCallback(() => {
        if (!selectedStoreLaunch) {
            return;
        }
        const nextValue = storeGroupConfig.headlessMixed ? true : !storeGroupConfig.headless;
        setStoreGroupConfig(prev => ({
            ...prev,
            headless: nextValue,
            headlessMixed: false,
        }));
        applyGroupLimitUpdates({ store: selectedStoreLaunch }, { headless: nextValue });
    }, [applyGroupLimitUpdates, selectedStoreLaunch, storeGroupConfig.headless, storeGroupConfig.headlessMixed]);

    const handleCategoryGroupHeadlessToggle = useCallback(() => {
        if (!selectedCategoryLaunch) {
            return;
        }
        const nextValue = categoryGroupConfig.headlessMixed ? true : !categoryGroupConfig.headless;
        setCategoryGroupConfig(prev => ({
            ...prev,
            headless: nextValue,
            headlessMixed: false,
        }));
        applyGroupLimitUpdates({ category: selectedCategoryLaunch }, { headless: nextValue });
    }, [applyGroupLimitUpdates, categoryGroupConfig.headless, categoryGroupConfig.headlessMixed, selectedCategoryLaunch]);

    // Tab render functions
    const renderMonitorTab = () => {
        if (loading && allCrawlers.length === 0) {
            return (
                <div className='space-y-6'>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div key={`monitor-skeleton-${index}`} className='rounded-xl border border-slate-200/70 bg-white/80 px-4 py-4 shadow-sm animate-pulse supports-[backdrop-filter]:bg-white/60'>
                                <div className='h-4 bg-gray-200 rounded w-1/2 mb-4'></div>
                                <div className='space-y-2'>
                                    <div className='h-3 bg-gray-200 rounded w-3/4'></div>
                                    <div className='h-3 bg-gray-200 rounded w-2/3'></div>
                                    <div className='h-3 bg-gray-200 rounded w-1/2'></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // Group crawlers by store
        const keellsCrawlers = allCrawlers.filter(crawler => crawler.store === 'keells');
        const cargillsCrawlers = allCrawlers.filter(crawler => crawler.store === 'cargills');
        const activeEntries = Object.entries(activeCrawlers).filter(([, crawler]) =>
            crawler.status === 'running' || crawler.status === 'starting'
        );
        const completedActivities = recentActivity.filter(activity => activity.status === 'completed' || activity._isPseudo);
        const otherActivities = recentActivity.filter(activity => activity.status !== 'completed');

        const launchGroup = async (
            payload: Parameters<typeof crawlerAPI.startCrawlerGroup>[0],
            label: string,
            options: { spinnerKey?: string; spinnerTarget?: 'store' | 'category' | 'all'; estimated?: number } = {}
        ) => {
            try {
                const finalPayload = {
                    ...payload,
                    batch_mode: payload.batch_mode ?? startBatchMode,
                };

                if (options.spinnerTarget === 'store') {
                    setGroupLaunching(options.spinnerKey || label);
                } else if (options.spinnerTarget === 'category') {
                    setCategoryLaunching(options.spinnerKey || label);
                } else if (options.spinnerTarget === 'all') {
                    setStartingAll(true);
                }

                const estimated = options.estimated ?? getGroupCounts['all'];
                const modeLabel = finalPayload.batch_mode === 'sequential' ? 'sequentially' : 'in parallel';
                const countText = estimated ? ` (${formatNumber(estimated)} crawlers)` : '';
                info('Starting Crawler Group', `Launching ${label}${countText} ${modeLabel}.`);

                await crawlerAPI.startCrawlerGroup(finalPayload);
                success('Group Launch Started', `Started ${label}. Monitoring will update shortly.`);
                quickRefresh();
            } catch (error) {
                console.error('Failed to start crawler group:', error);
                const message = error instanceof Error ? error.message : 'Failed to start group';
                showError('Group Start Failed', message);
            } finally {
                if (options.spinnerTarget === 'store') {
                    setGroupLaunching(null);
                } else if (options.spinnerTarget === 'category') {
                    setCategoryLaunching(null);
                } else if (options.spinnerTarget === 'all') {
                    setStartingAll(false);
                }
            }
        };

        const handleStoreLaunch = async (store: string) => {
            const specs = buildSpecsFromCrawlers(crawler => crawler.store === store);
            if (specs.length === 0) {
                warning('No Crawlers', `No crawlers configured for ${store}.`);
                return;
            }
            await launchGroup(
                { mode: 'custom', crawlers: specs },
                `${store.charAt(0).toUpperCase() + store.slice(1)} store crawlers`,
                { spinnerTarget: 'store', spinnerKey: store, estimated: specs.length }
            );
        };

        const handleCategoryLaunch = async (category: string) => {
            const specs = buildSpecsFromCrawlers(crawler => crawler.category === category);
            if (specs.length === 0) {
                warning('No Crawlers', `No crawlers found for ${category}.`);
                return;
            }
            await launchGroup(
                { mode: 'custom', crawlers: specs },
                `${category.replace('_', ' ')} category crawlers`,
                { spinnerTarget: 'category', spinnerKey: category, estimated: specs.length }
            );
        };

        const storeOptions = getUniqueStores();
        const categoryOptions = getUniqueCategories();
        const selectedStoreCount = selectedStoreLaunch ? getGroupCounts[`store::${selectedStoreLaunch}`] ?? 0 : 0;
        const selectedCategoryCount = selectedCategoryLaunch ? getGroupCounts[`category::${selectedCategoryLaunch}`] ?? 0 : 0;
        
        return (
            <div className='space-y-6'>
                {renderScheduleSection()}

                {/* Group Launch Controls */}
                <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                    <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                        <div className='mb-3 flex items-center justify-between gap-2'>
                            <h3 className='flex items-center gap-2 text-base font-semibold text-slate-900'>
                                <Play size={16} className='text-primary' />
                                Launch by store
                            </h3>
                            <span className='rounded-full border border-slate-200 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500'>
                                {formatNumber(selectedStoreCount)} crawlers
                            </span>
                        </div>
                        <p className='mb-4 text-xs text-slate-500'>Start every crawler for a selected retailer using the current execution mode.</p>
                        <div className='flex flex-col gap-3 sm:flex-row'>
                            <select
                                value={selectedStoreLaunch}
                                onChange={(event) => setSelectedStoreLaunch(event.target.value)}
                                className='h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                                disabled={storeOptions.length === 0}
                            >
                                {storeOptions.map((store: string) => (
                                    <option key={store} value={store}>
                                        {store.charAt(0).toUpperCase() + store.slice(1)}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={() => void handleStoreLaunch(selectedStoreLaunch)}
                                disabled={!selectedStoreLaunch || selectedStoreCount === 0 || groupLaunching === selectedStoreLaunch}
                                className='inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500'
                            >
                                <Play size={16} className={groupLaunching === selectedStoreLaunch ? 'animate-spin text-white/70' : 'text-white'} />
                                {groupLaunching === selectedStoreLaunch ? 'Launching…' : 'Launch store'}
                            </button>
                        </div>
                        <div className='mt-4 rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3 text-xs text-slate-600 supports-[backdrop-filter]:bg-white/60'>
                            <div className='flex flex-wrap items-center justify-between gap-2'>
                                <span className='font-semibold uppercase tracking-[0.18em] text-slate-500'>Run settings</span>
                                {storeGroupConfig.maxMixed && (
                                    <span className='text-[11px] text-slate-400'>Mixed max items – updating will sync all crawlers</span>
                                )}
                            </div>
                            <div className='mt-2 flex flex-wrap items-center gap-4'>
                                <label className='flex items-center gap-2'>
                                    <span className='text-slate-500'>Max items</span>
                                    <input
                                        type='text'
                                        inputMode='numeric'
                                        pattern='[0-9]*'
                                        value={storeGroupConfig.max}
                                        onChange={(event) => handleStoreGroupMaxChange(event.target.value)}
                                        placeholder={storeGroupConfig.maxMixed ? 'Mixed' : 'Default 50'}
                                        disabled={storeGroupConfig.crawlAll || !selectedStoreLaunch}
                                        className='h-8 w-20 rounded border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-slate-100'
                                    />
                                </label>
                                <label className='flex items-center gap-2'>
                                    <input
                                        ref={storeCrawlAllRef}
                                        type='checkbox'
                                        checked={storeGroupConfig.crawlAll}
                                        onChange={handleStoreGroupCrawlAllToggle}
                                        disabled={!selectedStoreLaunch}
                                        className='h-4 w-4 rounded border border-slate-300 text-primary focus:ring-primary/40 disabled:cursor-not-allowed'
                                    />
                                    Crawl all
                                </label>
                                <label className='flex items-center gap-2'>
                                    <input
                                        ref={storeHeadlessRef}
                                        type='checkbox'
                                        checked={storeGroupConfig.headless}
                                        onChange={handleStoreGroupHeadlessToggle}
                                        disabled={!selectedStoreLaunch}
                                        className='h-4 w-4 rounded border border-slate-300 text-primary focus:ring-primary/40 disabled:cursor-not-allowed'
                                    />
                                    Headless
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                        <div className='mb-3 flex items-center justify-between gap-2'>
                            <h3 className='flex items-center gap-2 text-base font-semibold text-slate-900'>
                                <Play size={16} className='text-primary' />
                                Launch by category
                            </h3>
                            <span className='rounded-full border border-slate-200 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500'>
                                {formatNumber(selectedCategoryCount)} crawlers
                            </span>
                        </div>
                        <p className='mb-4 text-xs text-slate-500'>Kick off the chosen assortment across every store that supports it.</p>
                        <div className='flex flex-col gap-3 sm:flex-row'>
                            <select
                                value={selectedCategoryLaunch}
                                onChange={(event) => setSelectedCategoryLaunch(event.target.value)}
                                className='h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm capitalize focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                                disabled={categoryOptions.length === 0}
                            >
                                {categoryOptions.map((category: string) => (
                                    <option key={category} value={category}>
                                        {category.replace('_', ' ')}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={() => void handleCategoryLaunch(selectedCategoryLaunch)}
                                disabled={!selectedCategoryLaunch || selectedCategoryCount === 0 || categoryLaunching === selectedCategoryLaunch}
                                className='inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500'
                            >
                                <Play size={16} className={categoryLaunching === selectedCategoryLaunch ? 'animate-spin text-white/70' : 'text-white'} />
                                {categoryLaunching === selectedCategoryLaunch ? 'Launching…' : 'Launch category'}
                            </button>
                        </div>
                        <div className='mt-4 rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3 text-xs text-slate-600 supports-[backdrop-filter]:bg-white/60'>
                            <div className='flex flex-wrap items-center justify-between gap-2'>
                                <span className='font-semibold uppercase tracking-[0.18em] text-slate-500'>Run settings</span>
                                {categoryGroupConfig.maxMixed && (
                                    <span className='text-[11px] text-slate-400'>Mixed max items – updating will sync all crawlers</span>
                                )}
                            </div>
                            <div className='mt-2 flex flex-wrap items-center gap-4'>
                                <label className='flex items-center gap-2'>
                                    <span className='text-slate-500'>Max items</span>
                                    <input
                                        type='text'
                                        inputMode='numeric'
                                        pattern='[0-9]*'
                                        value={categoryGroupConfig.max}
                                        onChange={(event) => handleCategoryGroupMaxChange(event.target.value)}
                                        placeholder={categoryGroupConfig.maxMixed ? 'Mixed' : 'Default 50'}
                                        disabled={categoryGroupConfig.crawlAll || !selectedCategoryLaunch}
                                        className='h-8 w-20 rounded border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-slate-100'
                                    />
                                </label>
                                <label className='flex items-center gap-2'>
                                    <input
                                        ref={categoryCrawlAllRef}
                                        type='checkbox'
                                        checked={categoryGroupConfig.crawlAll}
                                        onChange={handleCategoryGroupCrawlAllToggle}
                                        disabled={!selectedCategoryLaunch}
                                        className='h-4 w-4 rounded border border-slate-300 text-primary focus:ring-primary/40 disabled:cursor-not-allowed'
                                    />
                                    Crawl all
                                </label>
                                <label className='flex items-center gap-2'>
                                    <input
                                        ref={categoryHeadlessRef}
                                        type='checkbox'
                                        checked={categoryGroupConfig.headless}
                                        onChange={handleCategoryGroupHeadlessToggle}
                                        disabled={!selectedCategoryLaunch}
                                        className='h-4 w-4 rounded border border-slate-300 text-primary focus:ring-primary/40 disabled:cursor-not-allowed'
                                    />
                                    Headless
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Active Crawlers Section - Only show running crawlers */}
                {activeEntries.length > 0 && (
                    <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                        <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
                            <h3 className='text-lg font-semibold text-slate-900'>Active Crawlers</h3>
                            <span className='text-xs font-medium text-slate-500'>{formatNumber(activeEntries.length)} running</span>
                        </div>
                        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                            {activeEntries.map(([crawlerId, crawler]) => {
                                const storeStyle = getStoreStyle(crawler.store);
                                const statusStyle = getStatusStyle(crawler.status);
                                const rawTarget = crawler.max_items ||
                                    crawler.config?.max_items ||
                                    crawler.config?.target_items ||
                                    crawler.config?.items_limit ||
                                    (crawler.progress && crawler.items_found
                                        ? Math.round(crawler.items_found / (crawler.progress / 100))
                                        : null);
                                const target = typeof rawTarget === 'number' && !Number.isNaN(rawTarget) && rawTarget > 0 ? rawTarget : null;

                                let progressPercent = 0;
                                if (typeof crawler.items_found === 'number' && target) {
                                    progressPercent = Math.min(100, (crawler.items_found / target) * 100);
                                } else if (typeof crawler.progress === 'number') {
                                    progressPercent = Math.max(0, Math.min(100, crawler.progress));
                                } else if (typeof crawler.items_found === 'number' && crawler.items_found > 0) {
                                    const estimatedTarget = 100;
                                    progressPercent = Math.min(100, (crawler.items_found / estimatedTarget) * 100);
                                }

                                const startedAt = crawler.start_time ? new Date(crawler.start_time) : null;
                                const limitConfig = getLimitFor(crawler.store, crawler.category);
                                const targetLabel = (() => {
                                    const useAll = limitConfig.crawlAll ?? globalCrawlAll;
                                    if (useAll) return 'Target: Unlimited';
                                    const max = resolveMaxItems(limitConfig.max, useAll) ?? DEFAULT_MAX_ITEMS;
                                    return `Target: Max ${max}`;
                                })();

                                return (
                                    <motion.div
                                        key={crawlerId}
                                        layout
                                        whileHover={{ y: -4, scale: 1.01 }}
                                        className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm transition-all duration-200 supports-[backdrop-filter]:bg-white/60 ${storeStyle.hover}`}
                                    >
                                        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${storeStyle.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />

                                        <div className='relative flex items-start justify-between gap-3'>
                                            <div>
                                                <div className='flex items-center gap-2'>
                                                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${storeStyle.chip}`}>
                                                        {crawler.store}
                                                    </span>
                                                    <span className='text-xs font-medium text-slate-500'>ID: {crawlerId}</span>
                                                </div>
                                                <h4 className='mt-3 text-base font-semibold text-slate-900 capitalize'>
                                                    {crawler.category.replace('_', ' ')}
                                                </h4>
                                                {crawler.current_step && (
                                                    <p className='mt-1 text-xs font-medium text-slate-500'>{crawler.current_step}</p>
                                                )}
                                            </div>
                                            <div className={`relative rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusStyle.className}`}>
                                                {crawler.status === 'uploading' ? (
                                                    <span className="flex items-center gap-1">
                                                        <span className="animate-spin rounded-full h-3 w-3 border-2 border-current border-t-transparent"></span>
                                                        Uploading Cloud
                                                    </span>
                                                ) : (
                                                    statusStyle.label
                                                )}
                                            </div>
                                        </div>

                                        <div className='relative mt-4 grid gap-3 sm:grid-cols-2'>
                                            <div className='rounded-xl border border-white/60 bg-white/90 p-3 shadow-inner shadow-slate-200/40'>
                                                <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-500'>Items Found</p>
                                                <p className='mt-2 text-xl font-semibold text-slate-900'>
                                                    {typeof crawler.items_found === 'number' ? formatNumber(crawler.items_found) : '—'}
                                                    {typeof crawler.items_found === 'number' && target && (
                                                        <span className='ml-1 text-sm font-medium text-slate-400'>/ {formatNumber(target)}</span>
                                                    )}
                                                </p>
                                            </div>
                                            <div className='rounded-xl border border-white/60 bg-white/90 p-3 shadow-inner shadow-slate-200/40'>
                                                <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-500'>Progress</p>
                                                <div className='mt-3 flex items-center gap-3'>
                                                    <div className='h-2 flex-1 rounded-full bg-slate-200/80'>
                                                        <motion.div
                                                            initial={false}
                                                            animate={{ width: `${progressPercent}%` }}
                                                            className='h-2 rounded-full bg-primary'
                                                        />
                                                    </div>
                                                    <span className='text-sm font-semibold text-slate-700'>{Math.round(progressPercent)}%</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className='relative mt-4 rounded-xl border border-dashed border-slate-200 bg-white/85 p-3'>
                                            <div className='flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-slate-600'>
                                                <span className='text-slate-700'>Run settings</span>
                                                <span className='rounded-full border border-slate-200 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500'>
                                                    {targetLabel}
                                                </span>
                                            </div>
                                            <div className='mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600'>
                                                <input
                                                    type='number'
                                                    min={1}
                                                    placeholder='Max items'
                                                    value={limitConfig.max !== undefined ? String(limitConfig.max) : ''}
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        const num = raw ? Math.max(1, Number(raw)) : undefined;
                                                        setLimitFor(crawler.store, crawler.category, { max: num });
                                                    }}
                                                    disabled={crawler.status === 'running' || crawler.status === 'starting'}
                                                    className='h-9 w-28 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-slate-100'
                                                />
                                                <label className='flex items-center gap-2 font-medium'>
                                                    <input
                                                        type='checkbox'
                                                        checked={!!limitConfig.crawlAll}
                                                        onChange={(e) => setLimitFor(crawler.store, crawler.category, { crawlAll: e.target.checked })}
                                                        disabled={crawler.status === 'running' || crawler.status === 'starting'}
                                                        className='h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30 disabled:cursor-not-allowed'
                                                    />
                                                    Crawl all
                                                </label>
                                                <label className='flex items-center gap-2 font-medium' title='Run without showing browser window (faster)'>
                                                    <input
                                                        type='checkbox'
                                                        checked={limitConfig.headless ?? globalHeadlessMode}
                                                        onChange={(e) => setLimitFor(crawler.store, crawler.category, { headless: e.target.checked })}
                                                        disabled={crawler.status === 'running' || crawler.status === 'starting'}
                                                        className='h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30 disabled:cursor-not-allowed'
                                                    />
                                                    Headless
                                                </label>
                                            </div>
                                        </div>

                                        <div className='relative mt-4 flex flex-wrap items-center gap-3'>
                                            {crawler.status === 'running' ? (
                                                <button
                                                    onClick={() => handleStopCrawler(crawlerId)}
                                                    className='flex-1 rounded-lg border border-rose-200 bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md'
                                                >
                                                    <Stop size={14} className='mr-1 inline' />
                                                    Stop
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleStartCrawler(crawler.store, crawler.category)}
                                                    disabled={!crawlerStatus.available}
                                                    className={`flex-1 rounded-lg bg-gradient-to-r ${storeStyle.cta} px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500`}
                                                >
                                                    <Play size={14} className='mr-1 inline' />
                                                    {crawler.status === 'completed' ? 'Restart' : 'Start'}
                                                </button>
                                            )}
                                            {startedAt && (
                                                <span className='text-xs font-medium text-slate-500'>
                                                    Started {startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Keells Crawlers */}
                <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                    <div className='mb-4 flex items-center justify-between gap-3'>
                        <h3 className='flex items-center gap-2 text-lg font-semibold text-slate-900'>
                            <span className='inline-block h-3 w-3 rounded-full bg-blue-500'></span>
                            Keells Crawlers
                        </h3>
                        <span className='text-xs font-medium text-slate-500'>{formatNumber(keellsCrawlers.length)} configured</span>
                    </div>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                        {keellsCrawlers.map((crawler) => {
                            const currentStatus = getCrawlerDisplayStatus(crawler.store, crawler.category);
                            const isRunning = currentStatus.status === 'running' || currentStatus.status === 'starting';
                            const isCompleted = currentStatus.status === 'completed';
                            const isInactive = currentStatus.status === 'inactive';
                            const storeStyle = getStoreStyle(crawler.store);
                            const statusStyle = getStatusStyle(isInactive ? 'inactive' : currentStatus.status);
                            const limitConfig = getLimitFor(crawler.store, crawler.category);
                            const targetLabel = (() => {
                                const useAll = limitConfig.crawlAll ?? globalCrawlAll;
                                if (useAll) return 'Target: Unlimited';
                                const max = resolveMaxItems(limitConfig.max, useAll) ?? (crawler.config?.max_items ?? DEFAULT_MAX_ITEMS);
                                return `Target: Max ${max}`;
                            })();
                            const itemsFound = typeof currentStatus.items_found === 'number' ? formatNumber(currentStatus.items_found) : '—';
                            const completedAt = currentStatus.timestamp ? new Date(currentStatus.timestamp) : null;
                            const lastRunLabel = completedAt
                                ? `${completedAt.toLocaleDateString()} • ${completedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                : 'No recent runs';

                            const actionConfig = isRunning
                                ? {
                                    mode: 'stop' as const,
                                    label: 'Stop',
                                    disabled: !currentStatus.crawler_id,
                                    onClick: () => {
                                        if (currentStatus.crawler_id) {
                                            handleStopCrawler(currentStatus.crawler_id);
                                        }
                                    }
                                }
                                : {
                                    mode: 'start' as const,
                                    label: isCompleted ? 'Restart' : 'Start',
                                    disabled: !crawlerStatus.available,
                                    onClick: () => handleStartCrawler(crawler.store, crawler.category),
                                    gradientClass: storeStyle.cta
                                };

                            return (
                                <CrawlerCard
                                    key={`${crawler.store}-${crawler.category}`}
                                    storeLabel='Keells'
                                    badgeText={crawler.config?.category || 'Products'}
                                    categoryLabel={crawler.config?.name || crawler.category.replace('_', ' ')}
                                    crawlerIdLabel={currentStatus.crawler_id || undefined}
                                    statusLabel={isInactive ? 'Ready' : statusStyle.label}
                                    statusClassName={statusStyle.className}
                                    itemsFoundLabel={itemsFound}
                                    lastRunLabel={lastRunLabel}
                                    targetLabel={targetLabel}
                                    maxValue={limitConfig.max !== undefined ? String(limitConfig.max) : ''}
                                    disableSettings={isRunning}
                                    onMaxChange={(value) => setLimitFor(crawler.store, crawler.category, { max: value })}
                                    onToggleCrawlAll={(checked) => setLimitFor(crawler.store, crawler.category, { crawlAll: checked })}
                                    onToggleHeadless={(checked) => setLimitFor(crawler.store, crawler.category, { headless: checked })}
                                    crawlAllChecked={!!limitConfig.crawlAll}
                                    headlessChecked={limitConfig.headless ?? globalHeadlessMode}
                                    helperText={isRunning ? 'Crawler active now' : isCompleted ? 'Last run completed' : 'Standing by'}
                                    gradientClass={storeStyle.gradient}
                                    hoverClass={storeStyle.hover}
                                    storeChipClass={storeStyle.chip}
                                    action={actionConfig}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Cargills Crawlers */}
                <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                    <div className='mb-4 flex items-center justify-between gap-3'>
                        <h3 className='flex items-center gap-2 text-lg font-semibold text-slate-900'>
                            <span className='inline-block h-3 w-3 rounded-full bg-orange-500'></span>
                            Cargills Crawlers
                        </h3>
                        <span className='text-xs font-medium text-slate-500'>{formatNumber(cargillsCrawlers.length)} configured</span>
                    </div>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                        {cargillsCrawlers.map((crawler) => {
                            const currentStatus = getCrawlerDisplayStatus(crawler.store, crawler.category);
                            const isRunning = currentStatus.status === 'running' || currentStatus.status === 'starting';
                            const isCompleted = currentStatus.status === 'completed';
                            const isInactive = currentStatus.status === 'inactive';
                            const storeStyle = getStoreStyle(crawler.store);
                            const statusStyle = getStatusStyle(isInactive ? 'inactive' : currentStatus.status);
                            const limitConfig = getLimitFor(crawler.store, crawler.category);
                            const targetLabel = (() => {
                                const useAll = limitConfig.crawlAll ?? globalCrawlAll;
                                if (useAll) return 'Target: Unlimited';
                                const max = resolveMaxItems(limitConfig.max, useAll) ?? (crawler.config?.max_items ?? DEFAULT_MAX_ITEMS);
                                return `Target: Max ${max}`;
                            })();
                            const itemsFound = typeof currentStatus.items_found === 'number' ? formatNumber(currentStatus.items_found) : '—';
                            const completedAt = currentStatus.timestamp ? new Date(currentStatus.timestamp) : null;
                            const lastRunLabel = completedAt
                                ? `${completedAt.toLocaleDateString()} • ${completedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                : 'No recent runs';

                            const actionConfig = isRunning
                                ? {
                                    mode: 'stop' as const,
                                    label: 'Stop',
                                    disabled: !currentStatus.crawler_id,
                                    onClick: () => {
                                        if (currentStatus.crawler_id) {
                                            handleStopCrawler(currentStatus.crawler_id);
                                        }
                                    }
                                }
                                : {
                                    mode: 'start' as const,
                                    label: isCompleted ? 'Restart' : 'Start',
                                    disabled: !crawlerStatus.available,
                                    onClick: () => handleStartCrawler(crawler.store, crawler.category),
                                    gradientClass: storeStyle.cta
                                };

                            return (
                                <CrawlerCard
                                    key={`${crawler.store}-${crawler.category}`}
                                    storeLabel='Cargills'
                                    badgeText={crawler.config?.category || 'Products'}
                                    categoryLabel={crawler.config?.name || crawler.category.replace('_', ' ')}
                                    crawlerIdLabel={currentStatus.crawler_id || undefined}
                                    statusLabel={isInactive ? 'Ready' : statusStyle.label}
                                    statusClassName={statusStyle.className}
                                    itemsFoundLabel={itemsFound}
                                    lastRunLabel={lastRunLabel}
                                    targetLabel={targetLabel}
                                    maxValue={limitConfig.max !== undefined ? String(limitConfig.max) : ''}
                                    disableSettings={isRunning}
                                    onMaxChange={(value) => setLimitFor(crawler.store, crawler.category, { max: value })}
                                    onToggleCrawlAll={(checked) => setLimitFor(crawler.store, crawler.category, { crawlAll: checked })}
                                    onToggleHeadless={(checked) => setLimitFor(crawler.store, crawler.category, { headless: checked })}
                                    crawlAllChecked={!!limitConfig.crawlAll}
                                    headlessChecked={limitConfig.headless ?? globalHeadlessMode}
                                    helperText={isRunning ? 'Crawler active now' : isCompleted ? 'Last run completed' : 'Standing by'}
                                    gradientClass={storeStyle.gradient}
                                    hoverClass={storeStyle.hover}
                                    storeChipClass={storeStyle.chip}
                                    action={actionConfig}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Recent Activity - Show completed crawlers in table format */}
                {completedActivities.length > 0 && (
                    <div className='space-y-4 rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                            <div className='flex items-center gap-3'>
                                <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-sm'>
                                    <Activity size={20} />
                                </div>
                                <div>
                                    <h3 className='text-lg font-semibold text-slate-900'>
                                        Crawler Results ({formatNumber(completedActivities.length)})
                                    </h3>
                                    <p className='text-sm text-slate-500'>Latest completed runs with preserved telemetry</p>
                                </div>
                            </div>
                            <button
                                onClick={clearRecentActivity}
                                className='inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100'
                            >
                                <Trash size={16} />
                                Clear All
                            </button>
                        </div>

                        <div className='hidden overflow-hidden rounded-xl border border-slate-200 bg-white lg:block'>
                            <div className='overflow-x-auto'>
                                <table className='w-full text-sm'>
                                    <thead className='bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500'>
                                        <tr>
                                            <th className='px-6 py-3 text-left'>Store / Category</th>
                                            <th className='px-6 py-3 text-left'>Status</th>
                                            <th className='px-6 py-3 text-left'>Items Found</th>
                                            <th className='px-6 py-3 text-left'>Completed</th>
                                            <th className='px-6 py-3 text-left'>Crawler ID</th>
                                            <th className='px-6 py-3 text-right'>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className='divide-y divide-gray-200 bg-white'>
                                        {completedActivities.slice(0, 50).map((activity, index) => {
                                            const isPseudo = activity._isPseudo || false;
                                            const itemCount = activity.items_found || activity.count || activity.total_products || (activity.items ? activity.items.length : 0) || 0;
                                            const completedTime = activity.timestamp ? new Date(activity.timestamp) : null;
                                            const isRecent = completedTime && (new Date().getTime() - completedTime.getTime()) < 24 * 60 * 60 * 1000;

                                            return (
                                                <tr key={index} className='transition-colors hover:bg-slate-50'>
                                                    <td className='whitespace-nowrap px-6 py-4'>
                                                        <div className='flex items-center space-x-3'>
                                                            <div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-purple-100'>
                                                                <DocumentText1 size={18} className='text-blue-600' />
                                                            </div>
                                                            <div>
                                                                <div className='flex items-center gap-2'>
                                                                    <span className='text-sm font-semibold capitalize text-slate-900'>{activity.store}</span>
                                                                    <span className='text-slate-300'>-</span>
                                                                    <span className='text-sm capitalize text-slate-600'>{activity.category?.replace('_', ' ')}</span>
                                                                </div>
                                                                {isRecent && (
                                                                    <span className='mt-1 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-100'>
                                                                        New
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className='whitespace-nowrap px-6 py-4'>
                                                        <div className='flex flex-col gap-1'>
                                                            <span className='inline-flex w-fit items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700'>
                                                                completed
                                                            </span>
                                                            {isPseudo && (
                                                                <span className='inline-flex w-fit items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700'>
                                                                     File Only
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className='whitespace-nowrap px-6 py-4'>
                                                        <div className='text-sm font-semibold text-slate-900'>{itemCount}</div>
                                                    </td>
                                                    <td className='whitespace-nowrap px-6 py-4'>
                                                        <div className='text-sm text-slate-700'>
                                                            {completedTime ? (
                                                                <>
                                                                    <div>{completedTime.toLocaleDateString()}</div>
                                                                    <div className='text-xs text-slate-500'>{completedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                                </>
                                                            ) : 'Unknown'}
                                                        </div>
                                                    </td>
                                                    <td className='px-6 py-4'>
                                                        <div className='max-w-xs truncate text-xs font-mono text-slate-500' title={activity.crawler_id}>
                                                            {activity.crawler_id}
                                                        </div>
                                                    </td>
                                                    <td className='whitespace-nowrap px-6 py-4 text-right'>
                                                        <div className='flex items-center justify-end gap-2'>
                                                            <button
                                                                onClick={() => {
                                                                    if (isPseudo) {
                                                                        viewFileContent(activity.store, activity.output_file);
                                                                    } else {
                                                                        const resultKey = findResultKeyForActivity(activity);
                                                                        if (resultKey && crawlerResults[resultKey]) {
                                                                            setFileViewModal({
                                                                                open: true,
                                                                                store: activity.store,
                                                                                filename: `${resultKey}_results.json`,
                                                                                content: crawlerResults[resultKey]
                                                                            });
                                                                        }
                                                                    }
                                                                }}
                                                                className='rounded-lg p-2 text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600'
                                                                title='View'
                                                            >
                                                                <Eye size={18} />
                                                            </button>
                                                            {itemCount > 0 && (
                                                                <button
                                                                    onClick={() => {
                                                                        if (isPseudo) {
                                                                            loadFileAndSendToClassifier(activity.store, activity.output_file);
                                                                        } else {
                                                                            const resultKey = findResultKeyForActivity(activity);
                                                                            if (resultKey && crawlerResults[resultKey]?.items) {
                                                                                sendFileToClassifier(crawlerResults[resultKey].items);
                                                                            }
                                                                        }
                                                                    }}
                                                                    className='flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90'
                                                                    title='Send to Classifier'
                                                                >
                                                                    <ArrowUp2 size={16} />
                                                                    <span>Send to Classifier</span>
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    await removeRecentActivity(activity);
                                                                }}
                                                                className='rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500'
                                                                title='Remove from recent activities'
                                                            >
                                                                <Trash size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className='space-y-3 lg:hidden'>
                            {completedActivities.slice(0, 50).map((activity, index) => {
                                const isPseudo = activity._isPseudo || false;
                                const itemCount = activity.items_found || activity.count || activity.total_products || (activity.items ? activity.items.length : 0) || 0;
                                const completedTime = activity.timestamp ? new Date(activity.timestamp) : null;
                                const isRecent = completedTime && (new Date().getTime() - completedTime.getTime()) < 24 * 60 * 60 * 1000;
                                const resultKey = findResultKeyForActivity(activity);

                                const handleView = () => {
                                    if (isPseudo) {
                                        viewFileContent(activity.store, activity.output_file);
                                        return;
                                    }
                                    if (resultKey && crawlerResults[resultKey]) {
                                        setFileViewModal({
                                            open: true,
                                            store: activity.store,
                                            filename: `${resultKey}_results.json`,
                                            content: crawlerResults[resultKey]
                                        });
                                    }
                                };

                                const handleSendToClassifier = () => {
                                    if (isPseudo) {
                                        loadFileAndSendToClassifier(activity.store, activity.output_file);
                                        return;
                                    }
                                    if (resultKey && crawlerResults[resultKey]?.items) {
                                        sendFileToClassifier(crawlerResults[resultKey].items);
                                    }
                                };

                                return (
                                    <div key={`${activity.store}-${activity.category}-${index}`} className='rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm'>
                                        <div className='flex flex-wrap items-start justify-between gap-3'>
                                            <div className='min-w-0'>
                                                <p className='text-sm font-semibold capitalize text-slate-900 truncate'>{activity.store}</p>
                                                <p className='text-xs capitalize text-slate-500 truncate'>{activity.category?.replace('_', ' ') || '—'}</p>
                                                {isRecent && (
                                                    <span className='mt-1 inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium text-blue-700 bg-blue-100'>
                                                        New
                                                    </span>
                                                )}
                                            </div>
                                            <div className='flex flex-col items-end gap-1'>
                                                <span className='inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-green-700'>
                                                    completed
                                                </span>
                                                {isPseudo && (
                                                    <span className='inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-[11px] font-semibold text-yellow-700'>
                                                         File Only
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className='mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600'>
                                            <div className='rounded-lg bg-slate-50 px-3 py-2'>
                                                <p className='text-[11px] uppercase tracking-wide text-slate-500'>Items</p>
                                                <p className='text-sm font-semibold text-slate-900'>{itemCount}</p>
                                            </div>
                                            <div className='rounded-lg bg-slate-50 px-3 py-2'>
                                                <p className='text-[11px] uppercase tracking-wide text-slate-500'>Completed</p>
                                                <p className='text-sm font-semibold text-slate-900'>
                                                    {completedTime ? completedTime.toLocaleDateString() : 'Unknown'}
                                                </p>
                                                {completedTime && (
                                                    <p className='text-[11px] text-slate-500'>
                                                        {completedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                )}
                                            </div>
                                            <div className='col-span-2 rounded-lg bg-slate-50 px-3 py-2'>
                                                <p className='text-[11px] uppercase tracking-wide text-slate-500'>Crawler ID</p>
                                                <p className='truncate font-mono text-xs text-slate-500'>
                                                    {activity.crawler_id || '—'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className='mt-3 flex flex-wrap gap-2'>
                                            <button
                                                onClick={handleView}
                                                className='inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700'
                                            >
                                                <Eye size={16} />
                                                View
                                            </button>
                                            {itemCount > 0 && (
                                                <button
                                                    onClick={handleSendToClassifier}
                                                    className='inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary/90'
                                                >
                                                    <ArrowUp2 size={16} />
                                                    Classify
                                                </button>
                                            )}
                                            <button
                                                onClick={() => removeRecentActivity(activity)}
                                                className='inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100'
                                            >
                                                <Trash size={16} />
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {completedActivities.length > 50 && (
                            <p className='text-center text-sm text-slate-500'>
                                Showing 50 of {formatNumber(completedActivities.length)} total results
                            </p>
                        )}
                    </div>
                )}

                {/* General Recent Activity (all other activities) - Modernized */}
                {otherActivities.length > 0 && (
                    <div className='space-y-4 rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                            <div className='flex items-center gap-3'>
                                <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-sm'>
                                    <Activity size={20} />
                                </div>
                                <div>
                                    <h3 className='text-lg font-semibold text-slate-900'>Other Recent Activity</h3>
                                    <p className='text-sm text-slate-500'>Running and failed crawler activities</p>
                                </div>
                            </div>
                            <button
                                onClick={async () => {
                                    const activitiesToClear = recentActivity.filter(activity => activity.status !== 'completed');
                                    if (activitiesToClear.length === 0) {
                                        warning('No Activities', 'There are no other activities to clear');
                                        return;
                                    }

                                    try {
                                        const confirmed = await confirm(
                                            'Clear Other Activities',
                                            `Are you sure you want to clear all ${activitiesToClear.length} other activities? This action cannot be undone.`
                                        );

                                        if (!confirmed) return;

                                        setPauseAutoRefresh(true);

                                        try {
                                            await crawlerAPI.clearActivities([], true);
                                            console.log('Backend activities cleared successfully');
                                        } catch (backendError) {
                                            console.error('Backend clear failed:', backendError);
                                            showError('Backend Clear Failed', 'Failed to clear activities on the backend. Some activities may reappear after refresh.');
                                        }

                                        const now = new Date().toISOString();
                                        const activities = activitiesToClear.map(activity => {
                                            const activityTimestamp = activity.timestamp || activity.completed_at;
                                            return {
                                                id: generateActivityId(activity.store, activity.category, activity.crawler_id, activityTimestamp),
                                                store: activity.store,
                                                category: activity.category,
                                                crawler_id: activity.crawler_id || '',
                                                original_timestamp: activityTimestamp || now,
                                                cleared_at: now
                                            };
                                        });

                                        await SQLiteDB.insertManyClearedActivities(activities);
                                        await SQLiteDB.cleanupOldClearedActivities(50);

                                        const allCleared = await SQLiteDB.getAllClearedActivities();
                                        setSavedRecentActivity(allCleared);

                                        setRecentActivity(prev => prev.filter(activity => activity.status === 'completed'));

                                        success('Cleared', `All ${activitiesToClear.length} other activities have been cleared`);

                                        setTimeout(() => setPauseAutoRefresh(false), 2500);
                                    } catch (error) {
                                        console.error('Error clearing other activities:', error);
                                        showError('Clear Failed', 'Failed to clear other activities. Please try again.');
                                        setPauseAutoRefresh(false);
                                    }
                                }}
                                className='inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-100'
                            >
                                <Trash size={16} />
                                Clear All
                            </button>
                        </div>
                        
                        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
                            {otherActivities.map((activity, index) => {
                                const itemCount = activity.items_found || activity.count || activity.total_products || (activity.items ? activity.items.length : 0) || 0;
                                const activityTime = activity.timestamp ? new Date(activity.timestamp) : null;
                                const isRecent = activityTime && (new Date().getTime() - activityTime.getTime()) < 24 * 60 * 60 * 1000;

                                return (
                                    <div
                                        key={index}
                                        className='group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg supports-[backdrop-filter]:bg-white/60'
                                    >
                                        <div className='pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-b from-orange-50/60 via-transparent to-red-50/50' />

                                        <div className='mb-4 flex items-start justify-between gap-3'>
                                            <div className='flex-1'>
                                                <div className='mb-1 flex items-center gap-2'>
                                                    <h4 className='text-base font-semibold capitalize text-slate-900'>{activity.store}</h4>
                                                    <span className='text-slate-300'>•</span>
                                                    <span className='text-sm capitalize text-slate-600'>
                                                        {activity.category?.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <p className='font-mono text-xs text-slate-500'>{activity.crawler_id}</p>
                                            </div>

                                            <div className='flex items-center gap-2'>
                                                <div
                                                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                                        activity.status === 'running'
                                                            ? 'border-green-200 bg-green-100 text-green-700'
                                                            : activity.status === 'error'
                                                                ? 'border-red-200 bg-red-100 text-red-700'
                                                                : activity.status === 'starting'
                                                                    ? 'border-blue-200 bg-blue-100 text-blue-700'
                                                                    : 'border-slate-200 bg-slate-100 text-slate-700'
                                                    }`}
                                                >
                                                    {activity.status === 'running'
                                                        ? ' Running'
                                                        : activity.status === 'error'
                                                            ? '❌ Error'
                                                            : activity.status === 'starting'
                                                                ? '⏳ Starting'
                                                                : activity.status}
                                                </div>
                                                {isRecent && (
                                                    <div className='rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700'>
                                                        New
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className='mb-4 grid grid-cols-2 gap-4'>
                                            <div className='rounded-xl bg-slate-50 p-3'>
                                                <div className='flex items-center gap-2'>
                                                    <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100'>
                                                        <DocumentText1 size={16} className='text-orange-600' />
                                                    </div>
                                                    <div>
                                                        <p className='text-xs text-slate-500'>Items Found</p>
                                                        <p className='text-lg font-semibold text-slate-900'>{itemCount}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className='rounded-xl bg-slate-50 p-3'>
                                                <div className='flex items-center gap-2'>
                                                    <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100'>
                                                        <Timer1 size={16} className='text-slate-600' />
                                                    </div>
                                                    <div>
                                                        <p className='text-xs text-slate-500'>Started</p>
                                                        <p className='text-xs font-medium text-slate-800'>
                                                            {activityTime ? activityTime.toLocaleDateString() : 'Unknown'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className='flex gap-2'>
                                            {activity.status === 'error' && (
                                                <button
                                                    onClick={() => handleStartCrawler(activity.store, activity.category)}
                                                    disabled={!crawlerStatus.available}
                                                    className='flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:from-orange-600 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-60'
                                                >
                                                    <Play size={16} />
                                                    Retry
                                                </button>
                                            )}

                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();

                                                    try {
                                                        const confirmed = await confirm(
                                                            'Remove Activity',
                                                            `Remove ${activity.store} ${activity.category} from recent activities?`
                                                        );

                                                        if (!confirmed) return;

                                                        setPauseAutoRefresh(true);

                                                        try {
                                                            const activityId = generateActivityId(
                                                                activity.store,
                                                                activity.category,
                                                                activity.crawler_id,
                                                                activity.timestamp || activity.completed_at
                                                            );
                                                            await crawlerAPI.clearActivities([activityId], false);
                                                            console.log('Backend activities cleared successfully for individual delete');
                                                        } catch (backendError) {
                                                            console.error('Backend activity clear failed:', backendError);
                                                        }

                                                        const now = new Date().toISOString();
                                                        const activityTimestamp = activity.timestamp || activity.completed_at;
                                                        const activityToInsert = {
                                                            id: generateActivityId(activity.store, activity.category, activity.crawler_id, activityTimestamp),
                                                            store: activity.store,
                                                            category: activity.category,
                                                            crawler_id: activity.crawler_id || '',
                                                            original_timestamp: activityTimestamp || now,
                                                            cleared_at: now
                                                        };

                                                        await SQLiteDB.insertClearedActivity(activityToInsert);
                                                        await SQLiteDB.cleanupOldClearedActivities(50);

                                                        const clearedActivities = await SQLiteDB.getAllClearedActivities();
                                                        setSavedRecentActivity(clearedActivities);

                                                        let insertionVerified = false;
                                                        const maxRetries = 5;
                                                        const retryDelay = 1000;

                                                        for (let retry = 0; retry < maxRetries && !insertionVerified; retry++) {
                                                            await new Promise(resolve => setTimeout(resolve, retryDelay));
                                                            const isCleared = await SQLiteDB.isActivityCleared(
                                                                activityToInsert.store,
                                                                activityToInsert.category,
                                                                activityToInsert.original_timestamp,
                                                                activityToInsert.crawler_id
                                                            );

                                                            if (isCleared) {
                                                                insertionVerified = true;
                                                                console.log(`Individual activity deletion verified on attempt ${retry + 1}`);
                                                            } else if (retry < maxRetries - 1) {
                                                                console.warn(`Individual activity deletion not yet verified, retry ${retry + 1}/${maxRetries}`);
                                                                await SQLiteDB.insertClearedActivity(activityToInsert);
                                                            }
                                                        }

                                                        if (!insertionVerified) {
                                                            console.error('Failed to verify individual activity deletion');
                                                            showError('Delete Warning', 'Activity removed but verification failed. It may reappear after refresh.');
                                                            setPauseAutoRefresh(false);
                                                            return;
                                                        }

                                                        console.log('Verification succeeded, permanently removing activity from state');
                                                        setRecentActivity(prev =>
                                                            prev.filter(item =>
                                                                !(item.store === activity.store && item.category === activity.category && item.crawler_id === activity.crawler_id)
                                                            )
                                                        );

                                                        const allCleared = await SQLiteDB.getAllClearedActivities();
                                                        setSavedRecentActivity(allCleared);

                                                        success('Removed', `${activity.store} ${activity.category} removed from recent activities`);

                                                        setTimeout(() => setPauseAutoRefresh(false), 2500);
                                                    } catch (error) {
                                                        console.error('Error removing activity:', error);
                                                        showError('Remove Failed', 'Failed to remove activity. Please try again.');
                                                        setPauseAutoRefresh(false);
                                                    }
                                                }}
                                                className='rounded-lg p-2.5 text-slate-400 transition-colors hover:bg-slate-100/80 hover:text-slate-600'
                                                title='Remove this activity from history'
                                            >
                                                <Trash size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderResultsTab = () => {
        const resultsArray = Object.entries(crawlerResults);

        const passesFilters = (resultId: string, result: any) => {
            const [store, category] = resultId.split('_');
            const itemsFound = result.items_found || result.count || result.total_products || 0;
            const timestamp = new Date(result.completed_at || result.timestamp || 0);

            if (resultsFilter.store && !store.toLowerCase().includes(resultsFilter.store.toLowerCase())) {
                return false;
            }

            if (resultsFilter.category && !category.toLowerCase().includes(resultsFilter.category.toLowerCase())) {
                return false;
            }

            if (resultsFilter.minItems && itemsFound < parseInt(resultsFilter.minItems)) {
                return false;
            }

            if (resultsFilter.maxItems && itemsFound > parseInt(resultsFilter.maxItems)) {
                return false;
            }

            if (resultsFilter.dateFrom && timestamp < new Date(resultsFilter.dateFrom)) {
                return false;
            }

            if (resultsFilter.dateTo && timestamp > new Date(resultsFilter.dateTo)) {
                return false;
            }

            return true;
        };

        const filteredResults = resultsArray.filter(([resultId, result]) => passesFilters(resultId, result));
        const sortedResults = filteredResults.sort(([, a], [, b]) => {
            const timeA = new Date(a.completed_at || a.timestamp || 0).getTime();
            const timeB = new Date(b.completed_at || b.timestamp || 0).getTime();
            return timeB - timeA;
        });

        const showSkeleton = loading && resultsArray.length === 0;

        const formatDuration = (value: any) => {
            if (value === undefined || value === null) return '—';
            if (typeof value === 'string') return value;
            const totalSeconds = Number(value);
            if (Number.isNaN(totalSeconds)) return '—';
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = Math.max(0, Math.round(totalSeconds % 60));
            if (minutes <= 0) return `${seconds}s`;
            return `${minutes}m ${seconds}s`;
        };

        const formatTimestamp = (value?: string) => {
            if (!value) return null;
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return null;
            return {
                date: date.toLocaleDateString(),
                time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
        };

        const statusStyles: Record<string, string> = {
            completed: 'bg-green-100 text-green-700 border border-green-200',
            running: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
            failed: 'bg-red-100 text-red-700 border border-red-200',
            error: 'bg-red-100 text-red-700 border border-red-200'
        };

        return (
            <div className='space-y-6'>
                <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                    <h4 className='mb-3 text-sm font-semibold text-slate-900'>Filter Results</h4>
                    <div className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6'>
                        <select
                            value={resultsFilter.store}
                            onChange={(e) => setResultsFilter({ ...resultsFilter, store: e.target.value, category: '' })}
                            className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40'
                        >
                            <option value=''>All Stores</option>
                            {getUniqueStores().map(store => (
                                <option key={store} value={store}>{store.charAt(0).toUpperCase() + store.slice(1)}</option>
                            ))}
                        </select>
                        <select
                            value={resultsFilter.category}
                            onChange={(e) => setResultsFilter({ ...resultsFilter, category: e.target.value })}
                            className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40'
                        >
                            <option value=''>All Categories</option>
                            {getUniqueCategories(resultsFilter.store).map(category => (
                                <option key={category} value={category}>
                                    {category.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                </option>
                            ))}
                        </select>
                        <input
                            type='number'
                            placeholder='Min Items'
                            value={resultsFilter.minItems}
                            onChange={(e) => setResultsFilter({ ...resultsFilter, minItems: e.target.value })}
                            className='rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40'
                        />
                        <input
                            type='number'
                            placeholder='Max Items'
                            value={resultsFilter.maxItems}
                            onChange={(e) => setResultsFilter({ ...resultsFilter, maxItems: e.target.value })}
                            className='rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40'
                        />
                        <input
                            type='date'
                            placeholder='From Date'
                            value={resultsFilter.dateFrom}
                            onChange={(e) => setResultsFilter({ ...resultsFilter, dateFrom: e.target.value })}
                            className='rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40'
                        />
                        <input
                            type='date'
                            placeholder='To Date'
                            value={resultsFilter.dateTo}
                            onChange={(e) => setResultsFilter({ ...resultsFilter, dateTo: e.target.value })}
                            className='rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40'
                        />
                    </div>
                    {(resultsFilter.store || resultsFilter.category || resultsFilter.minItems || resultsFilter.maxItems || resultsFilter.dateFrom || resultsFilter.dateTo) && (
                        <button
                            onClick={() => setResultsFilter({ store: '', category: '', minItems: '', maxItems: '', dateFrom: '', dateTo: '' })}
                            className='mt-3 text-xs font-semibold text-primary hover:underline'
                        >
                            Clear Filters
                        </button>
                    )}
                </div>

                <div className='flex flex-wrap items-center justify-between gap-3'>
                    <div>
                        <h3 className='text-lg font-semibold text-slate-900'>Crawler Results</h3>
                        <p className='text-sm text-slate-500'>
                            {sortedResults.length} shown{resultsArray.length !== sortedResults.length ? ` of ${resultsArray.length}` : ''} · Sorted by most recent
                        </p>
                    </div>
                    <div className='flex items-center gap-3'>
                        {sortedResults.length > 0 && (
                            <button
                                onClick={async () => {
                                    try {
                                        const confirmed = await confirm(
                                            'Clear All Results',
                                            `Are you sure you want to clear all ${sortedResults.length} results? This action cannot be undone.`
                                        );

                                        if (!confirmed) return;

                                        setPauseAutoRefresh(true);
                                        console.log('Auto-refresh paused for Clear All operation');

                                        console.log(' Clearing all results in backend...');
                                        const backendResponse = await crawlerAPI.clearResults(undefined, true);
                                        console.log('✅ Backend clear successful:', backendResponse);

                                        const now = new Date().toISOString();
                                        const resultsToInsert = sortedResults.map(([resultId, result]) => {
                                            const [store, category] = resultId.split('_');
                                            const completedAt = result.completed_at || result.timestamp;

                                            return {
                                                id: generateActivityId(store, category, resultId, completedAt),
                                                store,
                                                category,
                                                crawler_id: resultId,
                                                original_timestamp: completedAt || now,
                                                cleared_at: now
                                            };
                                        });

                                        await SQLiteDB.insertManyClearedResults(resultsToInsert);
                                        console.log(`✅ Stored ${resultsToInsert.length} cleared results in SQLite for local consistency`);

                                        let insertionVerified = false;
                                        for (let retry = 0; retry < 5 && !insertionVerified; retry++) {
                                            await new Promise(resolve => setTimeout(resolve, 1000));

                                            let allVerified = true;
                                            for (const sampleResult of resultsToInsert.slice(0, Math.min(3, resultsToInsert.length))) {
                                                const isCleared = await SQLiteDB.isResultCleared(
                                                    sampleResult.store,
                                                    sampleResult.category,
                                                    sampleResult.original_timestamp,
                                                    sampleResult.crawler_id
                                                );
                                                if (!isCleared) {
                                                    allVerified = false;
                                                    break;
                                                }
                                            }

                                            if (allVerified) {
                                                insertionVerified = true;
                                                console.log(`SQLite insertion verified on attempt ${retry + 1}`);
                                            } else if (retry < 4) {
                                                console.warn(`SQLite insertion not yet verified, retry ${retry + 1}/5`);
                                                await SQLiteDB.insertManyClearedResults(resultsToInsert);
                                            }
                                        }

                                        if (!insertionVerified) {
                                            console.error('Failed to verify SQLite insertion after 5 attempts');
                                        }

                                        const retainedActivity = recentActivity.filter(activity => !activity._isResult);

                                        setCrawlerResults({});
                                        setRecentActivity(retainedActivity);

                                        persistSnapshotWithState({
                                            crawlerResults: {},
                                            recentActivity: retainedActivity
                                        });

                                        if (refreshDebounceTimerRef.current) {
                                            clearTimeout(refreshDebounceTimerRef.current);
                                            refreshDebounceTimerRef.current = null;
                                        }

                                        setTimeout(async () => {
                                            try {
                                                console.log('Forcing complete data refresh after clear all...');
                                                const freshResults = await crawlerAPI.getAllResults();
                                                if (freshResults.results) {
                                                    const filtered = await applyResultFiltering(freshResults.results);
                                                    setCrawlerResults(filtered);
                                                }
                                            } catch (error) {
                                                console.error('Error re-applying filters after clear:', error);
                                            } finally {
                                                setPauseAutoRefresh(false);
                                            }
                                        }, 2000);

                                        success('Cleared', `All ${sortedResults.length} results have been cleared`);
                                    } catch (error) {
                                        console.error('Error clearing all results:', error);
                                        showError('Clear Failed', 'Failed to clear all results. Please try again.');
                                        setPauseAutoRefresh(false);
                                    }
                                }}
                                className='flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100'
                            >
                                <Trash size={14} />
                                Clear All
                            </button>
                        )}
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className='rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50'
                        >
                            {refreshing ? 'Refreshing…' : 'Refresh'}
                        </button>
                    </div>
                </div>

                <div className='overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm'>
                    <div className='overflow-x-auto'>
                        <table className='min-w-full divide-y divide-gray-200 text-sm'>
                            <thead className='bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500'>
                                <tr>
                                    <th className='px-6 py-3 text-left'>Store / Category</th>
                                    <th className='px-6 py-3 text-left'>Status</th>
                                    <th className='px-6 py-3 text-right'>Items</th>
                                    <th className='px-6 py-3 text-left'>Duration</th>
                                    <th className='px-6 py-3 text-left'>Completed</th>
                                    <th className='px-6 py-3 text-left'>Samples</th>
                                    <th className='px-6 py-3 text-left'>Crawler ID</th>
                                    <th className='px-6 py-3 text-right'>Actions</th>
                                </tr>
                            </thead>

                            {showSkeleton ? (
                                <tbody>
                                    {Array.from({ length: 5 }).map((_, index) => (
                                        <tr key={`skeleton-${index}`} className='animate-pulse'>
                                            <td className='px-6 py-4' colSpan={8}>
                                                <div className='space-y-3'>
                                                    <div className='h-4 bg-gray-200 rounded w-2/3'></div>
                                                    <div className='h-3 bg-gray-200 rounded w-1/3'></div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            ) : sortedResults.length > 0 ? (
                                <tbody className='divide-y divide-gray-200 bg-white'>
                                    {sortedResults.map(([resultId, result]) => {
                                        const [store, category] = resultId.split('_');
                                        const itemsCount = result.count || result.items?.length || result.total_products || 0;
                                        const completedAt = result.completed_at || result.timestamp;
                                        const isPseudo = Boolean(result._isPseudo);
                                        const status = (result.status || 'completed').toLowerCase();
                                        const duration = formatDuration(result.duration || result.total_duration);
                                        const formattedTimestamp = formatTimestamp(completedAt);
                                        const samples: string[] = Array.isArray(result.samples)
                                            ? result.samples.slice(0, 3).map((sample: any) => {
                                                if (typeof sample === 'string') return sample;
                                                const name = sample?.product_name || 'Unknown product';
                                                const price = sample?.price || '';
                                                return price ? `${name} - ${price}` : name;
                                            })
                                            : [];

                                        return (
                                            <tr key={resultId} className='transition-colors hover:bg-slate-50'>
                                                <td className='px-6 py-4 whitespace-nowrap'>
                                                    <div className='flex flex-col'>
                                                        <span className='capitalize font-semibold text-slate-900'>{store}</span>
                                                        <span className='capitalize text-slate-600'>{category?.replace(/_/g, ' ') || '—'}</span>
                                                    </div>
                                                </td>
                                                <td className='px-6 py-4 whitespace-nowrap'>
                                                    <div className='flex flex-col gap-1'>
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[status] || 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                                                            {status}
                                                        </span>
                                                        {isPseudo && (
                                                            <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200'>
                                                                File only
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className='px-6 py-4 text-right font-semibold text-slate-900'>{itemsCount}</td>
                                                <td className='px-6 py-4 text-slate-600'>{duration}</td>
                                                <td className='px-6 py-4 whitespace-nowrap text-slate-700'>
                                                    {formattedTimestamp ? (
                                                        <div className='flex flex-col'>
                                                            <span>{formattedTimestamp.date}</span>
                                                            <span className='text-xs text-slate-500'>{formattedTimestamp.time}</span>
                                                        </div>
                                                    ) : '—'}
                                                </td>
                                                <td className='px-6 py-4 text-slate-600'>
                                                    {samples.length > 0 ? (
                                                        <div className='space-y-1 text-xs'>
                                                            {samples.map((sample, idx) => (
                                                                <p key={`${resultId}-sample-${idx}`} className='max-w-xs truncate text-slate-600'>
                                                                    • {sample}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className='text-xs text-slate-400'>No samples</span>
                                                    )}
                                                </td>
                                                <td className='px-6 py-4 max-w-xs truncate text-xs font-mono text-slate-500' title={resultId}>
                                                    {resultId}
                                                </td>
                                                <td className='px-6 py-4'>
                                                    <div className='flex flex-wrap items-center justify-end gap-2'>
                                                        <button
                                                            onClick={() => {
                                                                const hasResults = result.items && result.items.length > 0;
                                                                if (isPseudo || (!hasResults && (result.cloud_path || result.output_file))) {
                                                                    const rawPath = result.cloud_path || result.output_file;
                                                                    // Extract filename if it's a path
                                                                    const filename = rawPath ? rawPath.split('/').pop() : rawPath;
                                                                    viewFileContent(store, filename, category);
                                                                } else {
                                                                    setFileViewModal({
                                                                        open: true,
                                                                        store,
                                                                        filename: `${resultId}_results.json`,
                                                                        content: result
                                                                    });
                                                                }
                                                            }}
                                                            className='inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50'
                                                        >
                                                            <Eye size={16} />
                                                            View
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (result.items && result.items.length > 0) {
                                                                    sendFileToClassifier(result.items);
                                                                } else if (isPseudo || (result.cloud_path || result.output_file)) {
                                                                    const rawPath = result.cloud_path || result.output_file;
                                                                    const filename = rawPath ? rawPath.split('/').pop() : rawPath;
                                                                    loadFileAndSendToClassifier(store, filename, category);
                                                                } else {
                                                                    warning('No Items', 'No items found in this result');
                                                                }
                                                            }}
                                                            className='inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50'
                                                            disabled={itemsCount === 0}
                                                        >
                                                            <ArrowUp2 size={16} />
                                                            Send
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    const deleteFile = await confirm(
                                                                        'Delete Result',
                                                                        `Remove ${store} ${category} result from history? The corresponding file will remain in Files tab unless explicitly deleted.`
                                                                    );

                                                                    if (!deleteFile) return;

                                                                    setPauseAutoRefresh(true);

                                                                    console.log(` Deleting result ${resultId} in backend...`);
                                                                    const backendResponse = await crawlerAPI.deleteResult(resultId);
                                                                    console.log('✅ Backend delete successful:', backendResponse);

                                                                    const now = new Date().toISOString();
                                                                    const resultToInsert = {
                                                                        id: generateActivityId(store, category, resultId, completedAt),
                                                                        store,
                                                                        category,
                                                                        crawler_id: resultId,
                                                                        original_timestamp: completedAt || now,
                                                                        cleared_at: now
                                                                    };

                                                                    await SQLiteDB.insertClearedResult(resultToInsert);

                                                                    let insertionVerified = false;
                                                                    const maxRetries = 5;
                                                                    const retryDelay = 1000;

                                                                    for (let retry = 0; retry < maxRetries && !insertionVerified; retry++) {
                                                                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                                                                        const isCleared = await SQLiteDB.isResultCleared(
                                                                            resultToInsert.store,
                                                                            resultToInsert.category,
                                                                            resultToInsert.original_timestamp,
                                                                            resultToInsert.crawler_id
                                                                        );
                                                                        if (isCleared) {
                                                                            insertionVerified = true;
                                                                        } else if (retry < maxRetries - 1) {
                                                                            await SQLiteDB.insertClearedResult(resultToInsert);
                                                                        }
                                                                    }

                                                                    if (!insertionVerified) {
                                                                        console.error('Failed to verify individual result deletion');
                                                                        showError('Delete Failed', 'Failed to permanently delete result. Please try again.');
                                                                        setPauseAutoRefresh(false);
                                                                        return;
                                                                    }

                                                                    setCrawlerResults(prev => {
                                                                        const updatedResults = { ...prev };
                                                                        delete updatedResults[resultId];

                                                                        setRecentActivity(prevActivity => {
                                                                            const updatedActivity = prevActivity.filter(activity => activity.crawler_id !== resultId);
                                                                            persistSnapshotWithState({
                                                                                crawlerResults: updatedResults,
                                                                                recentActivity: updatedActivity
                                                                            });
                                                                            return updatedActivity;
                                                                        });

                                                                        return updatedResults;
                                                                    });

                                                                    success('Removed', `${store} ${category} result removed from history`);

                                                                    setTimeout(() => setPauseAutoRefresh(false), 2000);
                                                                } catch (error) {
                                                                    console.error('Error removing result:', error);
                                                                    showError('Remove Failed', 'Failed to remove result. Please try again.');
                                                                    setPauseAutoRefresh(false);
                                                                }
                                                            }}
                                                            className='inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700'
                                                        >
                                                            <Trash size={14} />
                                                            Remove
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            ) : (
                                <tbody>
                                    <tr>
                                        <td colSpan={8} className='px-6 py-12 text-center text-slate-500'>
                                            <DirectNotification size={48} className='mx-auto mb-4 opacity-50' />
                                            <p className='mb-1 text-lg font-medium text-slate-600'>No results available</p>
                                            <p className='text-sm text-slate-500'>Start a crawler or refresh to fetch the latest runs.</p>
                                        </td>
                                    </tr>
                                </tbody>
                            )}
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    const renderFilesTab = () => {
        const handleViewFile = (file: any) => {
            // Handle file viewing logic
            setFileViewModal({
                open: true,
                store: file.store,
                filename: file.name,
                content: null
            });
            
            // Load file content for viewing
            loadFileContent(file.store, file.name, file.category);
        };

        const handleLoadToClassifier = async (file: any) => {
            try {
                console.log('Load to classifier called with file:', file);
                
                // First, load the file content to get the products directly
                const content = await crawlerAPI.loadFile(file.store, file.name, file.category);
                
                if (content && content.items && content.items.length > 0) {
                    // Use the same logic as sendFileToClassifier for consistency
                    await sendFileToClassifier(content.items);
                } else {
                    warning('No Products', 'No products found in this file to send to classifier');
                }
            } catch (error) {
                console.error('Load to classifier error:', error);
                showError('Load Error', 'Failed to load file content for classifier');
            }
        };

        return (
            <div className='rounded-2xl border border-slate-200/80 bg-white/70 p-2 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                <SmartFileManager
                    onViewFile={handleViewFile}
                    onLoadToClassifier={handleLoadToClassifier}
                />
            </div>
        );
    };

    const fetchCrawlerData = useCallback(async () => {
        try {
            // Get system status
            const statusData = await crawlerAPI.getStatus();
            setCrawlerStatus(prev => JSON.stringify(prev) === JSON.stringify(statusData) ? prev : statusData);

            const crawlerList: CrawlerInfo[] = [];
            let availableCrawlerMap: Record<string, any> = {};
            let activeCrawlerMap: Record<string, any> = {};
            const organizedFiles: {[key: string]: string[]} = {};
            let filteredAndClearedResults: {[key: string]: any} = {};
            let finalActivities: any[] = [];

            // If crawler is loading, don't fetch additional data yet
            if (statusData.loading) {
                // Keep existing data, just update status
                return;
            }

            if (!statusData.available) {
                setAvailableCrawlers(prev => Object.keys(prev).length === 0 ? prev : {});
                setAllCrawlers(prev => prev.length === 0 ? prev : []);
            }

            // Get available crawlers and build the full list
            if (statusData.available) {
                const availableData = await crawlerAPI.getAvailableCrawlers();
                if (availableData.crawlers) {
                    availableCrawlerMap = availableData.crawlers;
                    setAvailableCrawlers(prev => JSON.stringify(prev) === JSON.stringify(availableCrawlerMap) ? prev : availableCrawlerMap);

                    // Build dynamic crawler list from available crawlers
                    Object.entries(availableCrawlerMap).forEach(([store, categories]: [string, any]) => {
                        Object.entries(categories).forEach(([category, config]: [string, any]) => {
                            crawlerList.push({
                                store,
                                category,
                                status: 'inactive',
                                config
                            });
                        });
                    });
                    setAllCrawlers(prev => JSON.stringify(prev) === JSON.stringify(crawlerList) ? prev : crawlerList);
                } else {
                    setAvailableCrawlers(prev => Object.keys(prev).length === 0 ? prev : {});
                    setAllCrawlers(prev => prev.length === 0 ? prev : []);
                }

                // Get all crawler statuses
                const allStatuses = await crawlerAPI.getAllCrawlerStatuses();
                activeCrawlerMap = allStatuses.crawlers || {};
                setActiveCrawlers(prev => JSON.stringify(prev) === JSON.stringify(activeCrawlerMap) ? prev : activeCrawlerMap);

                // Get recent results for activity and filter them based on existing files
                const results = await crawlerAPI.getAllResults();
                
                // Get output files first to cross-reference
                const files = await crawlerAPI.getOutputFiles();
                if (files.files) {
                    // Convert new API format to the expected format
                    files.files.forEach((file: any) => {
                        const store = file.store || 'unknown';
                        if (!organizedFiles[store]) {
                            organizedFiles[store] = [];
                        }
                        organizedFiles[store].push(file.name);
                    });
                    setOutputFiles(prev => JSON.stringify(prev) === JSON.stringify(organizedFiles) ? prev : organizedFiles);
                }
                
                if (results.results) {
                    // Include ALL backend results instead of filtering them out
                    const filteredResults: {[key: string]: any} = {};
                    
                    // Add ALL backend results
                    Object.entries(results.results).forEach(([crawlerId, result]: [string, any]) => {
                        filteredResults[crawlerId] = result;
                        console.log(`Including backend result: ${crawlerId}`);
                    });
                    
                    console.log('All backend results included:', Object.keys(filteredResults));
                    console.log('Total results count:', Object.keys(filteredResults).length);
                    
                    // Then, add pseudo-results for files that don't have backend results
                    const pseudoResultPromises: Promise<void>[] = [];
                    
                    if (files.files && typeof files.files === 'object') {
                        Object.entries(files.files).forEach(([store, storeFiles]) => {
                            // Ensure storeFiles is an array before calling forEach
                            if (Array.isArray(storeFiles)) {
                                storeFiles.forEach((fileName: string) => {
                            const fileBaseName = fileName.replace('.json', '');
                            
                            // Try to extract category from filename (e.g., "keells_meats" -> category = "meats")
                            const parts = fileBaseName.split('_');
                            if (parts.length >= 2) {
                                const category = parts.slice(1).join('_'); // Handle multi-word categories
                                const pseudoCrawlerId = `${store}_${category}_file`;
                                
                                // Check if we already have a result for this store_category combination
                                // Use the more flexible matching logic here too
                                const hasExistingResult = Object.keys(filteredResults).some(existingId => {
                                    const existingStore = existingId.split('_')[0];
                                    const existingCategory = existingId.split('_')[1];
                                    
                                    // Try exact match first
                                    if (existingStore === store && existingCategory === category) return true;
                                    
                                    // Try with plurals/singulars for common mismatches
                                    const categoryVariants = [
                                        category,
                                        category + 's', // singular -> plural
                                        category.replace(/s$/, ''), // plural -> singular
                                        category.replace('_', '')  // remove underscores
                                    ];
                                    
                                    return categoryVariants.some(variant => 
                                        existingStore === store && existingCategory === variant
                                    );
                                });
                                
                                if (!hasExistingResult) {
                                    console.log(`Creating pseudo-result for file: ${fileName} (${store}_${category})`);
                                    
                                    // Create a promise to load the file content
                                    const pseudoPromise = crawlerAPI.loadFile(store, fileName)
                                        .then(fileContent => {
                                            const itemCount = fileContent.count || (fileContent.items ? fileContent.items.length : 0);
                                            
                                            // Try to get the original file timestamp, fallback to a reasonable time
                                            // Use a timestamp that's clearly in the past but consistent
                                            const originalTimestamp = fileContent.created_at || 
                                                                   fileContent.timestamp || 
                                                                   new Date(Date.now() - 60000).toISOString(); // 1 minute ago as fallback
                                            
                                            // Create a pseudo-result with preserved timestamp
                                            filteredResults[pseudoCrawlerId] = {
                                                completed_at: originalTimestamp,
                                                timestamp: originalTimestamp, // Ensure both fields are set
                                                count: itemCount,
                                                items: fileContent.items || [],
                                                output_file: fileName,
                                                _isPseudo: true, // Mark as pseudo-result
                                                _originalTimestamp: true // Mark that this has a preserved timestamp
                                            };
                                            console.log(`Pseudo-result created for ${fileName} with ${itemCount} items at ${originalTimestamp}`);
                                        })
                                        .catch(error => {
                                            console.error(`Failed to load file ${fileName}:`, error);
                                            // Fallback to basic pseudo-result if file loading fails with preserved timestamp
                                            const fallbackTimestamp = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago
                                            filteredResults[pseudoCrawlerId] = {
                                                completed_at: fallbackTimestamp,
                                                timestamp: fallbackTimestamp,
                                                count: 0,
                                                items: [],
                                                output_file: fileName,
                                                _isPseudo: true
                                            };
                                        });
                                    
                                    pseudoResultPromises.push(pseudoPromise);
                                }
                            }
                        });
                            }
                        });
                    }
                    
                    // Wait for all pseudo-results to be loaded
                    await Promise.all(pseudoResultPromises);
                    
                    // Apply filtering to results using SQLite to remove cleared ones
                    filteredAndClearedResults = await applyResultFiltering(filteredResults);
                    
                    // Convert filtered results to array for recent activity - these will show in Results section
                    const resultsArray = Object.entries(filteredAndClearedResults).map(([crawlerId, result]: [string, any]) => ({
                        ...result,
                        crawler_id: crawlerId,
                        store: crawlerId.split('_')[0],
                        category: crawlerId.split('_')[1],
                        status: 'completed',
                        items_found: result.count || (result.items ? result.items.length : 0),
                        timestamp: result.completed_at || result.timestamp,
                        _isResult: true // Mark as result entry
                    }));
                    
                    // Get active crawlers - these will show in Recently Completed Crawlers section
                    const activeArray = Object.entries(allStatuses.crawlers || {}).map(([crawlerId, crawler]: [string, any]) => {
                        const crawlerStore = crawler.store;
                        const crawlerCategory = crawler.category;
                        
                        // Check if this is a failed crawler that actually has an output file
                        if (crawler.status === 'failed' && (crawler.items_found || 0) > 0) {
                            const storeFiles = files.files?.[crawlerStore] || [];
                            const hasOutputFile = storeFiles.some((fileName: string) => {
                                const fileBaseName = fileName.replace('.json', '');
                                const parts = fileBaseName.split('_');
                                if (parts.length >= 2) {
                                    const fileCategory = parts.slice(1).join('_');
                                    
                                    // Use the same flexible matching logic
                                    const categoryVariants = [
                                        crawlerCategory,
                                        crawlerCategory + 's',
                                        crawlerCategory.replace(/s$/, ''),
                                        crawlerCategory.replace('_', '')
                                    ];
                                    
                                    return categoryVariants.some(variant => fileCategory === variant);
                                }
                                return false;
                            });
                            
                            if (hasOutputFile) {
                                // Treat this failed crawler as completed since it has an output file
                                console.log(`Treating failed crawler ${crawlerId} as completed due to output file`);
                                const preservedTimestamp = crawler.completed_at || 
                                                         crawler.start_time || 
                                                         crawler.timestamp ||
                                                         new Date(Date.now() - 240000).toISOString(); // 4 minutes ago
                                                         
                                return {
                                    ...crawler,
                                    crawler_id: crawlerId,
                                    status: 'completed', // Override failed status
                                    timestamp: preservedTimestamp,
                                    completed_at: preservedTimestamp,
                                    originalTimestamp: true,
                                    _timestampPreserved: true,
                                    _isActivity: true // Mark as activity entry
                                };
                            }
                        }
                        
                        // Always use the original timestamp, never generate a new one
                        // Priority: completed_at > start_time > timestamp > only then fallback
                        const preservedTimestamp = crawler.completed_at || 
                                                 crawler.start_time || 
                                                 crawler.timestamp || 
                                                 crawler.created_at ||
                                                 new Date(Date.now() - 180000).toISOString(); // 3 minutes ago as last resort
                        
                        return {
                            ...crawler,
                            crawler_id: crawlerId,
                            timestamp: preservedTimestamp,
                            completed_at: crawler.completed_at || preservedTimestamp,
                            items_found: crawler.items_found || crawler.count || (crawler.items ? crawler.items.length : 0) || 0, // Ensure items_found is properly mapped
                            originalTimestamp: true, // Mark that this has a preserved timestamp
                            _timestampPreserved: true, // Additional marker for debugging
                            _isActivity: true // Mark as activity entry
                        };
                    });
                    
                    // Combine results and activities but filter out duplicates intelligently
                    // Priority: Results > Activities for completed crawlers
                    const combinedActivity = [...resultsArray, ...activeArray];
                    
                    // Remove duplicates with preference for results over activities for completed status
                    const uniqueActivity = combinedActivity.filter((item, index, arr) => {
                        const sameStoreCategory = arr.filter(other => 
                            other.store === item.store && other.category === item.category
                        );
                        
                        if (sameStoreCategory.length === 1) {
                            return true; // No duplicates
                        }
                        
                        // If there are duplicates, prefer results over activities for completed items
                        if (item.status === 'completed') {
                            // If this is a result entry, include it
                            if (item._isResult) return true;
                            
                            // If this is an activity but there's no result for this store/category, include it
                            const hasResult = sameStoreCategory.some(other => other._isResult);
                            return !hasResult;
                        }
                        
                        // For non-completed items (running, etc.), always include
                        return item.status !== 'completed';
                    });
                    
                    // Sort by time (most recent first)
                    const sortedActivity = uniqueActivity.sort((a, b) => {
                        const timeA = new Date(a.timestamp || 0).getTime();
                        const timeB = new Date(b.timestamp || 0).getTime();
                        return timeB - timeA;
                    });
                    
                    // Apply filtering to activities using SQLite
                    const filteredActivities = await applyActivityFiltering(sortedActivity);
                    
                    // Preserve timestamps and ensure we're keeping recent items
                    // Sort by actual completion time and preserve original timestamps - NEVER UPDATE TO CURRENT TIME
                    finalActivities = filteredActivities
                        .map(activity => {
                            // Ensure we preserve the original completion timestamp and don't update it
                            // Use existing timestamps in priority order, never create new ones
                            const originalTimestamp = activity.completed_at || activity.timestamp || activity.start_time;
                            
                            if (!originalTimestamp) {
                                console.warn('Activity missing timestamp, using fallback:', activity);
                            }
                            
                            return {
                                ...activity,
                                timestamp: originalTimestamp,
                                completed_at: originalTimestamp,
                                originalTimestamp: true, // Mark as having original timestamp
                                _noTimestampUpdate: true // Explicit flag to prevent timestamp updates
                            };
                        })
                        .sort((a, b) => {
                            const timeA = new Date(a.timestamp || 0).getTime();
                            const timeB = new Date(b.timestamp || 0).getTime();
                            return timeB - timeA; // Most recent first
                        })
                        .slice(0, 10); // Limit to 10 recent activities only
                    
                    console.log(`Final activities count: ${finalActivities.length}, Results count: ${Object.keys(filteredAndClearedResults).length}`);
                }
            } else {
                setActiveCrawlers(prev => Object.keys(prev).length === 0 ? prev : {});
            }

            setCrawlerResults(prev => JSON.stringify(prev) === JSON.stringify(filteredAndClearedResults) ? prev : filteredAndClearedResults);
            setRecentActivity(prev => JSON.stringify(prev) === JSON.stringify(finalActivities) ? prev : finalActivities);

            persistSnapshotWithState({
                status: statusData || DEFAULT_CRAWLER_STATUS,
                availableCrawlers: statusData.available ? availableCrawlerMap : {},
                allCrawlers: crawlerList,
                activeCrawlers: activeCrawlerMap,
                crawlerResults: filteredAndClearedResults,
                recentActivity: finalActivities,
                outputFiles: organizedFiles
            });
            syncSchedules({ silent: true });
        } catch (error) {
            console.error('Failed to fetch crawler data:', error);
            return false; // Indicate failure
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
        return true; // Indicate success
    }, [applyActivityFiltering, applyResultFiltering, persistSnapshotWithState, syncSchedules]); // Include filtering functions in dependencies

    const fetchCrawlerDataRef = useRef(fetchCrawlerData);
    useEffect(() => {
        fetchCrawlerDataRef.current = fetchCrawlerData;
    }, [fetchCrawlerData]);

    // Fetch concurrency settings
    const fetchConcurrencySettings = useCallback(async () => {
        try {
            const res = await fetch('/api/crawler/settings', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (data.max_concurrent_crawlers) {
                    setMaxConcurrentCrawlers(data.max_concurrent_crawlers);
                }
            }
        } catch (e) {
            console.warn('Failed to fetch concurrency settings', e);
        }
    }, []);

    // Update concurrency settings
    const updateConcurrencySettings = useCallback(async (value: number) => {
        setUpdatingConcurrency(true);
        try {
            const res = await fetch('/api/crawler/settings', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ max_concurrent_crawlers: value })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setMaxConcurrentCrawlers(value);
                    success('Settings Updated', `Max concurrent crawlers set to ${value}`);
                } else {
                    showError('Update Failed', data.error || 'Failed to update settings');
                }
            } else {
                showError('Update Failed', 'Failed to update concurrency settings');
            }
        } catch (e) {
            console.error('Failed to update concurrency settings', e);
            showError('Update Failed', 'Could not update concurrency settings');
        } finally {
            setUpdatingConcurrency(false);
        }
    }, [success, showError]);

    // Fetch concurrency settings on mount
    useEffect(() => {
        fetchConcurrencySettings();
    }, [fetchConcurrencySettings]);

    // Manual refresh function
    const handleRefresh = async () => {
        if (refreshing) return; // Prevent multiple simultaneous refreshes
        
        setRefreshing(true);
        console.log("Manual refresh triggered");
        
        try {
            // Use the existing fetchCrawlerData function for consistency
            const success = await fetchCrawlerData();
            if (success) {
                console.log("Manual refresh completed successfully");
            } else {
                showError('Refresh Failed', 'Could not refresh crawler data. Please try again.');
            }
        } catch (error) {
            console.error('Manual refresh error:', error);
            showError('Refresh Failed', 'Could not refresh crawler data. Please try again.');
        } finally {
            setRefreshing(false);
        }
    };

    // Quick refresh function for internal use - non-blocking
    const quickRefresh = () => {
        fetchCrawlerData().catch(error => 
            console.warn('Quick refresh failed:', error)
        );
    };

    useEffect(() => {
        // Load cleared activities from SQLite database
        const loadClearedActivities = async () => {
            try {
                console.log("Loading cleared activities from SQLite database...");
                await SQLiteDB.init();
                const clearedActivities = await SQLiteDB.getAllClearedActivities();
                setSavedRecentActivity(clearedActivities);
                console.log(`Loaded ${clearedActivities.length} cleared activities from SQLite database`);
                await SQLiteDB.cleanupOldClearedActivities(50);
            } catch (err) {
                console.error("Error loading cleared activities:", err);
                try {
                    await SQLiteDB.clearAllClearedActivities();
                } catch (resetErr) {
                    console.error("Failed to reset database:", resetErr);
                }
            }
        };

        // Single unified data loading function to prevent redundant API calls
        const loadAllData = async (isInitialLoad = false) => {
            try {
                if (isInitialLoad) {
                    console.log("Initial data load starting...");
                }

                const [statusData, availableData, allStatuses, results, files] = await Promise.all([
                    crawlerAPI.getStatus(),
                    crawlerAPI.getAvailableCrawlers(),
                    crawlerAPI.getAllCrawlerStatuses(),
                    crawlerAPI.getAllResults(),
                    crawlerAPI.getOutputFiles()
                ]);

                setCrawlerStatus(prev => JSON.stringify(prev) === JSON.stringify(statusData) ? prev : statusData);

                const crawlerList: CrawlerInfo[] = [];
                const availableCrawlerRecord: Record<string, any> = statusData.available ? (availableData.crawlers || {}) : {};
                setAvailableCrawlers(prev => JSON.stringify(prev) === JSON.stringify(availableCrawlerRecord) ? prev : availableCrawlerRecord);

                if (statusData.available && availableData.crawlers) {
                    Object.entries(availableData.crawlers).forEach(([store, categories]: [string, any]) => {
                        Object.entries(categories).forEach(([category, config]: [string, any]) => {
                            crawlerList.push({
                                store,
                                category,
                                status: 'inactive',
                                config
                            });
                        });
                    });
                }
                setAllCrawlers(prev => JSON.stringify(prev) === JSON.stringify(crawlerList) ? prev : crawlerList);

                const activeCrawlerMap = allStatuses.crawlers || {};
                setActiveCrawlers(prev => JSON.stringify(prev) === JSON.stringify(activeCrawlerMap) ? prev : activeCrawlerMap);

                const organizedFiles: {[key: string]: string[]} = {};
                if (files.files) {
                    files.files.forEach((file: any) => {
                        const store = file.store || 'unknown';
                        if (!organizedFiles[store]) {
                            organizedFiles[store] = [];
                        }
                        organizedFiles[store].push(file.name);
                    });
                }
                setOutputFiles(prev => JSON.stringify(prev) === JSON.stringify(organizedFiles) ? prev : organizedFiles);
                if (isInitialLoad) {
                    console.log('Files loaded:', Object.values(organizedFiles).reduce((sum, fileList) => sum + fileList.length, 0));
                }

                let finalResults: {[key: string]: any} = results.results || {};
                let finalActivity: any[] = [];

                if (results.results) {
                    const baseActivity = Object.entries(results.results).map(([crawlerId, result]: [string, any]) => ({
                        ...result,
                        crawler_id: crawlerId,
                        timestamp: result.completed_at || result.timestamp,
                        _isResult: true
                    }));

                    finalActivity = baseActivity.slice(0, 10);

                    try {
                        const filteredResults = applyResultFilteringRef.current
                            ? await applyResultFilteringRef.current(results.results)
                            : results.results;
                        finalResults = filteredResults;

                        const activityForFiltering = Object.entries(filteredResults).map(([crawlerId, result]: [string, any]) => ({
                            ...result,
                            crawler_id: crawlerId,
                            timestamp: result.completed_at || result.timestamp,
                            _isResult: true
                        }));

                        const filteredActivity = applyActivityFilteringRef.current
                            ? await applyActivityFilteringRef.current(activityForFiltering)
                            : activityForFiltering;
                        finalActivity = filteredActivity.slice(0, 10);
                    } catch (error) {
                        console.warn('SQLite filtering failed, using unfiltered data:', error);
                    }
                }

                setCrawlerResults(prev => JSON.stringify(prev) === JSON.stringify(finalResults) ? prev : finalResults);
                setRecentActivity(prev => JSON.stringify(prev) === JSON.stringify(finalActivity) ? prev : finalActivity);

                persistSnapshotWithStateRef.current?.({
                    status: statusData || DEFAULT_CRAWLER_STATUS,
                    availableCrawlers: availableCrawlerRecord,
                    allCrawlers: crawlerList,
                    activeCrawlers: activeCrawlerMap,
                    crawlerResults: finalResults,
                    recentActivity: finalActivity,
                    outputFiles: organizedFiles
                });

                if (isInitialLoad) {
                    setLoading(false);
                    console.log("Initial data load completed - UI ready");
                }

                syncSchedulesRef.current?.({ silent: true });

                return true;
            } catch (error) {
                console.error('Error loading data:', error);
                if (isInitialLoad) {
                    setLoading(false);
                }
                return false;
            }
        };

        const initializeSQLite = async () => {
            try {
                console.log("Initializing SQLite in background...");
                await SQLiteDB.init();
                const clearedActivities = await SQLiteDB.getAllClearedActivities();
                setSavedRecentActivity(clearedActivities);
                console.log(`SQLite initialized with ${clearedActivities.length} cleared activities`);
                await SQLiteDB.cleanupOldClearedActivities(50);
            } catch (err) {
                console.error("SQLite initialization error:", err);
                try {
                    await SQLiteDB.clearAllClearedActivities();
                } catch (resetErr) {
                    console.error("Failed to reset database:", resetErr);
                }
            }
        };

        loadAllData(true);
        setTimeout(() => initializeSQLite(), 100);
        loadClearedActivities();

        let cancelled = false;
        let refreshTimer: NodeJS.Timeout | null = null;
        let failureCount = autoRefreshMetaRef.current.failureCount;

        const runCycle = async () => {
            if (cancelled) {
                return;
            }

            if (pauseAutoRefreshRef.current) {
                scheduleNext(IDLE_REFRESH_INTERVAL_MS);
                return;
            }

            try {
                setAutoRefreshing(true);

                const statusData = await crawlerAPI.getStatus();
                const previousSnapshot = lastStatusSnapshotRef.current;
                const previousActiveCount = previousSnapshot?.active_crawlers ?? 0;
                const hasActiveCountChanged = previousActiveCount !== statusData.active_crawlers;

                setCrawlerStatus(prev => JSON.stringify(prev) === JSON.stringify(statusData) ? prev : statusData);
                lastStatusSnapshotRef.current = statusData;

                let statusChanged = false;

                if (hasActiveCountChanged || statusData.active_crawlers > 0) {
                    const allStatuses = await crawlerAPI.getAllCrawlerStatuses();

                    if (allStatuses.crawlers) {
                        const currentStates: {[key: string]: string} = {};

                        Object.entries(allStatuses.crawlers).forEach(([crawlerId, crawler]: [string, any]) => {
                            currentStates[crawlerId] = crawler.status;
                            const previousStatus = previousCrawlerStatesRef.current[crawlerId];
                            if (previousStatus && previousStatus !== crawler.status) {
                                statusChanged = true;
                            }
                        });

                        setActiveCrawlers(prev => JSON.stringify(prev) === JSON.stringify(allStatuses.crawlers) ? prev : allStatuses.crawlers);
                        previousCrawlerStatesRef.current = currentStates;

                        if (statusChanged && (hasActiveCountChanged || statusData.active_crawlers === 0)) {
                            if (refreshDebounceTimerRef.current) {
                                clearTimeout(refreshDebounceTimerRef.current);
                            }

                            // Use shorter debounce (1s) for better responsiveness
                            refreshDebounceTimerRef.current = setTimeout(() => {
                                fetchCrawlerDataRef.current?.();
                                refreshDebounceTimerRef.current = null;
                            }, 5000);
                        }
                    }
                }

                failureCount = 0;
                const intervalCalculator = computeAdaptiveRefreshIntervalRef.current;
                const nextInterval = intervalCalculator({
                    activeCount: statusData.active_crawlers,
                    hasRecentChange: statusChanged || hasActiveCountChanged,
                    visible: documentVisibilityRef.current,
                    failureCount
                });
                scheduleNext(nextInterval);
            } catch (error) {
                console.error('Auto-refresh error:', error);
                failureCount += 1;
                const intervalCalculator = computeAdaptiveRefreshIntervalRef.current;
                const backoffInterval = intervalCalculator({
                    activeCount: 0,
                    hasRecentChange: false,
                    visible: documentVisibilityRef.current,
                    failureCount
                });
                scheduleNext(backoffInterval);
            } finally {
                setAutoRefreshing(false);
            }
        };

        function scheduleNext(interval: number) {
            if (refreshTimer) {
                clearTimeout(refreshTimer);
            }
            if (cancelled) {
                return;
            }
            autoRefreshMetaRef.current = { failureCount, nextIntervalMs: interval };
            refreshTimer = setTimeout(runCycle, interval);
        }

        scheduleNext(IDLE_REFRESH_INTERVAL_MS);

        return () => {
            cancelled = true;
            if (refreshTimer) {
                clearTimeout(refreshTimer);
            }
            if (refreshDebounceTimerRef.current) {
                clearTimeout(refreshDebounceTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        // Use sessionStorage to persist toast history across navigation within the same session
        const TOAST_HISTORY_KEY = 'crawler_toast_history';
        
        // Load persisted history on mount
        if (!resultsHydratedRef.current) {
            if (!crawlerResults || Object.keys(crawlerResults).length === 0) {
                return;
            }
            
            // Try to load existing history from sessionStorage
            let persistedHistory: Record<string, string> = {};
            try {
                const stored = sessionStorage.getItem(TOAST_HISTORY_KEY);
                if (stored) {
                    persistedHistory = JSON.parse(stored);
                }
            } catch (e) {
                // Ignore parse errors
            }
            
            const initialMap = new Map<string, string>(Object.entries(persistedHistory));
            
            // Also add current results to prevent notifications for existing data
            Object.entries(crawlerResults).forEach(([resultId, result]) => {
                const stamp = result?.completed_at || result?.timestamp;
                if (stamp && !initialMap.has(resultId)) {
                    initialMap.set(resultId, stamp);
                }
            });
            
            resultToastHistoryRef.current = initialMap;
            resultsHydratedRef.current = true;
            
            // Persist the updated history
            try {
                sessionStorage.setItem(TOAST_HISTORY_KEY, JSON.stringify(Object.fromEntries(initialMap)));
            } catch (e) {
                // Ignore storage errors
            }
            return;
        }

        const history = resultToastHistoryRef.current;
        Array.from(history.keys()).forEach((resultId) => {
            if (!(resultId in crawlerResults)) {
                history.delete(resultId);
            }
        });

        let hasNewNotifications = false;
        Object.entries(crawlerResults).forEach(([resultId, result]) => {
            const stamp = result?.completed_at || result?.timestamp;
            if (!stamp) return;
            if (history.get(resultId) === stamp) return;

            history.set(resultId, stamp);
            hasNewNotifications = true;
            const [store, category] = resultId.split('_');
            const prettyStore = store ? store.charAt(0).toUpperCase() + store.slice(1) : 'Crawler';
            const prettyCategory = (category || '').replace(/_/g, ' ');
            const itemCount = result?.count ?? result?.total_products ?? (Array.isArray(result?.items) ? result.items.length : undefined);
            const itemSuffix = typeof itemCount === 'number' && itemCount > 0 ? ` (${itemCount} items)` : '';
            success('Crawler finished', `${prettyStore} ${prettyCategory}`.trim() + ` completed${itemSuffix}.`);
        });
        
        // Persist updated history if there were changes
        if (hasNewNotifications) {
            try {
                sessionStorage.setItem(TOAST_HISTORY_KEY, JSON.stringify(Object.fromEntries(history)));
            } catch (e) {
                // Ignore storage errors
            }
        }
    }, [crawlerResults, success]);

    const handleStartCrawler = async (store: string, category: string) => {
        try {
            info('Starting Crawler', `Starting ${store} ${category} crawler...`);
            // Resolve max_items: per-card override > global > default 50
            const per = getLimitFor(store, category);
            const useCrawlAll = per.crawlAll ?? globalCrawlAll;
            const max = resolveMaxItems(per.max, useCrawlAll);
            const headless = per.headless ?? globalHeadlessMode;
            await crawlerAPI.startCrawler(store, category, max, headless); // pass headless mode
            success('Crawler Started', `Started ${store} ${category} crawler${headless ? ' (headless mode)' : ''} successfully`);
            quickRefresh(); // Refresh after starting
        } catch (error) {
            console.error('Failed to start crawler:', error);
            showError('Start Failed', `Failed to start ${store} ${category} crawler. Please try again.`);
        }
    };

    const handleStopCrawler = async (crawlerId: string) => {
        try {
            const crawlerInfo = activeCrawlers[crawlerId];
            const displayName = crawlerInfo ? `${crawlerInfo.store} ${crawlerInfo.category}` : crawlerId;
            
            info('Stopping Crawler', `Stopping ${displayName} crawler...`);
            await crawlerAPI.stopCrawler(crawlerId);
            success('Crawler Stopped', `Stopped ${displayName} crawler successfully`);
            quickRefresh(); // Refresh after stopping
        } catch (error) {
            console.error('Failed to stop crawler:', error);
            showError('Stop Failed', 'Failed to stop crawler. Please try again.');
        }
    };

    const handleStartAllCrawlers = async () => {
        if (startingAll) return; // Prevent multiple simultaneous starts
        
        try {
            setStartingAll(true);
            
            const crawlerSpecs: CrawlerSpec[] = allCrawlers.map(c => {
                const per = getLimitFor(c.store, c.category);
                const useCrawlAll = per.crawlAll ?? globalCrawlAll;
                const max = resolveMaxItems(per.max, useCrawlAll);
                const headless = per.headless ?? globalHeadlessMode;
                return {
                    store: c.store,
                    category: c.category,
                    ...(max !== undefined ? { max_items: max } : {}),
                    ...(headless ? { headless_mode: headless } : {})
                };
            });
            
            if (crawlerSpecs.length === 0) {
                warning('No Crawlers', 'No crawlers available to start.');
                return;
            }
            
            // Show initial message
            const modeLabel = startBatchMode === 'parallel' ? 'in parallel' : 'sequentially';
            info('Starting All Crawlers', `Starting ${crawlerSpecs.length} crawlers ${modeLabel}. This may take several minutes. Check the activity feed for progress.`);
            
            setStartingAll(true);
            
            // Start sequential crawling
            await crawlerAPI.startMultipleCrawlers(crawlerSpecs, { mode: startBatchMode, wait_for_completion: false });
            
            // Show success message
            success('All Crawlers Started', `Successfully initiated ${crawlerSpecs.length} crawlers. They will run ${modeLabel} - check the activity feed for real-time progress.`);
            
            quickRefresh(); // Refresh after starting
        } catch (error) {
            console.error('Failed to start all crawlers:', error);
            showError('Start All Failed', 'Failed to start all crawlers. Please try again.');
        } finally {
            setStartingAll(false);
        }
    };

    const handleStopAllCrawlers = async () => {
        try {
            const activeCount = Object.keys(activeCrawlers).length;
            if (activeCount === 0) {
                warning('No Active Crawlers', 'No crawlers are currently running.');
                return;
            }
            
            info('Stopping All Crawlers', `Stopping ${activeCount} active crawlers...`);
            await crawlerAPI.stopAllCrawlers();
            success('All Crawlers Stopped', `Successfully stopped ${activeCount} crawlers`);
            quickRefresh(); // Refresh after stopping
        } catch (error) {
            console.error('Failed to stop all crawlers:', error);
            showError('Stop All Failed', 'Failed to stop all crawlers. Please try again.');
        }
    };

    // Debug function to help troubleshoot file-result matching
    const debugFileResultMatching = () => {
        console.log('=== File-Result Matching Debug ===');
        console.log('Current outputFiles:', outputFiles);
        console.log('Current crawlerResults keys:', Object.keys(crawlerResults));
        
        Object.keys(crawlerResults).forEach(crawlerId => {
            const store = crawlerId.split('_')[0];
            const category = crawlerId.split('_')[1];
            const storeFiles = outputFiles[store] || [];
            
            console.log(`Checking ${crawlerId}:`);
            console.log(`  Store: ${store}, Category: ${category}`);
            console.log(`  Available files for ${store}:`, storeFiles);
            
            const matchingFiles = storeFiles.filter((fileName: string) => {
                const fileBaseName = fileName.replace('.json', '');
                return fileBaseName.includes(`${store}_${category}`) || 
                       fileName === `${crawlerId}.json` ||
                       fileName === `${store}_${category}.json`;
            });
            
            console.log(`  Matching files:`, matchingFiles);
        });
    };

    const clearRecentActivity = async () => {
        if (recentActivity.length === 0) {
            warning('No Activities', 'There are no recent activities to clear');
            return;
        }
        
        try {
            // Confirm action
            const confirmed = await confirm(
                'Clear All Recent Activities',
                `Are you sure you want to clear all ${recentActivity.length} recent activities? This action cannot be undone.`
            );
                  if (!confirmed) return;
        
        // Pause auto-refresh during clearing
        setPauseAutoRefresh(true);
        
        // Insert all current activities into the SQLite database
            const now = new Date().toISOString();
            const activities = recentActivity.map(activity => {
                const activityTimestamp = activity.timestamp || activity.completed_at;
                return {
                    id: generateActivityId(activity.store, activity.category, activity.crawler_id, activityTimestamp),
                    store: activity.store,
                    category: activity.category,
                    crawler_id: activity.crawler_id || '',
                    original_timestamp: activityTimestamp || now,
                    cleared_at: now
                };
            });
            
            await SQLiteDB.insertManyClearedActivities(activities);
            console.log(`Cleared ${activities.length} activities and stored in SQLite database`);
            
            // Verify the insertion was successful with enhanced verification
            let insertionVerified = false;
            const maxRetries = 5;
            const retryDelay = 1000;
            const samplesToCheck = Math.min(3, activities.length); // Check up to 3 activities
            
            for (let retry = 0; retry < maxRetries && !insertionVerified; retry++) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                
                // Check multiple samples for better verification
                let verifiedCount = 0;
                for (let i = 0; i < samplesToCheck; i++) {
                    const sampleActivity = activities[i];
                    const isCleared = await SQLiteDB.isActivityCleared(
                        sampleActivity.store, 
                        sampleActivity.category, 
                        sampleActivity.original_timestamp, 
                        sampleActivity.crawler_id
                    );
                    if (isCleared) {
                        verifiedCount++;
                    }
                }
                
                if (verifiedCount === samplesToCheck) {
                    insertionVerified = true;
                    console.log(`SQLite activity insertion verified on attempt ${retry + 1} - ${verifiedCount}/${samplesToCheck} samples verified`);
                } else {
                    console.warn(`SQLite activity insertion not yet verified, retry ${retry + 1}/${maxRetries} - only ${verifiedCount}/${samplesToCheck} samples verified`);
                    if (retry < maxRetries - 1) {
                        // Re-insert all activities to ensure consistency
                        await SQLiteDB.insertManyClearedActivities(activities);
                    }
                }
            }
            
            if (!insertionVerified) {
                console.error('Failed to verify SQLite activity insertion after maximum retries');
                showError('Clear Warning', 'Activities cleared but verification failed. They may reappear after refresh.');
            }
            
            // Clean up old entries
            await SQLiteDB.cleanupOldClearedActivities(50);
            
            // Update the savedRecentActivity for backwards compatibility
            const allCleared = await SQLiteDB.getAllClearedActivities();
            setSavedRecentActivity(allCleared);
            
            // Clear current view immediately
            setRecentActivity([]);
            
            // Force a re-filter to ensure the clearing persists across refreshes
            setTimeout(async () => {
                try {
                    // Re-apply activity filtering to ensure persistence
                    const freshResults = await crawlerAPI.getAllResults();
                    if (freshResults.results) {
                        const resultsArray = Object.entries(freshResults.results).map(([crawlerId, result]: [string, any]) => ({
                            ...result,
                            crawler_id: crawlerId,
                            timestamp: result.completed_at || result.timestamp,
                            _isResult: true
                        }));
                        
                        const filteredActivities = await applyActivityFiltering(resultsArray);
                        setRecentActivity(filteredActivities.slice(0, 10));
                        console.log(`Re-applied activity filtering after clear: ${filteredActivities.length} activities remain`);
                    }
                } catch (error) {
                    console.error('Error re-applying activity filters after clear:', error);
                } finally {
                    // Resume auto-refresh
                    setPauseAutoRefresh(false);
                }
            }, 1000);
            
            // Show confirmation
            success('Cleared', 'Recent activities have been cleared and stored persistently');
        } catch (error) {
            console.error('Error clearing activities:', error);
            showError('Clear Failed', 'Failed to clear activities. Please try again.');
        }
    };

    // Function to reset the cleared activities (for troubleshooting)
    const resetClearedActivities = async () => {
        try {
            // Clear the SQLite database
            await SQLiteDB.clearAllClearedActivities();
            
            // Clear legacy localStorage for backwards compatibility
            localStorage.removeItem('clearedActivities');
            
            setSavedRecentActivity([]);
            success('Reset', 'Cleared activities have been reset');
            
            // Refresh data to show all activities
            quickRefresh();
        } catch (error) {
            console.error('Error resetting cleared activities:', error);
            showError('Reset Failed', 'Failed to reset cleared activities. Please try again.');
        }
    };

    const hasVisibleData = Object.keys(crawlerResults).length > 0 || allCrawlers.length > 0 || Object.keys(outputFiles).length > 0;
    const showInitialLoading = loading && !hasVisibleData;
    const resultsCount = Object.keys(crawlerResults).length;
    const fileCount = totalOutputFiles;
    const activeCrawlerCount = useMemo(() => {
        return Object.values(activeCrawlers).filter(crawler => crawler.status === 'running' || crawler.status === 'starting').length;
    }, [activeCrawlers]);

    // Memoize subtitle to prevent header re-renders during auto-refresh
    const headerSubtitle = useMemo(() => {
        if (!crawlerStatus.available) return 'System Offline';
        if (activeCrawlerCount > 0) return `System Online • ${activeCrawlerCount} Active`;
        return 'System Online';
    }, [crawlerStatus.available, activeCrawlerCount]);

    return (
        <div>
            <PageHeader 
                title="Web Crawler" 
                subtitle={headerSubtitle}
                icon={Activity}
                hideSearch={true}
                hideNotification={true}
            >
                <div className="flex items-center gap-2">
                    {/* Remember toggle */}
                    <label className='hidden md:flex items-center gap-1 text-xs text-gray-700 mr-2'>
                        <input
                            type='checkbox'
                            checked={rememberLimits}
                            onChange={(e) => {
                                setRememberLimits(e.target.checked);
                                if (!e.target.checked) {
                                    // Clean up saved values when turning off
                                    localStorage.removeItem('crawlerLimits');
                                    localStorage.removeItem('crawlerGlobalMaxItems');
                                    localStorage.removeItem('crawlerGlobalCrawlAll');
                                    localStorage.setItem('crawlerRememberLimits', 'false');
                                }
                            }}
                        />
                        Remember limits
                    </label>
                    <PageNavbarIconButton 
                        className='all-center h-8 w-8 duration-200 hover:bg-gray-100 rounded-lg'
                        onClick={showDatabaseStats}
                        title="Show Database Statistics"
                    >
                        <DirectNotification size={16} />
                    </PageNavbarIconButton>
                    <PageNavbarIconButton 
                        className='all-center h-8 w-8 duration-200 hover:bg-gray-100 rounded-lg'
                        onClick={handleRefresh}
                        disabled={refreshing}
                        title="Refresh Now"
                    >
                        <Refresh size={16} className={refreshing || autoRefreshing ? 'animate-spin' : ''} />
                    </PageNavbarIconButton>
                </div>

                {/* Global limit controls */}
                <div className='hidden md:flex items-center gap-2 mr-2'>
                    <input
                        type='number'
                        min={1}
                        placeholder='Global max'
                        value={globalMaxItems}
                        onChange={(e) => setGlobalMaxItems(e.target.value.replace(/[^0-9]/g, ''))}
                        className='w-24 px-2 py-1 border rounded text-xs'
                        disabled={startingAll}
                        title='Default max items for Start All'
                    />
                    <label className='flex items-center gap-1 text-xs text-gray-700'>
                        <input
                            type='checkbox'
                            checked={globalCrawlAll}
                            onChange={(e) => setGlobalCrawlAll(e.target.checked)}
                            disabled={startingAll}
                        />
                        Crawl all
                    </label>
                    <select
                        value={startBatchMode}
                        onChange={(e) => setStartBatchMode(e.target.value as ScheduleBatchMode)}
                        disabled={startingAll}
                        className='w-32 px-2 py-1 border rounded text-xs'
                        title='Execution mode for Start All'
                    >
                        <option value='parallel'>Parallel mode</option>
                        <option value='sequential'>Sequential mode</option>
                    </select>
                </div>

                {crawlerStatus.active_crawlers > 0 && (
                    <OutlineButton 
                        className='h-8 w-8 gap-1 md:w-auto md:border py-1 px-2 duration-200 hover:bg-red-100 rounded-lg text-xs all-center text-red-600 border-red-200'
                        onClick={handleStopAllCrawlers}
                    >
                        <Stop size={16} />
                        <span className='hidden md:inline'>Stop All</span>
                    </OutlineButton>
                )}

                <PageNavbarPrimaryButton 
                    className='h-8 gap-1 bg-primary py-1 px-2 duration-200 text-white rounded-lg text-xs md:flex items-center justify-center'
                    onClick={handleStartAllCrawlers}
                    disabled={!crawlerStatus.available || startingAll}
                >
                    <Play size={16} className={startingAll ? 'animate-spin' : ''} />
                    <span className='hidden md:inline'>
                        {startingAll ? 'Starting...' : 'Start All'}
                    </span>
                </PageNavbarPrimaryButton>
            </PageHeader>

            <PageContent>
                <div className='space-y-6'>
                    <PageHero
                        title="Web Scraper Control Room"
                        description="Launch crawlers, monitor telemetry, and hand off outputs to the classifier without leaving this view."
                        stats={[
                            {
                                label: 'Active Crawlers',
                                value: loading ? '...' : formatNumber(crawlerStatus.active_crawlers),
                                subtext: 'Jobs currently running across supermarket pipelines',
                                icon: Play,
                                color: 'emerald'
                            },
                            {
                                label: 'Products Scraped',
                                value: loading ? '...' : formatNumber(totalProductsScraped),
                                subtext: 'Latest item totals harvested from recent runs',
                                icon: Activity,
                                color: 'blue'
                            },
                            {
                                label: 'Recent Runs',
                                value: loading ? '...' : formatNumber(recentActivity.length),
                                subtext: 'Tracked executions in the activity timeline',
                                icon: Timer1,
                                color: 'orange'
                            },
                            {
                                label: 'Output Files',
                                value: loading ? '...' : formatNumber(totalOutputFiles),
                                subtext: 'Crawler exports ready for QA or syncing',
                                icon: DocumentText1,
                                color: 'violet'
                            }
                        ]}
                    >
                        <div className='mt-6 flex flex-wrap gap-3 items-center'>
                             <button
                                onClick={() => void handleRefresh()}
                                disabled={refreshing}
                                className='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60'
                            >
                                <Refresh size={16} className={refreshing ? 'animate-spin text-primary/70' : 'text-primary'} />
                                {refreshing ? 'Refreshing...' : 'Sync dashboard'}
                            </button>
                            <button
                                onClick={() => void handleStartAllCrawlers()}
                                disabled={!crawlerStatus.available || startingAll}
                                className='inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60'
                            >
                                <Play size={16} className={startingAll ? 'animate-spin text-white/70' : 'text-white'} />
                                {startingAll ? 'Starting...' : 'Start all crawlers'}
                            </button>
                            
                            {/* Concurrency Settings */}
                            <div className='ml-auto flex items-center gap-2'>
                                <button
                                    onClick={() => setShowConcurrencySettings(!showConcurrencySettings)}
                                    className='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
                                    title="Crawler concurrency settings"
                                >
                                    <Setting4 size={16} className='text-slate-500' />
                                    <span className='hidden sm:inline'>Parallel: {maxConcurrentCrawlers}</span>
                                </button>
                                
                                {showConcurrencySettings && (
                                    <div className='flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-1.5 shadow-sm'>
                                        <span className='text-xs text-slate-500 whitespace-nowrap'>Max parallel:</span>
                                        <select
                                            value={maxConcurrentCrawlers}
                                            onChange={(e) => updateConcurrencySettings(Number(e.target.value))}
                                            disabled={updatingConcurrency}
                                            className='text-sm font-medium text-slate-900 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer disabled:opacity-50'
                                        >
                                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                                                <option key={n} value={n}>{n} crawler{n > 1 ? 's' : ''}</option>
                                            ))}
                                        </select>
                                        {updatingConcurrency && (
                                            <div className='h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin' />
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </PageHero>



                    {showInitialLoading && (
                        <div className='bg-white border rounded-lg p-6 flex items-center justify-center text-sm text-gray-600'>
                            <div className='flex items-center gap-3'>
                                <div className='h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin'></div>
                                <span>Loading crawler dashboard…</span>
                            </div>
                        </div>
                    )}
                    
                    {/* Tabs Navigation */}
                    <div className='space-y-6'>
                        <div className='rounded-3xl bg-white/80 p-1 shadow-inner shadow-slate-200 backdrop-blur supports-[backdrop-filter]:bg-white/70'>
                            <div className='grid gap-1 sm:grid-cols-3'>
                                {CRAWLER_TABS.map((tab) => {
                                    const Icon = tab.icon;
                                    const isActive = activeTab === tab.key;
                                    const count = tab.key === 'monitor' ? activeCrawlerCount : tab.key === 'results' ? resultsCount : fileCount;

                                    return (
                                        <motion.button
                                            key={tab.key}
                                            type='button'
                                            onClick={() => setActiveTab(tab.key)}
                                            whileHover={{ y: -2, scale: 1.01 }}
                                            whileTap={{ scale: 0.98 }}
                                            className={`group relative overflow-hidden rounded-2xl px-4 py-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 ${
                                                isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            {isActive && (
                                                <motion.span
                                                    layoutId='crawlerTabHighlight'
                                                    className={`absolute inset-0 rounded-2xl bg-white/90 backdrop-blur-sm ${tab.accent.glow}`}
                                                    transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                                                />
                                            )}

                                            <span className='relative flex items-start gap-3'>
                                                <span
                                                    className={`relative mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl text-white transition ${
                                                        isActive ? tab.accent.icon : 'bg-slate-200 text-slate-500'
                                                    }`}
                                                >
                                                    <Icon size={18} variant='Bold' />
                                                    {isActive && (
                                                        <motion.span
                                                            layoutId='crawlerTabIconAura'
                                                            className='absolute inset-0 rounded-xl border border-white/30'
                                                            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                                                        />
                                                    )}
                                                </span>
                                                <span className='flex-1 pr-6'>
                                                    <span className={`block text-sm font-semibold ${isActive ? 'text-slate-900' : 'text-slate-600'}`}>
                                                        {tab.label}
                                                    </span>
                                                    <span className='mt-0.5 block text-xs font-medium text-slate-500'>
                                                        {tab.description}
                                                    </span>
                                                </span>
                                                {typeof count === 'number' && (
                                                    <motion.span
                                                        key={`${tab.key}-count-${count}`}
                                                        initial={{ opacity: 0, y: -4 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className={`absolute right-3 top-3 inline-flex min-w-[2.1rem] items-center justify-center rounded-full px-2 text-xs font-semibold ${
                                                            isActive ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-600'
                                                        }`}
                                                    >
                                                        {formatNumber(count)}
                                                    </motion.span>
                                                )}
                                            </span>
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </div>

                        <AnimatePresence mode='wait'>
                            {activeTab === 'monitor' && (
                                <motion.div
                                    key='monitor'
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -16 }}
                                    transition={{ duration: 0.2, ease: 'easeOut' }}
                                    className='space-y-6'
                                >
                                    {renderMonitorTab()}
                                </motion.div>
                            )}
                            {activeTab === 'results' && (
                                <motion.div
                                    key='results'
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -16 }}
                                    transition={{ duration: 0.2, ease: 'easeOut' }}
                                    className='space-y-6'
                                >
                                    {renderResultsTab()}
                                </motion.div>
                            )}
                            {activeTab === 'files' && (
                                <motion.div
                                    key='files'
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -16 }}
                                    transition={{ duration: 0.2, ease: 'easeOut' }}
                                    className='space-y-6'
                                >
                                    {renderFilesTab()}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </PageContent>

            {/* File Viewer Modal */}
            <FileViewerModal
                isOpen={fileViewModal.open}
                onClose={() => setFileViewModal({ open: false, store: '', filename: '', content: null })}
                store={fileViewModal.store}
                filename={fileViewModal.filename}
                content={fileViewModal.content}
                onSendToClassifier={sendFileToClassifier}
            />
        </div>
    )
}

export default WebCrawler
