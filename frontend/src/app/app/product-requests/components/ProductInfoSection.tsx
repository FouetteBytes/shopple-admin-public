import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Tag2, Clipboard, Shop, DollarCircle } from 'iconsax-react';
import type { ProductRequestDetail } from '@/lib/productRequestApi';
import { API_BASE_URL } from '@/lib/api';
import { REQUEST_TYPE_META, PRIORITY_META } from '../constants';

export type ProductInfoSectionProps = {
  detail: ProductRequestDetail;
  linkedProduct?: {
    id?: string;
    name?: string;
    brand_name?: string;
    image_url?: string;
    size?: string | number;
    sizeUnit?: string;
    sizeRaw?: string;
    category?: string;
    variety?: string;
  } | null;
  linkedProductLoading?: boolean;
  onCopyTaggedId: (value: string) => void;
  onUpdateProduct?: (productId: string) => void;
};

type ProductPriceData = {
  store: string;
  price: number;
  currency: string;
  lastUpdated?: string;
  branch?: string;
};

type EnhancedProductData = {
  id: string;
  name: string;
  brand_name?: string;
  category?: string;
  variety?: string;
  size?: string | number;
  sizeUnit?: string;
  sizeRaw?: string;
  image_url?: string;
  prices?: ProductPriceData[];
  stores?: string[];
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export function ProductInfoSection({ detail, linkedProduct, linkedProductLoading, onCopyTaggedId, onUpdateProduct }: ProductInfoSectionProps) {
  const [enhancedProduct, setEnhancedProduct] = useState<EnhancedProductData | null>(null);
  const [loadingEnhanced, setLoadingEnhanced] = useState(false);

  useEffect(() => {
    if (!detail.taggedProductId) {
      setEnhancedProduct(null);
      return;
    }

    let cancelled = false;

    async function fetchEnhancedProduct() {
      setLoadingEnhanced(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/products/${detail.taggedProductId}`);
        if (!response.ok) throw new Error('Failed to fetch product');
        const data = await response.json();
        if (!cancelled && data.success && data.product) {
          setEnhancedProduct(data.product as EnhancedProductData);
        }
      } catch (err) {
        console.warn('Failed to load enhanced product data', err);
      } finally {
        if (!cancelled) setLoadingEnhanced(false);
      }
    }

    fetchEnhancedProduct();
    return () => {
      cancelled = true;
    };
  }, [detail.taggedProductId]);

  const productData = enhancedProduct || linkedProduct;
  const isLoading = linkedProductLoading || loadingEnhanced;

  const resolvedBrand = useMemo(() => {
    return (
      enhancedProduct?.brand_name ||
      linkedProduct?.brand_name ||
      detail.brand ||
      detail.issue?.correctBrand ||
      detail.issue?.incorrectBrand ||
      '—'
    );
  }, [detail.brand, detail.issue?.correctBrand, detail.issue?.incorrectBrand, enhancedProduct?.brand_name, linkedProduct?.brand_name]);

  const resolvedSize = useMemo(() => {
    if (enhancedProduct?.size && enhancedProduct?.sizeUnit) return `${enhancedProduct.size} ${enhancedProduct.sizeUnit}`;
    if (enhancedProduct?.sizeRaw) return enhancedProduct.sizeRaw;
    if (linkedProduct?.size && linkedProduct?.sizeUnit) return `${linkedProduct.size} ${linkedProduct.sizeUnit}`;
    if (linkedProduct?.sizeRaw) return linkedProduct.sizeRaw;
    return detail.size || detail.issue?.correctSize || detail.issue?.incorrectSize || '—';
  }, [detail.issue?.correctSize, detail.issue?.incorrectSize, detail.size, enhancedProduct?.size, enhancedProduct?.sizeRaw, enhancedProduct?.sizeUnit, linkedProduct?.size, linkedProduct?.sizeRaw, linkedProduct?.sizeUnit]);

  const resolvedCategory = useMemo(() => {
    return enhancedProduct?.category || linkedProduct?.category || detail.categoryHint || '—';
  }, [detail.categoryHint, enhancedProduct?.category, linkedProduct?.category]);

  const resolvedVariety = useMemo(() => {
    return enhancedProduct?.variety || linkedProduct?.variety || '—';
  }, [enhancedProduct?.variety, linkedProduct?.variety]);

  const storeLocation = useMemo(() => {
    if (!detail.storeLocation) return '—';
    const parts = [detail.storeLocation.branch, detail.storeLocation.aisle, detail.storeLocation.shelf, detail.storeLocation.city].filter(Boolean);
    return parts.length ? parts.join(' • ') : '—';
  }, [detail.storeLocation]);

  const requestTypeMeta = REQUEST_TYPE_META[detail.requestType];
  const priorityMeta = detail.priority ? PRIORITY_META[detail.priority] : undefined;

  const metaItems = [
    { label: 'Brand', value: resolvedBrand },
    { label: 'Size', value: resolvedSize },
    { label: 'Category', value: resolvedCategory },
    { label: 'Variety', value: resolvedVariety },
    { label: 'Store', value: detail.store || '—' },
    { label: 'Store location', value: storeLocation },
    { label: 'Submission source', value: detail.submissionSource || '—' },
    { label: 'Tagged product ID', value: detail.taggedProductId || '—' },
  ];

  return (
    <section className="rounded-[28px] border border-white/40 bg-gradient-to-br from-white/95 via-slate-50/70 to-sky-50/40 p-5 shadow-[0_30px_80px_-45px_rgba(30,41,59,0.5)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Product intelligence</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{productData?.name || detail.productName}</h3>
            {requestTypeMeta && <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${requestTypeMeta.badge}`}>{requestTypeMeta.label}</span>}
            {priorityMeta && <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${priorityMeta.badge}`}>Priority {priorityMeta.label}</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Track catalog metadata, price signals, and store coverage pulled from the crawler pipeline.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {detail.taggedProductId ? (
            <>
              <button
                type="button"
                onClick={() => onCopyTaggedId(detail.taggedProductId!)}
                className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow"
              >
                <Tag2 size={16} variant="Bold" /> Copy ID
              </button>
              {onUpdateProduct && (
                <button
                  type="button"
                  onClick={() => onUpdateProduct(detail.taggedProductId!)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-[0_10px_30px_-12px_rgba(14,116,144,0.8)] transition hover:bg-primary/90"
                >
                  <Clipboard size={16} variant="Bold" /> Update product
                </button>
              )}
            </>
          ) : (
            <span className="rounded-full border border-dashed border-white/40 px-3 py-1.5 text-xs font-semibold text-slate-400">
              No catalog link yet
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="relative overflow-hidden rounded-[26px] border border-white/50 bg-white/85 p-4 shadow-inner shadow-slate-900/5">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
            </div>
          )}

          {productData ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-4 md:flex-row">
                <div className="relative h-32 w-32 flex-shrink-0 overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br from-slate-100 to-white shadow-lg">
                  {productData.image_url ? (
                    <Image src={productData.image_url} alt={productData.name || detail.productName} fill sizes="128px" className="object-cover" unoptimized />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-400">
                      No image
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tagged product</p>
                  <p className="text-lg font-semibold text-slate-900">{productData.name || detail.productName}</p>
                  {resolvedVariety !== '—' && <p className="text-sm text-slate-600">{resolvedVariety}</p>}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">{resolvedCategory}</span>
                    {enhancedProduct?.is_active !== undefined && (
                      <span className={`rounded-full px-3 py-1 ${enhancedProduct.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {enhancedProduct.is_active ? 'Active in catalog' : 'Inactive product'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {enhancedProduct?.prices && enhancedProduct.prices.length > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <DollarCircle size={16} className="text-emerald-500" /> Price signals
                  </div>
                  <div className="space-y-2">
                    {enhancedProduct.prices.map((priceData, idx) => (
                      <div key={`${priceData.store}-${idx}`} className="flex items-center justify-between rounded-xl border border-white/70 bg-white/90 px-3 py-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <Shop size={16} className="text-slate-400" /> {priceData.store}
                          {priceData.branch && <span className="text-xs text-slate-400">({priceData.branch})</span>}
                        </div>
                        <div className="text-sm font-bold text-emerald-600">
                          {priceData.currency} {priceData.price.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {enhancedProduct?.stores && enhancedProduct.stores.length > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Shop size={16} className="text-sky-500" /> Store coverage
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                    {enhancedProduct.stores.map((store) => (
                      <span key={store} className="rounded-full bg-white/95 px-3 py-1 shadow-sm">
                        {store}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(enhancedProduct?.created_at || enhancedProduct?.updated_at) && (
                <div className="grid gap-3 text-xs text-slate-500 sm:grid-cols-2">
                  {enhancedProduct?.created_at && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide">Catalog entry</p>
                      <p className="mt-0.5 text-sm text-slate-700">{new Date(enhancedProduct.created_at).toLocaleDateString()}</p>
                    </div>
                  )}
                  {enhancedProduct?.updated_at && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide">Last sync</p>
                      <p className="mt-0.5 text-sm text-slate-700">{new Date(enhancedProduct.updated_at).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200/80 p-6 text-center text-sm text-slate-500">
              {detail.taggedProductId ? 'No enriched metadata available for this product.' : 'Link this request to a catalog product to unlock metadata and automations.'}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-[26px] border border-white/50 bg-white/90 p-4">
            <dl className="grid gap-4 text-sm text-slate-600 sm:grid-cols-2">
              {metaItems.map((item) => (
                <div key={item.label}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {detail.description && (
            <div className="rounded-[26px] border border-dashed border-white/40 bg-slate-50/80 p-4 text-sm text-slate-600">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Requester context</p>
              <p className="mt-1 text-slate-700">{detail.description}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
