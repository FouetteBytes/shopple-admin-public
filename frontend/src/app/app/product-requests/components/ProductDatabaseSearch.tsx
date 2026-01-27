import { useCallback, useState } from 'react';
import { SearchNormal1 } from 'iconsax-react';
import { searchCatalogue, type ProductCatalogueMatch } from '@/lib/productSearchApi';
import { useGlobalToast } from '@/contexts/ToastContext';
import { classNames } from '../utils';

type ProductDatabaseSearchProps = {
  taggedProductId?: string;
  productName: string;
  brand?: string;
};

export function ProductDatabaseSearch({ taggedProductId, productName, brand }: ProductDatabaseSearchProps) {
  const [searchQuery, setSearchQuery] = useState(productName || '');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ProductCatalogueMatch[]>([]);
  const { error: showError } = useGlobalToast();

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const matches = await searchCatalogue(searchQuery, { limit: 5, brand });
      setResults(matches);
    } catch (err: any) {
      showError('Product search failed', err?.message ?? String(err));
    } finally {
      setSearching(false);
    }
  }, [searchQuery, brand, showError]);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search product database..."
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !searchQuery.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-primary/50"
        >
          <SearchNormal1 size={16} />
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>
      {taggedProductId && (
        <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
          Tagged product ID: <span className="font-mono font-semibold">{taggedProductId}</span>
        </div>
      )}
      {results.length > 0 && (
        <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-gray-100 bg-gray-50 p-3">
          {results.map((product) => (
            <div key={product.id} className={classNames('rounded-lg border bg-white p-3', product.id === taggedProductId ? 'border-primary bg-primary/5' : 'border-gray-100')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{product.name || product.original_name}</p>
                  <p className="text-xs text-gray-500">
                    {product.brand_name && <span className="font-medium">{product.brand_name}</span>}
                    {product.brand_name && (product.sizeRaw || product.size) && ' · '}
                    {(product.sizeRaw || product.size) && <span>{product.sizeRaw || product.size}</span>}
                  </p>
                  {product.matchReasons && product.matchReasons.length > 0 && (
                    <p className="mt-1 text-[10px] text-emerald-600">{product.matchReasons.join(', ')}</p>
                  )}
                  <p className="mt-1 text-[10px] font-mono text-gray-400">{product.id}</p>
                </div>
                <div className="flex flex-col gap-1">
                  {product.similarity !== undefined && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {Math.round(product.similarity * 100)}% match
                    </span>
                  )}
                  {product.id === taggedProductId && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">Tagged</span>
                  )}
                  {product.isDuplicate && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Duplicate</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {results.length === 0 && searchQuery && !searching && (
        <p className="text-xs text-gray-500">No products found. Try a different search term.</p>
      )}
    </div>
  );
}
