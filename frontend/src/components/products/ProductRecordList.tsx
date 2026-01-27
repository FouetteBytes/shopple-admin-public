import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Edit2, Trash } from 'iconsax-react';

export type ProductRecord = {
  id: string;
  name: string;
  brand_name: string;
  category: string;
  variety: string;
  size: string | number;
  sizeUnit?: string;
  sizeRaw?: string;
  image_url: string;
  original_name: string;
  is_active: boolean;
  created_at: any;
  updated_at: any;
};

export type ProductPagination = {
  page: number;
  per_page: number;
  total: number;
  pages: number;
};

type ProductRecordListProps = {
  products: ProductRecord[];
  isLoading: boolean;
  showProductId: boolean;
  onEdit: (product: ProductRecord) => void;
  onDelete: (product: ProductRecord) => void;
  pagination?: ProductPagination;
  onPageChange: (page: number) => void;
  getCategoryName: (id: string) => string;
};

const formatSize = (record: ProductRecord) => {
  if (record.sizeRaw) return record.sizeRaw;
  if (record.size && record.sizeUnit) return `${record.size} ${record.sizeUnit}`;
  return typeof record.size === 'number' ? `${record.size}` : record.size || '—';
};

export function ProductRecordList({
  products,
  isLoading,
  showProductId,
  onEdit,
  onDelete,
  pagination,
  onPageChange,
  getCategoryName,
}: ProductRecordListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`record-skeleton-${index}`}
            className="h-48 animate-pulse rounded-3xl border border-white/30 bg-white/60"
          />
        ))}
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[32px] border border-dashed border-white/50 bg-white/80 p-10 text-center text-slate-500">
        <div className="text-4xl"></div>
        <p className="mt-3 text-lg font-semibold text-slate-700">No products match these filters</p>
        <p className="text-sm">Try broadening your search or upload a new record.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnimatePresence mode="popLayout">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <motion.article
              key={product.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="relative overflow-hidden rounded-[28px] border border-white/50 bg-gradient-to-br from-white/95 via-white/70 to-primary/5 p-4 shadow-[0_25px_65px_-40px_rgba(15,23,42,0.65)]"
            >
              <div className="flex items-start gap-4">
                <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/60 bg-white/80">
                  {product.image_url ? (
                    <Image src={product.image_url} alt={product.name} fill sizes="80px" className="object-cover" unoptimized />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl">️</div>
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{product.name}</h3>
                    {!product.is_active && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Inactive</span>}
                  </div>
                  <p className="text-xs font-medium text-slate-500">{product.brand_name || 'No brand'}</p>
                  <p className="text-xs text-slate-500">
                    {getCategoryName(product.category)} • {product.variety || 'Generic'} • {formatSize(product)}
                  </p>
                  {showProductId && (
                    <p className="text-[10px] font-mono text-slate-400">{product.id}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-white/60 bg-white/80 px-2 py-0.5 text-slate-600">
                      Updated {new Date(product.updated_at).toLocaleDateString()}
                    </span>
                    <span className="rounded-full border border-white/60 bg-white/80 px-2 py-0.5 text-slate-600">
                      Created {new Date(product.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(product)}
                    className="rounded-full border border-white/60 bg-white/80 p-2 text-primary transition hover:bg-primary hover:text-white"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(product)}
                    className="rounded-full border border-white/60 bg-white/80 p-2 text-rose-500 transition hover:bg-rose-500 hover:text-white"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </AnimatePresence>

      {pagination && (
        <div className="flex flex-col gap-3 rounded-[30px] border border-white/40 bg-white/85 p-4 shadow-inner shadow-primary/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-slate-600">
            Page {pagination.page} of {Math.max(1, pagination.pages)} • {pagination.total.toLocaleString()} records
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
              className="rounded-full border border-white/60 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 transition disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.pages}
              onClick={() => onPageChange(Math.min(pagination.pages, pagination.page + 1))}
              className="rounded-full border border-white/60 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 transition disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
