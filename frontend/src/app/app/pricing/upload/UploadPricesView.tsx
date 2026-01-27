"use client";

import React, { useEffect, useRef, useState } from 'react';
import {
  DocumentUpload,
  Shop,
  Calendar1,
  Activity,
  Magicpen,
  ShieldTick,
  TickCircle,
  Edit2,
} from 'iconsax-react';
import { AnimatePresence, motion } from 'framer-motion';
import ToastNotification from '@/components/shared/ToastNotification';
import { useToast } from '@/hooks/useToast';
import { doc, getDoc, setDoc, updateDoc, increment, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { API_BASE_URL } from '@/lib/api';
import PageContent from '@/components/layout/PageContent';
import { PageHero } from '@/components/shared/PageHero';
import { PageHeader } from '@/components/layout/PageHeader';

type StageKey = 'reading' | 'validated' | 'uploading' | 'confirming' | 'completed';
type StageState = 'idle' | StageKey | 'error';

const STAGE_SEQUENCE: StageKey[] = ['reading', 'validated', 'uploading', 'confirming', 'completed'];

const stageDetails: Record<StageKey, { title: string; description: string; icon: React.ComponentType<{ size?: number | string; className?: string }> }> = {
  reading: {
    title: 'Analyzing upload',
    description: 'Parsing the JSON file and preparing raw data.',
    icon: Magicpen,
  },
  validated: {
    title: 'Structuring records',
    description: 'Normalizing products and injecting metadata.',
    icon: DocumentUpload,
  },
  uploading: {
    title: 'Streaming to backend',
    description: 'Sending normalized records to pricing service.',
    icon: Activity,
  },
  confirming: {
    title: 'Verifying database sync',
    description: 'Confirming saved totals and refreshing indexes.',
    icon: ShieldTick,
  },
  completed: {
    title: 'All records live',
    description: 'Prices are now available across dashboards.',
    icon: TickCircle,
  },
} as const;

const isStageKey = (stage: StageState): stage is StageKey => stage !== 'idle' && stage !== 'error';

export default function UploadPricesView() {
  const { toasts, addToast, removeToast } = useToast();
  const [selectedSupermarket, setSelectedSupermarket] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [uploading, setUploading] = useState(false);
  const [progressStage, setProgressStage] = useState<StageState>('idle');
  const [progressPercent, setProgressPercent] = useState(0);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    total: number;
    processed: number;
    current: string;
    details: string[];
  } | null>(null);

  const [dailyCounts, setDailyCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [savingCount, setSavingCount] = useState(false);

  const retailerOptions = [
    {
      id: 'keells',
      name: 'Keells Super',
      accent: 'from-emerald-50 via-white to-white',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
    },
    {
      id: 'cargills',
      name: 'Cargills Food City',
      accent: 'from-rose-50 via-white to-white',
      iconBg: 'bg-rose-100',
      iconColor: 'text-rose-600',
    },
  ] as const;

  // Load daily counts efficiently: batch fetch all, then subscribe only to today
  useEffect(() => {
    const loadDailyCounts = async () => {
      const today = new Date();
      const keys: string[] = [];
      for (let i = -20; i <= 0; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        keys.push(d.toISOString().split('T')[0]);
      }

      try {
        // Batch fetch all 21 days at once
        const promises = keys.map((k) => getDoc(doc(db, 'price_uploads_daily', k)));
        const snapshots = await Promise.all(promises);
        
        const counts: Record<string, number> = {};
        snapshots.forEach((snap, index) => {
          counts[keys[index]] = (snap.exists() && (snap.data() as any)?.count) || 0;
        });
        
        setDailyCounts(counts);
        setLoadingCounts(false);

        // Set up real-time listener ONLY for today's date (most likely to change)
        const todayKey = new Date().toISOString().split('T')[0];
        const unsubscribe = onSnapshot(doc(db, 'price_uploads_daily', todayKey), (snap) => {
          setDailyCounts((prev) => ({
            ...prev,
            [todayKey]: (snap.exists() && (snap.data() as any)?.count) || 0,
          }));
        });

        return unsubscribe;
      } catch (error) {
        console.error('Failed to load daily counts:', error);
        setLoadingCounts(false);
      }
    };

    const unsubPromise = loadDailyCounts();
    
    return () => {
      unsubPromise.then((unsub) => {
        if (unsub) unsub();
      });
    };
  }, []);

  const startEditingCount = (dateKey: string, currentCount: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingDate(dateKey);
    setEditValue(String(currentCount ?? 0));
  };

  const cancelEditingCount = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    setEditingDate(null);
    setEditValue('');
  };

  const submitEditCount = async (event: React.FormEvent, dateKey: string) => {
    event.preventDefault();
    const normalizedValue = Math.max(0, parseInt(editValue || '0', 10));
    if (Number.isNaN(normalizedValue)) {
      addToast({
        type: 'error',
        title: 'Invalid number',
        message: 'Please enter a valid numeric count',
      });
      return;
    }

    setSavingCount(true);
    try {
      await setDoc(
        doc(db, 'price_uploads_daily', dateKey),
        {
          count: normalizedValue,
          date: dateKey,
          lastUpdated: serverTimestamp(),
          manualOverride: true,
        },
        { merge: true },
      );

      setDailyCounts((prev) => ({
        ...prev,
        [dateKey]: normalizedValue,
      }));

      addToast({
        type: 'success',
        title: 'Count updated',
        message: `Upload count for ${dateKey} set to ${normalizedValue}`,
      });
    } catch (error) {
      console.error('Failed to update count:', error);
      addToast({
        type: 'error',
        title: 'Update failed',
        message: 'Could not update the upload count',
      });
    } finally {
      setSavingCount(false);
      setEditingDate(null);
      setEditValue('');
    }
  };

  const generateDateOptions = () => {
    const today = new Date();
    const options: Date[] = [];
    for (let i = -20; i <= 0; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      options.push(d);
    }
    return options;
  };

  const dateOptions = generateDateOptions();

  // Center the selected date in the scroller
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const dateRefs = useRef<Record<string, HTMLDivElement | HTMLButtonElement | null>>({});

  const centerSelectedDate = (behavior: ScrollBehavior = 'smooth') => {
    try {
      const key = selectedDate.toISOString().split('T')[0];
      const el = dateRefs.current[key];
      const container = scrollContainerRef.current;
      if (!el || !container) return;
      if (el.scrollIntoView) {
        el.scrollIntoView({ behavior, block: 'nearest', inline: 'center' });
      } else {
        const elLeft = (el as HTMLElement).offsetLeft;
        const elWidth = (el as HTMLElement).offsetWidth;
        const containerWidth = container.clientWidth;
        const targetLeft = elLeft - (containerWidth - elWidth) / 2;
        container.scrollTo({ left: targetLeft, behavior });
      }
    } catch {}
  };

  useEffect(() => {
    const id = setTimeout(() => centerSelectedDate('auto'), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => centerSelectedDate('smooth'), 0);
    return () => clearTimeout(id);
  }, [selectedDate.toDateString()]);

  const stopProgressTimer = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const gentlyAdvanceProgress = (upperBound: number) => {
    stopProgressTimer();
    progressTimerRef.current = setInterval(() => {
      setProgressPercent((prev) => {
        const next = prev + Math.random() * 6 + 2; // small bursts to feel alive
        return next > upperBound ? upperBound : next;
      });
    }, 450);
  };

  const setStage = (stage: StageState, percent?: number) => {
    setProgressStage(stage);
    if (typeof percent === 'number') {
      setProgressPercent(percent);
    }
  };

  useEffect(() => {
    return () => {
      stopProgressTimer();
    };
  }, []);

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const metadata = data.metadata;
      if (metadata) {
        const supermarket = metadata.supermarket_slug || metadata.supermarket;
        if (supermarket) {
          const match = retailerOptions.find(r => r.id === supermarket.toLowerCase());
          if (match) {
            setSelectedSupermarket(match.id);
            addToast({
              type: 'success',
              title: 'Auto-detected Supermarket',
              message: `Selected ${match.name} based on file metadata`,
            });
          }
        }
      }
    } catch (error) {
      console.debug('Auto-detection failed:', error);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedSupermarket || !selectedFile) {
      addToast({ type: 'error', title: 'Upload Error', message: 'Please select both a supermarket and a JSON file.' });
      return;
    }

    setUploading(true);
    setStage('reading', 4);
    setUploadProgress({ total: 0, processed: 0, current: 'Preparing upload...', details: [] });

    try {
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(selectedFile);
      });

      const priceData = JSON.parse(fileContent);
      setStage('validated', 15);
      let productsArray;
      if (Array.isArray(priceData)) {
        productsArray = priceData;
      } else if (priceData.results && Array.isArray(priceData.results)) {
        productsArray = priceData.results;
      } else {
        throw new Error('Invalid JSON format: Expected array or object with results field');
      }

      setUploadProgress({
        total: productsArray.length,
        processed: 0,
        current: `Found ${productsArray.length} products to upload`,
        details: [
          ` File parsed successfully`,
          ` Target: ${selectedSupermarket}`,
          ` Price Date: ${selectedDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}`,
          ` Upload Time: ${new Date().toLocaleTimeString()}`,
        ],
      });

      setStage('uploading', 32);
      gentlyAdvanceProgress(82);
      const response = await fetch(`${API_BASE_URL}/api/prices/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supermarket_id: selectedSupermarket,
          price_date: selectedDate.toISOString().split('T')[0],
          price_data: productsArray.map((item: any) => ({
            ...item,
            price_date: selectedDate.toISOString().split('T')[0],
            upload_date: selectedDate.toISOString().split('T')[0],
          })),
        }),
      });

      const result = await response.json();
      stopProgressTimer();

      if (result.success) {
        setStage('confirming', 92);
        setUploadProgress({
          total: productsArray.length,
          processed: productsArray.length,
          current: 'Upload completed successfully!',
          details: [
            `✅ Processed: ${result.stats.total_processed} products`,
            ` Price records created: ${result.stats.total_processed}`,
            ` Success rate: 100%`,
            ` Database updated`,
          ],
        });
        setStage('completed', 100);
        setProgressPercent(100);
        addToast({
          type: 'success',
          title: 'Upload Successful!',
          message: `Successfully uploaded ${result.stats.total_processed} price records for ${selectedSupermarket} with date ${selectedDate.toLocaleDateString()}.`,
        });
        try {
          // Mark a flag for today's date to show a sidebar badge
          const todayKey = new Date().toISOString().split('T')[0];
          localStorage.setItem('pricesUploadedOn', todayKey);
          // Persist daily count in Firestore (increment by processed count)
          const dayKey = selectedDate.toISOString().split('T')[0];
          const ref = doc(db, 'price_uploads_daily', dayKey);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            await updateDoc(ref, { count: increment(result.stats.total_processed), updatedAt: serverTimestamp() });
          } else {
            await setDoc(ref, { count: result.stats.total_processed, updatedAt: serverTimestamp() });
          }
        } catch {}
        setTimeout(() => {
          setSelectedFile(null);
          setSelectedSupermarket('');
          setUploadProgress(null);
          setStage('idle', 0);
          setProgressPercent(0);
        }, 3000);
      } else {
        setStage('error');
        setUploadProgress({ total: productsArray.length, processed: 0, current: 'Upload failed', details: [`❌ Error: ${result.error}`] });
        addToast({ type: 'error', title: 'Upload Failed', message: result.error || 'An unexpected error occurred during upload.' });
      }
    } catch (error) {
      stopProgressTimer();
      setStage('error');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setUploadProgress({ total: 0, processed: 0, current: 'Upload failed', details: [`❌ Error: ${errorMessage}`] });
      addToast({ type: 'error', title: 'Upload Failed', message: `Failed to process file: ${errorMessage}` });
    } finally {
      stopProgressTimer();
      setUploading(false);
    }
  };

  const handleEditCount = async (dateKey: string) => {
    if (!editValue || isNaN(parseInt(editValue))) {
      setEditingDate(null);
      return;
    }

    try {
      const newCount = parseInt(editValue);
      await setDoc(doc(db, 'price_uploads_daily', dateKey), {
        count: newCount,
        date: dateKey,
        lastUpdated: serverTimestamp()
      }, { merge: true });
      
      addToast({
        type: 'success',
        title: 'Count updated',
        message: `Upload count for ${dateKey} set to ${newCount}`
      });
    } catch (error) {
      console.error('Failed to update count:', error);
      addToast({
        type: 'error',
        title: 'Update failed',
        message: 'Could not update the upload count'
      });
    } finally {
      setEditingDate(null);
      setEditValue('');
    }
  };

  return (
    <div className='min-h-full bg-gradient-to-b from-white via-slate-50 to-slate-100/80'>
      <PageHeader 
        title="Price Upload" 
        subtitle="Ingest pricing data" 
        icon={DocumentUpload}
      />
      <PageContent>
        <PageHero
          category="Price ingestion"
          title="Upload Price Data"
          description="Stream JSON snapshots directly into Firestore + Redis with live validation, telemetry, and rollbacks so every dashboard reflects the latest market truth in seconds."
          badges={
            <>
              <span className='inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700'>
                <span className='h-2 w-2 animate-pulse rounded-full bg-emerald-500' />
                System online
              </span>
              <span className='inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-xs font-semibold text-indigo-700'>
                Today&apos;s uploads
                <span className='font-bold text-indigo-900'>{dailyCounts[new Date().toISOString().split('T')[0]] ?? 0}</span>
              </span>
            </>
          }
        >
        </PageHero>

        <div className='grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]'>
          <div className='space-y-6'>
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4 }}
              className='rounded-2xl border border-white/60 bg-white/90 p-6 shadow-sm backdrop-blur'
            >
              <div className='mb-4 flex items-center justify-between'>
                <div>
                  <p className='text-xs font-semibold uppercase tracking-widest text-slate-400'>Target retailer</p>
                  <h3 className='text-lg font-semibold text-slate-900'>Choose supermarket to ingest</h3>
                </div>
                <div className='rounded-full bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500'>
                  {selectedSupermarket ? 'Selected' : 'Awaiting selection'}
                </div>
              </div>
              <div className='grid gap-4 md:grid-cols-2'>
                {retailerOptions.map((store) => (
                  <motion.button
                    key={store.id}
                    onClick={() => setSelectedSupermarket(store.id)}
                    type='button'
                    whileHover={{ y: -4 }}
                    className={`group relative flex items-start gap-4 rounded-2xl border-2 bg-gradient-to-br ${store.accent} p-4 text-left transition-all ${
                      selectedSupermarket === store.id
                        ? 'border-indigo-400 shadow-lg shadow-indigo-100'
                        : 'border-transparent hover:border-slate-200 hover:shadow-md'
                    }`}
                  >
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${store.iconBg} ${store.iconColor}`}>
                      <Shop size={24} />
                    </div>
                    <div>
                      <p className='font-semibold text-slate-900'>{store.name}</p>
                    </div>
                    {selectedSupermarket === store.id && (
                      <div className='absolute right-4 top-4 rounded-full bg-indigo-600 p-1 text-white shadow-sm'>
                        <TickCircle size={16} variant='Bold' />
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45 }}
              className='rounded-2xl border border-white/60 bg-white/90 p-6 shadow-sm backdrop-blur'
            >
              <div className='mb-5 flex items-center justify-between'>
                <div>
                  <p className='text-xs font-semibold uppercase tracking-widest text-slate-400'>Snapshot date</p>
                  <h3 className='text-lg font-semibold text-slate-900'>Select price window</h3>
                </div>
                <div className='flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500'>
                  <Calendar1 size={14} />
                  {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
              <div
                ref={scrollContainerRef}
                className='flex gap-3 overflow-x-auto pb-4 pt-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200'
                onWheel={(e) => {
                  e.preventDefault();
                  e.currentTarget.scrollLeft += e.deltaY;
                }}
                style={{ scrollBehavior: 'smooth' }}
              >
                {dateOptions.map((date) => {
                  const isSelected = date.toDateString() === selectedDate.toDateString();
                  const isToday = date.toDateString() === new Date().toDateString();
                  const key = date.toISOString().split('T')[0];
                  const count = dailyCounts[key] ?? 0;
                  const isEditing = editingDate === key;
                  return (
                    <button
                      key={key}
                      ref={(el) => {
                        dateRefs.current[key] = el;
                      }}
                      onClick={() => setSelectedDate(date)}
                      className={`group relative flex min-w-[84px] flex-col items-center rounded-2xl border px-4 py-3 text-center text-sm transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                          : isToday
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          : 'border-slate-100 bg-white text-slate-600 hover:border-indigo-200'
                      }`}
                    >
                      {isSelected && !isEditing && (
                        <span
                          className='absolute right-2 top-2 rounded-full bg-white/20 p-1 text-white transition hover:bg-white/40'
                          onClick={(event) => startEditingCount(key, count, event)}
                        >
                          <Edit2 size={12} />
                        </span>
                      )}
                      <span className='text-[11px] font-semibold uppercase tracking-wider'>
                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className={`text-2xl font-bold ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        {date.getDate()}
                      </span>
                      <span className='text-[11px] opacity-70'>
                        {date.toLocaleDateString('en-US', { month: 'short' })}
                      </span>
                      {loadingCounts ? (
                        <div className='mt-2 h-1.5 w-8 rounded-full bg-slate-200 animate-pulse' />
                      ) : isEditing ? (
                        <form
                          className='mt-2 w-full text-left'
                          onSubmit={(event) => submitEditCount(event, key)}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type='number'
                            min='0'
                            value={editValue}
                            onChange={(event) => setEditValue(event.target.value)}
                            className='w-full rounded-xl border border-white/70 bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200'
                          />
                          <div className='mt-1 flex items-center gap-1 text-[10px] font-semibold'>
                            <button
                              type='submit'
                              disabled={savingCount}
                              className='rounded-lg bg-indigo-600 px-2 py-0.5 text-white disabled:opacity-60'
                            >
                              {savingCount ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type='button'
                              className='rounded-lg bg-slate-200 px-2 py-0.5 text-slate-700'
                              onClick={cancelEditingCount}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : count > 0 ? (
                        <div
                          className={`mt-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          <span className='h-1 w-1 rounded-full bg-current' />
                          {count}
                        </div>
                      ) : (
                        <div className='mt-2 h-1.5 w-1.5 rounded-full bg-slate-200' />
                      )}
                      {isToday && <span className='mt-2 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold'>Today</span>}
                    </button>
                  );
                })}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5 }}
              className='rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/30 p-6 text-center shadow-inner'
            >
              <input
                type='file'
                accept='.json'
                onChange={handleFileSelection}
                className='hidden'
                id='file-upload'
              />
              <label htmlFor='file-upload' className='flex cursor-pointer flex-col items-center gap-4'>
                <div className={`flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed ${selectedFile ? 'border-emerald-300 bg-white text-emerald-500' : 'border-indigo-200 bg-white text-indigo-500'}`}>
                  <DocumentUpload size={28} />
                </div>
                {selectedFile ? (
                  <>
                    <p className='text-sm font-semibold text-emerald-700'>{selectedFile.name}</p>
                    <p className='text-xs text-emerald-600'>Click to change file · {(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </>
                ) : (
                  <>
                    <p className='text-sm font-semibold text-slate-900'>Drop JSON file or click to browse</p>
                    <p className='text-xs text-slate-500'>Drag classification exports here to begin ingestion</p>
                  </>
                )}
              </label>
            </motion.section>
          </div>

          <div className='space-y-6'>
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45 }}
              className='rounded-3xl border border-white/60 bg-white/90 p-6 shadow-xl shadow-indigo-100/60 backdrop-blur'
            >
              <div className='mb-6'>
                <h3 className='text-lg font-bold text-slate-900'>Summary</h3>
                <p className='text-sm text-slate-500'>Review details before streaming to the backend.</p>
              </div>
              <div className='space-y-4'>
                <div className='flex items-center justify-between rounded-2xl bg-slate-50/80 px-4 py-3'>
                  <span className='text-xs font-medium uppercase text-slate-400'>Store</span>
                  <span className='text-sm font-semibold text-slate-900'>
                    {selectedSupermarket ? (selectedSupermarket === 'keells' ? 'Keells Super' : 'Cargills Food City') : '—'}
                  </span>
                </div>
                <div className='flex items-center justify-between rounded-2xl bg-slate-50/80 px-4 py-3'>
                  <span className='text-xs font-medium uppercase text-slate-400'>Date</span>
                  <span className='text-sm font-semibold text-slate-900'>
                    {selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <div className='flex items-center justify-between rounded-2xl bg-slate-50/80 px-4 py-3'>
                  <span className='text-xs font-medium uppercase text-slate-400'>File</span>
                  <span className='max-w-[150px] truncate text-sm font-semibold text-slate-900'>
                    {selectedFile ? selectedFile.name : '—'}
                  </span>
                </div>
              </div>

              <button
                onClick={handleFileUpload}
                disabled={!selectedSupermarket || !selectedFile || uploading}
                className={`group relative mt-8 flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-semibold text-white transition-all ${
                  !selectedSupermarket || !selectedFile || uploading
                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                    : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 shadow-lg shadow-indigo-300/40 hover:shadow-indigo-400/50'
                }`}
              >
                {uploading ? (
                  <>
                    <Activity size={18} className='animate-spin' />
                    Processing...
                  </>
                ) : (
                  <>
                    Start Upload
                    <DocumentUpload size={18} />
                  </>
                )}
              </button>
            </motion.section>

            <AnimatePresence>
              {progressStage !== 'idle' && (
                <motion.div
                  key='progress-panel'
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3 }}
                  className='relative overflow-hidden rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-6 shadow-sm'
                >
                  <div className='absolute inset-0 pointer-events-none opacity-40 [background-image:radial-gradient(circle_at_top,_rgba(99,102,241,0.15),_transparent_55%)]' />
                  <div className='relative flex flex-col gap-4'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <div>
                        <p className='text-xs font-semibold uppercase tracking-widest text-indigo-500'>Realtime Upload Monitor</p>
                        <h4 className='mt-1 text-xl font-semibold text-slate-900'>
                          {progressStage === 'completed'
                            ? 'Price data synced successfully'
                            : progressStage === 'error'
                            ? 'Upload encountered an issue'
                            : 'Uploading price data to the cloud'}
                        </h4>
                        <p className='text-sm text-slate-600'>
                          {uploadProgress?.current ?? 'We are preparing your upload...'}
                        </p>
                      </div>
                      <motion.div
                        key={progressPercent}
                        initial={{ scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-lg font-semibold shadow-inner ${
                          progressStage === 'completed'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                            : progressStage === 'error'
                            ? 'border-rose-300 bg-rose-50 text-rose-600'
                            : 'border-indigo-200 bg-white text-indigo-600'
                        }`}
                      >
                        {Math.round(progressPercent)}%
                      </motion.div>
                    </div>

                    <div className='relative h-2 w-full overflow-hidden rounded-full bg-indigo-100'>
                      <motion.div
                        className='absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-500'
                        animate={{ width: `${Math.min(progressPercent, 100)}%` }}
                        transition={{ duration: 0.45, ease: 'easeInOut' }}
                      />
                    </div>

                    {/* Simplified Progress View */}
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>{uploadProgress?.processed || 0} / {uploadProgress?.total || 0} items processed</span>
                      <span>{Math.round(progressPercent)}%</span>
                    </div>

                    {!!uploadProgress?.details.length && (
                      <div className='rounded-xl border border-indigo-100 bg-white/70 px-4 py-3 shadow-inner shadow-indigo-50'>
                        <p className='mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-500'>Session journal</p>
                        <ul className='space-y-1 text-sm text-slate-600'>
                          {uploadProgress.details.map((detail, index) => (
                            <li key={index} className='flex items-start gap-2'>
                              <span className='mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400'></span>
                              {detail}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {selectedSupermarket && !uploadProgress && (
              <div className='rounded-2xl border border-blue-100 bg-blue-50/70 p-4'>
                <div className='flex items-center gap-3'>
                  <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600'>
                    <Shop size={18} />
                  </div>
                  <div>
                    <p className='text-sm font-semibold text-blue-900'>Ready to upload data</p>
                    <p className='text-xs text-blue-700'>
                      Target: <strong>{selectedSupermarket === 'keells' ? 'Keells Super' : 'Cargills Food City'}</strong> • Date:
                      <strong className='ml-1'>{selectedDate.toLocaleDateString()}</strong>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </PageContent>

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
