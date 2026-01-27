'use client';

import React, { useEffect, useState, useMemo, type ElementType } from 'react';
import { ProductUploader } from '@/components/products/ProductUploader';
import PageContent from '@/components/layout/PageContent';
import { Folder2, Refresh, DocumentUpload, Category, Data, TickCircle, CloseCircle, Box } from 'iconsax-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHero } from '@/components/shared/PageHero';
import { PageHeader } from '@/components/layout/PageHeader';

interface ProductStats {
  total_products: number;
  categories: Record<string, number>;
  brands: Record<string, number>;
  has_brand: number;
  no_brand: number;
}

type StatCard = {
  key: string;
  label: string;
  description: string;
  value: string;
  accent: 'primary' | 'amber' | 'emerald' | 'rose' | 'blue';
  icon: ElementType;
}

export default function ProductsPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [productStats, setProductStats] = useState<ProductStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline' | 'checking'>('checking');

  const formatNumber = (value?: number | null) => new Intl.NumberFormat('en-US').format(value ?? 0);

  const statCards = useMemo<StatCard[]>(() => [
    {
      key: 'total',
      label: 'Total Products',
      description: 'Complete master catalog of all products',
      value: loading ? '...' : formatNumber(productStats?.total_products ?? 0),
      accent: 'primary',
      icon: Data,
    },
    {
      key: 'categories',
      label: 'Categories',
      description: 'Distinct product classifications available',
      value: loading ? '...' : formatNumber(Object.keys(productStats?.categories || {}).length),
      accent: 'emerald',
      icon: Category,
    },
    {
      key: 'branded',
      label: 'Branded Items',
      description: 'Products with identified brand names',
      value: loading ? '...' : formatNumber(productStats?.has_brand ?? 0),
      accent: 'amber',
      icon: TickCircle,
    },
    {
      key: 'unbranded',
      label: 'Generic Items',
      description: 'Products without specific brand attribution',
      value: loading ? '...' : formatNumber(productStats?.no_brand ?? 0),
      accent: 'rose',
      icon: Box,
    },
  ], [productStats, loading]);

  const backendStatusChip = useMemo(() => {
    switch (backendStatus) {
      case 'online':
        return {
          label: 'Backend online',
          chipClass: 'border border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
          dotClass: 'bg-emerald-300'
        };
      case 'offline':
        return {
          label: 'Backend offline',
          chipClass: 'border border-rose-400/40 bg-rose-500/10 text-rose-100',
          dotClass: 'bg-rose-300'
        };
      default:
        return {
          label: 'Checking status...',
          chipClass: 'border border-amber-400/40 bg-amber-500/10 text-amber-100',
          dotClass: 'bg-amber-300'
        };
    }
  }, [backendStatus]);

  const sectionVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0 },
  };

  const checkBackendStatus = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/health`);
      setBackendStatus(response.ok ? 'online' : 'offline');
    } catch {
      setBackendStatus('offline');
    }
  };

  const loadProductStats = async () => {
    setLoading(true);
    try {
      await checkBackendStatus();
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/products/stats?t=${Date.now()}`);
      if (response.ok) {
        const stats = await response.json();
        setProductStats(stats);
        setBackendStatus('online');
      } else {
        throw new Error('Failed to load stats');
      }
    } catch (error) {
      console.error('Error loading product stats:', error);
      setBackendStatus('offline');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProductStats();
    setRefreshing(false);
  };

  useEffect(() => {
    loadProductStats();
    const id = setInterval(loadProductStats, 60_000);
    return () => clearInterval(id);
  }, []);

  const formatCategoryName = (categoryId: string) => {
    return categoryId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div>
      <PageHeader 
        title="Products" 
        subtitle="Manage your product catalog" 
        icon={DocumentUpload}
        onRefresh={handleRefresh} 
      />

      <PageContent>
        <div className='space-y-6'>
          <PageHero
            title="Product Management"
            description="Upload & Manage AI-Classified Data"
            badges={
              <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${backendStatusChip.chipClass}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${backendStatusChip.dotClass} animate-pulse`} />
                {backendStatusChip.label}
              </div>
            }
            stats={[
                {
                    label: 'Total Products',
                    value: loading ? '...' : formatNumber(productStats?.total_products ?? 0),
                    subtext: 'Complete master catalog of all products',
                    icon: Data,
                    color: 'indigo'
                },
                {
                    label: 'Categories',
                    value: loading ? '...' : formatNumber(Object.keys(productStats?.categories || {}).length),
                    subtext: 'Distinct product classifications available',
                    icon: Category,
                    color: 'emerald'
                },
                {
                    label: 'Branded Items',
                    value: loading ? '...' : formatNumber(productStats?.has_brand ?? 0),
                    subtext: 'Products with identified brand names',
                    icon: TickCircle,
                    color: 'amber'
                },
                {
                    label: 'Generic Items',
                    value: loading ? '...' : formatNumber(productStats?.no_brand ?? 0),
                    subtext: 'Products without specific brand attribution',
                    icon: Box,
                    color: 'rose'
                }
            ]}
          />

          {/* Product Uploader Component */}
          <motion.section
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.4, delay: 0.3, ease: 'easeOut' }}
            className='relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:border-gray-300 hover:shadow-lg'
          >
            <ProductUploader onDatabaseChanged={loadProductStats} />
          </motion.section>
        </div>
      </PageContent>
    </div>
  );
}
