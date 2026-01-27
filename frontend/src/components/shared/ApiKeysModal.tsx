"use client";

import React, { useEffect, useState } from 'react';
import { keysAPI } from '@/lib/api';
import { Eye, EyeOff, RefreshCw, ShieldCheck, Save, Trash2, Key, X, CheckCircle2, AlertCircle, Server, Lock, Unlock } from 'lucide-react';
import { useGlobalToast } from '@/contexts/ToastContext';
import { motion, AnimatePresence } from 'framer-motion';

interface ProviderState {
  has_key: boolean;
  masked?: string | null;
  last_verified?: string | null;
}

interface KeysStatus {
  groq: ProviderState;
  openrouter: ProviderState;
  gemini: ProviderState;
  cerebras: ProviderState;
  persistence: { enabled: boolean };
}

const PROVIDER_IDS = ['groq', 'openrouter', 'gemini', 'cerebras'] as const;
type ProviderKey = typeof PROVIDER_IDS[number];

const normalizeModelMap = (source: Partial<Record<string, string[]>> | null | undefined): Record<ProviderKey, string[]> => (
  PROVIDER_IDS.reduce((acc, prov) => {
    const values = Array.isArray(source?.[prov]) ? (source?.[prov] as string[]) : [];
    const seen = new Set<string>();
    const cleaned: string[] = [];
    values.forEach(item => {
      if (typeof item !== 'string') return;
      const trimmed = item.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      cleaned.push(trimmed);
    });
    cleaned.sort((a, b) => a.localeCompare(b));
    acc[prov] = cleaned;
    return acc;
  }, {} as Record<ProviderKey, string[]>)
);

const ProviderRow = ({ 
  prov, 
  label, 
  status, 
  form, 
  reveal, 
  allowed, 
  testModel, 
  testing, 
  removing, 
  result, 
  updateField, 
  setReveal, 
  setTestModel, 
  doTest, 
  doRemove,
  onSave 
}: any) => {
  const p = status?.[prov];
  const has = p?.has_key;
  const masked = p?.masked || '';
  const last = p?.last_verified ? new Date(p.last_verified).toLocaleString() : 'Never';
  const val = form[prov] ?? '';
  const isRevealed = !!reveal[prov];

  const models = allowed[prov] || [];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative overflow-hidden rounded-2xl border border-white/60 bg-white/40 backdrop-blur-md p-5 transition-all hover:bg-white/60 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/10"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        {/* Label & Status */}
        <div className="flex items-center gap-4 md:w-1/4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm transition-colors ${has ? 'bg-emerald-50/50 border-emerald-100 text-emerald-600' : 'bg-gray-50/50 border-gray-100 text-gray-400'}`}>
            <Key size={20} />
          </div>
          <div>
            <div className="font-semibold text-gray-900">{label}</div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium mt-0.5">
              {has ? (
                <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded-full border border-emerald-100/50">
                  <CheckCircle2 size={10} /> Active
                </span>
              ) : (
                <span className="flex items-center gap-1 text-gray-500 bg-gray-100/50 px-2 py-0.5 rounded-full border border-gray-200/50">
                  <AlertCircle size={10} /> Not set
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="flex-1 md:px-4">
          <div className="relative group/input">
            <input
              type={isRevealed ? 'text' : 'password'}
              value={val}
              onChange={(e) => updateField(prov, e.target.value)}
              placeholder={has ? masked || '••••••' : 'Enter API key'}
              className="w-full rounded-xl border border-gray-200/60 bg-white/40 px-4 py-3 pr-10 text-sm text-gray-800 placeholder:text-gray-400 focus:border-primary/30 focus:bg-white/80 focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all shadow-sm hover:bg-white/60"
              autoComplete="off"
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100/50"
              onClick={() => setReveal((prev: any) => ({ ...prev, [prov]: !isRevealed }))}
              aria-label={isRevealed ? 'Hide' : 'Show'}
            >
              {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 md:w-1/3 md:items-end">
          <div className="flex w-full items-center gap-2">
            {models.length > 0 ? (
              <div className="relative flex-1">
                <select
                  className="w-full appearance-none rounded-xl border border-gray-200/60 bg-white/40 px-3 py-2 text-xs font-medium text-gray-600 focus:border-primary/30 focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-primary/5 transition-all cursor-pointer hover:bg-white/60"
                  value={testModel[prov] || ''}
                  onChange={(e) => setTestModel((prev: any) => ({ ...prev, [prov]: e.target.value }))}
                >
                  {models.map((m: string) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            ) : (
              <div className="flex-1 text-center text-[10px] italic text-gray-400 bg-gray-50/30 rounded-lg py-2 border border-gray-100/50">
                No models available
              </div>
            )}
            
            {val && (
               <motion.button 
                 whileHover={{ scale: 1.02 }}
                 whileTap={{ scale: 0.98 }}
                 onClick={() => onSave(prov)}
                 className="flex h-9 items-center gap-1.5 rounded-xl border border-emerald-200/60 bg-emerald-50/50 px-3 text-xs font-medium text-emerald-700 shadow-sm hover:bg-emerald-100/50 hover:text-emerald-800 hover:border-emerald-300 disabled:opacity-50 transition-all"
               >
                 <Save size={14} /> Save
               </motion.button>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => doTest(prov)}
              disabled={!!testing[prov]}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-gray-200/60 bg-white/60 px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-white hover:text-primary hover:border-primary/20 disabled:opacity-50 transition-all"
            >
              {testing[prov] ? <RefreshCw size={14} className="animate-spin"/> : <ShieldCheck size={14} />}
              Test
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => doRemove(prov)}
              disabled={!!removing[prov] || !has}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-100/60 bg-rose-50/50 text-rose-600 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-50 disabled:bg-gray-50 disabled:text-gray-300 disabled:border-gray-200 transition-all shadow-sm"
              title="Remove stored key"
            >
              {removing[prov] ? <RefreshCw size={14} className="animate-spin"/> : <Trash2 size={14} />}
            </motion.button>
          </div>
          
          <div className="flex items-center justify-end gap-2 text-[10px]">
             <span className="text-gray-400 flex items-center gap-1">
               <CheckCircle2 size={10} /> Verified: {last}
             </span>
             {result[prov] && (
               <span className={`font-medium px-1.5 py-0.5 rounded-md ${result[prov] === 'Verified' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                 {result[prov]}
               </span>
             )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Cache keys for sessionStorage
const CACHE_KEYS = {
  STATUS: 'api_keys_status_cache',
  MODELS: 'api_keys_models_cache',
  TIMESTAMP: 'api_keys_cache_time',
};
const CACHE_TTL_MS = 60000; // 1 minute cache

// Helper to get cached data
const getCachedData = <T,>(key: string): T | null => {
  try {
    const timestampStr = sessionStorage.getItem(CACHE_KEYS.TIMESTAMP);
    if (!timestampStr) return null;
    
    const cacheTime = parseInt(timestampStr, 10);
    if (Date.now() - cacheTime > CACHE_TTL_MS) {
      // Cache expired
      return null;
    }
    
    const cached = sessionStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

// Helper to set cached data
const setCachedData = <T,>(key: string, data: T): void => {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
    sessionStorage.setItem(CACHE_KEYS.TIMESTAMP, Date.now().toString());
  } catch {
    // Ignore storage errors
  }
};

export default function ApiKeysModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { success, error: showError, info } = useGlobalToast();
  
  // Initialize from cache for instant display
  const [status, setStatus] = useState<KeysStatus | null>(() => getCachedData<KeysStatus>(CACHE_KEYS.STATUS));
  const [loading, setLoading] = useState(() => !getCachedData<KeysStatus>(CACHE_KEYS.STATUS)); // Only show loading if no cache
  const [reveal, setReveal] = useState<{[k:string]: boolean}>({});
  const [form, setForm] = useState<{[k:string]: string}>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<{[k:string]: boolean}>({});
  const [removing, setRemoving] = useState<{[k:string]: boolean}>({});
  const [result, setResult] = useState<{[k:string]: string}>({});
  const [allowed, setAllowed] = useState<Record<ProviderKey, string[]>>(() => {
    const cached = getCachedData<Record<ProviderKey, string[]>>(CACHE_KEYS.MODELS);
    if (cached) return cached;
    return PROVIDER_IDS.reduce((acc, prov) => {
      acc[prov] = [];
      return acc;
    }, {} as Record<ProviderKey, string[]>);
  });
  const [testModel, setTestModel] = useState<Record<ProviderKey, string>>(() => (
    PROVIDER_IDS.reduce((acc, prov) => {
      acc[prov] = '';
      return acc;
    }, {} as Record<ProviderKey, string>)
  ));
  const [reloading, setReloading] = useState(false);

  const labelMap: Record<ProviderKey, string> = {
    groq: 'Groq',
    openrouter: 'OpenRouter',
    gemini: 'Google Gemini',
    cerebras: 'Cerebras',
  };
  const providerLabel = (prov: ProviderKey) => labelMap[prov] || prov;

  // Helper to avoid infinite spinner if a request stalls
  const withTimeout = async <T,>(promise: Promise<T>, ms = 20000): Promise<T> => {
    let timer: any;
    return await Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Request timed out')), ms);
      })
    ]) as T;
  };

  const doReload = async () => {
    setReloading(true);
    try {
      await withTimeout(keysAPI.reload());
      const s = await withTimeout(keysAPI.status());
      setStatus(s);
      setResult(prev => ({ ...prev, global: 'Handlers reloaded' }));
      success('Handlers reloaded', 'Provider handlers have been refreshed.');
    } catch (e: any) {
      setResult(prev => ({ ...prev, global: e?.message || 'Reload failed' }));
      showError('Reload failed', e?.message || 'Unable to reload handlers.');
    } finally {
      setReloading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    
    // If we have cached data, don't show loading - just refresh in background
    const hasCachedData = !!getCachedData<KeysStatus>(CACHE_KEYS.STATUS);
    if (!hasCachedData) {
      setLoading(true);
    }
    
    (async () => {
      try {
        const [s, models] = await Promise.all([keysAPI.status(), keysAPI.allowedModels()]);
        setStatus(s);
        const normalizedModels = normalizeModelMap(models);
        setAllowed(normalizedModels);
        
        // Cache the results for instant loading next time
        setCachedData(CACHE_KEYS.STATUS, s);
        setCachedData(CACHE_KEYS.MODELS, normalizedModels);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  useEffect(() => {
    const handler: EventListener = (event) => {
      const detail = (event as CustomEvent<Record<ProviderKey, string[]>>).detail;
      if (!detail) return;
      setAllowed(normalizeModelMap(detail));
    };
    window.addEventListener('allowed-models-updated', handler);
    return () => window.removeEventListener('allowed-models-updated', handler);
  }, []);

  useEffect(() => {
    setTestModel(prev => {
      const next = { ...prev };
      PROVIDER_IDS.forEach((prov) => {
        const list = allowed[prov] || [];
        if (list.length === 0) {
          next[prov] = '';
          return;
        }
        if (!list.includes(prev[prov])) {
          next[prov] = list[0];
        }
      });
      return next;
    });
  }, [allowed]);

  const updateField = (prov: string, val: string) => {
    setForm(prev => ({ ...prev, [prov]: val }));
  };

  const saveProvider = async (prov: string) => {
    if (!form[prov]) return;
    setSaving(true);
    try {
      const payload = { [prov]: form[prov] };
      await withTimeout(keysAPI.set(payload));
      // Force status update to reflect new key
      const s = await withTimeout(keysAPI.status());
      setStatus(s);
      // Update cache
      setCachedData(CACHE_KEYS.STATUS, s);
      
      // Clear the form field so it returns to masked state
      setForm(prev => {
        const next = { ...prev };
        delete next[prov];
        return next;
      });
      
      setResult(prev => ({ ...prev, [prov]: 'Saved' }));
      success('Saved', `${providerLabel(prov as ProviderKey)} key saved.`);
    } catch (e: any) {
      setResult(prev => ({ ...prev, [prov]: 'Save failed' }));
      showError('Save failed', e?.message || 'Unable to save key.');
    } finally {
      setSaving(false);
    }
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const payload: any = {};
      PROVIDER_IDS.forEach(p => {
        if (form[p] !== undefined) payload[p] = form[p];
      });
      await withTimeout(keysAPI.set(payload));
      // Skip immediate reload to keep Save snappy; Test triggers reload if needed
      const s = await withTimeout(keysAPI.status());
      setStatus(s);
      // Update cache
      setCachedData(CACHE_KEYS.STATUS, s);
      setResult({ global: 'Saved successfully' });
      success('Saved', 'API keys saved successfully.');
    } catch (e: any) {
      setResult({ global: e?.message || 'Save failed' });
      showError('Save failed', e?.message || 'Unable to save keys.');
    } finally {
      setSaving(false);
    }
  };

  const doTest = async (prov: ProviderKey) => {
    setTesting(prev => ({ ...prev, [prov]: true }));
    try {
      // If user typed a new key for this provider, save it first so the handler becomes available
      const pending = form[prov] ?? '';
      if (pending.trim().length > 0) {
        await withTimeout(keysAPI.set({ [prov]: pending.trim() } as any));
        await withTimeout(keysAPI.reload());
        // Clear input after auto-save
        setForm(prev => {
            const next = { ...prev };
            delete next[prov];
            return next;
        });
      }
      const model = testModel[prov] || undefined;
      info('Testing key', `${providerLabel(prov)}${model ? ` • ${model}` : ''}` , 2000);
      const res = await withTimeout(keysAPI.test(prov, model));
      
      const errorMsg = res.error || (typeof res.details === 'string' && res.details.startsWith('Error:') ? res.details : 'Failed');
      const msg = res.ok ? 'Verified' : errorMsg;
      
      // Store detailed result if available (even on failure)
      if (res.details) {
        const detailsText = typeof res.details === 'string' ? res.details : JSON.stringify(res.details, null, 2);
        setResult(prev => ({ 
          ...prev, 
          [prov]: msg,
          [`${prov}_details`]: detailsText
        }));
      } else {
        setResult(prev => ({ ...prev, [prov]: msg }));
      }

      if (res.ok) {
        success('Verified', `${providerLabel(prov)} key is valid${model ? ` • ${model}` : ''}.`);
      } else {
        showError('Verification failed', errorMsg);
      }
      const s = await withTimeout(keysAPI.status());
      setStatus(s);
    } catch (e: any) {
      setResult(prev => ({ ...prev, [prov]: e?.message || 'Failed' }));
      showError('Verification failed', e?.message || 'Test failed.');
    } finally {
      setTesting(prev => ({ ...prev, [prov]: false }));
    }
  };

  const doRemove = async (prov: ProviderKey) => {
    setRemoving(prev => ({ ...prev, [prov]: true }));
    try {
      // Clear key on server and reload handlers
      await withTimeout(keysAPI.set({ [prov]: '' } as any));
      await withTimeout(keysAPI.reload());
      const s = await withTimeout(keysAPI.status());
      setStatus(s);
      // Update cache
      setCachedData(CACHE_KEYS.STATUS, s);
      setForm(prev => ({ ...prev, [prov]: '' }));
      setResult(prev => ({ ...prev, [prov]: 'Removed' }));
      success('Key removed', `${providerLabel(prov)} key has been removed.`);
    } catch (e: any) {
      setResult(prev => ({ ...prev, [prov]: e?.message || 'Remove failed' }));
      showError('Remove failed', e?.message || 'Unable to remove key.');
    } finally {
      setRemoving(prev => ({ ...prev, [prov]: false }));
    }
  };

  const Row = ({ prov, label }: { prov: ProviderKey; label: string }) => {
    // legacy wrapper if needed or remove
    return null;
  };


  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl overflow-hidden rounded-3xl border border-white/40 bg-white/80 shadow-2xl backdrop-blur-xl ring-1 ring-white/50"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/40 bg-white/30 px-8 py-6">
                <div className="flex items-center gap-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg shadow-primary/20">
                    <Key size={28} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 tracking-tight">API Keys</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-sm text-gray-500">Manage your AI provider credentials</p>
                      {loading ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[10px] font-semibold text-gray-500">
                          <RefreshCw size={10} className="animate-spin" /> Loading...
                        </span>
                      ) : status?.persistence?.enabled ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <Lock size={10} /> Encrypted Storage
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700" title="Set KEYSTORE_SECRET to enable encrypted persistence.">
                          <Unlock size={10} /> Memory Only
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={onClose} 
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-900 hover:scale-105"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="max-h-[60vh] overflow-y-auto p-8 custom-scrollbar">
                <div className="space-y-4">
                  {PROVIDER_IDS.map((prov) => (
                    <React.Fragment key={prov}>
                      <ProviderRow 
                        prov={prov} 
                        label={providerLabel(prov)} 
                        status={status}
                        form={form}
                        reveal={reveal}
                        allowed={allowed}
                        testModel={testModel}
                        testing={testing}
                        removing={removing}
                        result={result}
                        updateField={updateField}
                        setReveal={setReveal}
                        setTestModel={setTestModel}
                        doTest={doTest}
                        doRemove={doRemove}
                        onSave={saveProvider}
                      />
                      {result[`${prov}_details`] && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-2 rounded-xl border border-gray-200 bg-gray-50/50 p-4 text-xs font-mono text-gray-600 overflow-x-auto shadow-inner"
                        >
                          <div className="flex justify-between items-center mb-2 border-b border-gray-200 pb-2">
                            <span className="font-bold text-gray-700">Test Output</span>
                            <button 
                              onClick={() => setResult(prev => {
                                const next = { ...prev };
                                delete next[`${prov}_details`];
                                return next;
                              })}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <pre className="whitespace-pre-wrap break-all">{result[`${prov}_details`]}</pre>
                        </motion.div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
                
                {result['global'] && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-6 rounded-2xl bg-gray-50 border border-gray-100 p-4 text-center text-sm text-gray-600"
                  >
                    {result['global']}
                  </motion.div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-white/40 bg-white/30 px-8 py-5">
                <button 
                  onClick={doReload} 
                  disabled={reloading} 
                  className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium text-gray-500 transition-all hover:bg-white/80 hover:text-gray-900 hover:shadow-sm disabled:opacity-50"
                >
                  {reloading ? <RefreshCw size={14} className="animate-spin"/> : <RefreshCw size={14} />}
                  Reload Handlers
                </button>
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={onClose} 
                    className="rounded-xl px-6 py-2.5 text-sm font-medium text-gray-600 transition-all hover:bg-white/80 hover:text-gray-900 hover:shadow-sm"
                  >
                    Cancel
                  </button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={doSave} 
                    disabled={saving} 
                    className="flex items-center gap-2 rounded-xl bg-primary px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/40 disabled:opacity-70 disabled:shadow-none"
                  >
                    {saving ? <RefreshCw size={16} className="animate-spin"/> : <Save size={16} />}
                    Save Changes
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
