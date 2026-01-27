'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TickCircle, CloseCircle, Gallery, Add, Trash, Edit } from 'iconsax-react';
import Image from 'next/image';
import { useGlobalToast } from '@/contexts/ToastContext';
import { API_BASE_URL } from '@/lib/api';

type PendingProduct = {
  id: string;
  requestId: string;
  productName: string;
  brand?: string;
  size?: string;
  category?: string;
  store?: string;
  storeLocation?: {
    branch?: string;
    city?: string;
  };
  photoUrls?: string[];
  description?: string;
  submittedBy?: {
    name?: string;
    email?: string;
  };
  approvedBy?: {
    adminId: string;
    adminName: string;
    approvedAt: string;
  };
  status: 'pending' | 'completed';
  createdAt: string;
  updatedAt: string;
};

export function PendingProductsSection() {
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { success, error: showError } = useGlobalToast();

  const fetchPendingProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/pending-products`);
      if (!response.ok) throw new Error('Failed to fetch pending products');
      const data = await response.json();
      if (data.success) {
        setPendingProducts(data.products || []);
      }
    } catch (err: any) {
      showError('Failed to load pending products', err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchPendingProducts();
  }, [fetchPendingProducts]);

  const handleMarkComplete = useCallback(async (pendingId: string, requestId: string) => {
    setActionLoading(pendingId);
    try {
      // Mark pending product as completed
      const response = await fetch(`${API_BASE_URL}/api/pending-products/${pendingId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId })
      });

      if (!response.ok) throw new Error('Failed to mark as complete');
      
      const data = await response.json();
      if (data.success) {
        success('Marked as completed', 'Product added to database and request completed');
        await fetchPendingProducts();
      }
    } catch (err: any) {
      showError('Failed to complete', err?.message ?? String(err));
    } finally {
      setActionLoading(null);
    }
  }, [success, showError, fetchPendingProducts]);

  const handleDelete = useCallback(async (pendingId: string) => {
    if (!confirm('Are you sure you want to delete this pending product?')) return;
    
    setActionLoading(pendingId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/pending-products/${pendingId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete');
      
      success('Deleted', 'Pending product removed');
      await fetchPendingProducts();
    } catch (err: any) {
      showError('Failed to delete', err?.message ?? String(err));
    } finally {
      setActionLoading(null);
    }
  }, [success, showError, fetchPendingProducts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-primary" />
      </div>
    );
  }

  const activePending = pendingProducts.filter(p => p.status === 'pending');
  const completed = pendingProducts.filter(p => p.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Active Pending Products */}
      <section className="rounded-[34px] border border-white/40 bg-gradient-to-br from-white/95 via-white/60 to-primary/5 p-5 shadow-[0_45px_120px_-60px_rgba(15,23,42,0.55)] backdrop-blur">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Catalog backlog</p>
            <h2 className="text-2xl font-bold text-slate-900">Products to be added</h2>
            <p className="text-sm text-slate-500">Approved requests waiting to land in the master database</p>
          </div>
          <div className="rounded-full border border-white/60 bg-white/80 px-5 py-2 text-sm font-semibold text-slate-700 shadow-inner">
            {activePending.length} pending
          </div>
        </div>

        {activePending.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-white/60 bg-white/60 py-12 text-center">
            <Add size={48} className="mx-auto text-slate-300" />
            <p className="mt-4 text-sm font-medium text-slate-600">No pending products</p>
            <p className="text-xs text-slate-400">Approve a request to populate this queue</p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence>
              {activePending.map((product) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="overflow-hidden rounded-[28px] border border-white/50 bg-white/80 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.6)]"
                >
                  {product.photoUrls && product.photoUrls.length > 0 ? (
                    <div className="relative h-48 w-full overflow-hidden border-b border-white/40 bg-slate-100">
                      <Image
                        src={product.photoUrls[0]}
                        alt={product.productName}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        unoptimized
                      />
                      <div className="absolute right-3 top-3 rounded-full border border-white/50 bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-600">
                        Photo 1/{product.photoUrls.length}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-48 items-center justify-center border-b border-dashed border-white/50 bg-gradient-to-br from-slate-50 to-slate-100 text-xs text-slate-400">
                      No media provided
                    </div>
                  )}

                  <div className="space-y-4 p-5">
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-lg font-semibold text-slate-900">{product.productName}</h3>
                        <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">Pending</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                        {product.brand && <span className="rounded-full bg-slate-100 px-3 py-1">{product.brand}</span>}
                        {product.size && <span className="rounded-full bg-slate-100 px-3 py-1">{product.size}</span>}
                        {product.category && <span className="rounded-full bg-slate-100 px-3 py-1">{product.category}</span>}
                        {product.store && <span className="rounded-full bg-slate-100 px-3 py-1">{product.store}</span>}
                      </div>
                    </div>

                    {product.description && (
                      <p className="text-sm text-slate-600 line-clamp-2">{product.description}</p>
                    )}

                    {product.submittedBy && (
                      <div className="rounded-[20px] border border-white/60 bg-white/70 p-3 text-xs text-slate-600">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Submitted by</p>
                        <p className="font-medium text-slate-800">
                          {product.submittedBy.name || product.submittedBy.email || 'Unknown'}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleMarkComplete(product.id, product.requestId)}
                        disabled={actionLoading === product.id}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_20px_40px_-20px_rgba(16,185,129,0.7)] hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-400"
                      >
                        {actionLoading === product.id ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                            Processing…
                          </>
                        ) : (
                          <>
                            <TickCircle size={16} variant="Bold" />
                            Mark added
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        disabled={actionLoading === product.id}
                        className="rounded-full border border-rose-200 bg-white/80 px-3 py-2 text-rose-600 shadow-sm hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash size={16} />
                      </button>
                    </div>

                    <a
                      href={`/app/product-requests?id=${product.requestId}`}
                      className="block text-xs font-semibold text-primary hover:underline"
                    >
                      View original request →
                    </a>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Recently Completed */}
      {completed.length > 0 && (
        <section className="rounded-[34px] border border-white/40 bg-gradient-to-br from-white/95 via-emerald-50/80 to-white/80 p-5 shadow-[0_45px_120px_-60px_rgba(16,185,129,0.4)] backdrop-blur">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500">Recent wins</p>
            <h3 className="text-lg font-semibold text-slate-900">Recently completed</h3>
            <p className="text-sm text-slate-500">Products that just made it into the catalog</p>
          </div>
          
          <div className="space-y-3">
            {completed.slice(0, 5).map((product) => (
              <div
                key={product.id}
                className="flex items-center gap-4 rounded-[24px] border border-white/50 bg-white/90 px-4 py-3 shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                  <TickCircle size={20} variant="Bold" />
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">{product.productName}</p>
                  <p className="text-xs text-slate-500">Completed {new Date(product.updatedAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
