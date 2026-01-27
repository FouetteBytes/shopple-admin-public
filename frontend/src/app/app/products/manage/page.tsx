'use client';

import React, { useState } from 'react';
import ProductManagement from '@/components/products/ProductManagement';
import CategoryViewer from '@/components/products/CategoryViewer';
import { FirebaseAuthProvider } from '@/contexts/FirebaseAuthContext';
import PageContent from '@/components/layout/PageContent';
import { Data, Refresh, DocumentText1, Okb } from 'iconsax-react';
import { GlassSubTabs } from '@/components/shared/GlassSubTabs';
import { useMemo } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { PageHero } from '@/components/shared/PageHero';
import { PageHeader } from '@/components/layout/PageHeader';


export default function ProductManagementPage() {
  const [activeTab, setActiveTab] = useState('products');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // Add refresh key to force component updates
  const [stats, setStats] = useState({
    totalProducts: 0,
    activeCategories: 0,
    dataStatus: 'Loading...'
  });

  const handleRefresh = () => {
    setRefreshing(true);
    loadStats();
    setRefreshKey(prev => prev + 1); // Force refresh of child components
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleStatsUpdate = () => {
    // Callback for when child components update data
    loadStats();
  };

  const loadStats = async () => {
    try {
      // Load product count
  const productsResponse = await fetch(`${API_BASE_URL}/api/products?page=1&per_page=1`);
      const productsResult = await productsResponse.json();
      
      // Load categories count
  const categoriesResponse = await fetch(`${API_BASE_URL}/api/categories`);
      const categoriesResult = await categoriesResponse.json();

      setStats({
        totalProducts: productsResult.pagination?.total || 0,
        activeCategories: categoriesResult.categories?.length || 0,
        dataStatus: 'Online'
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      setStats(prev => ({ ...prev, dataStatus: 'Error' }));
    }
  };

  React.useEffect(() => {
    loadStats();
  }, []);

  const heroStats = useMemo(
    () => [
      {
        label: 'Total products',
        value: stats.totalProducts.toLocaleString(),
        subtext: 'Tracked across all retailers',
        color: 'blue',
        icon: DocumentText1,
      },
      {
        label: 'Active categories',
        value: stats.activeCategories.toLocaleString(),
        subtext: 'Synced from Firestore',
        color: 'emerald',
        icon: Okb,
      },
      {
        label: 'Data status',
        value: stats.dataStatus,
        subtext: stats.dataStatus === 'Online' ? 'Realtime connection healthy' : 'Check backend service',
        color: stats.dataStatus === 'Online' ? 'primary' : 'rose',
        icon: Data,
      },
    ],
    [stats]
  );

  const managementTabs = useMemo(
    () => [
      {
        key: 'products' as const,
        label: 'Product management',
        description: 'Search, edit and curate catalog',
        icon: DocumentText1,
        accentGradient: 'bg-gradient-to-br from-indigo-500/20 via-sky-400/20 to-transparent',
      },
      {
        key: 'categories' as const,
        label: 'Categories overview',
        description: 'Inspect taxonomy performance',
        icon: Data,
        accentGradient: 'bg-gradient-to-br from-emerald-500/20 via-teal-400/20 to-transparent',
      },
    ],
    []
  );

  return (
    <FirebaseAuthProvider>
      <div>
        <PageHeader 
            title="Product Database" 
            subtitle="Manage catalog & categories" 
            icon={Data}
            onRefresh={handleRefresh} 
        />
        <PageContent>
          <div className="space-y-6">
            <PageHero
              title="Product Database"
              description="Product Management & Categories"
              stats={heroStats}
            >
              <div className="flex items-center gap-2">
                <button 
                  className='all-center h-8 w-8 duration-200 hover:bg-gray-100 rounded-lg'
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Refresh Data"
                >
                  <Refresh size={16} className={refreshing ? 'animate-spin' : ''} />
                </button>
              </div>
            </PageHero>

            <GlassSubTabs
              tabs={managementTabs}
              activeKey={activeTab as 'products' | 'categories'}
              onChange={(key) => setActiveTab(key)}
              layoutId="product-management-tabs"
              columnsClassName="grid-cols-1 md:grid-cols-2"
            />

            <div className="rounded-[34px] border border-white/40 bg-gradient-to-br from-white/95 via-white/60 to-primary/5 p-6 shadow-[0_45px_120px_-60px_rgba(15,23,42,0.55)]">
              {activeTab === 'products' ? (
                <ProductManagement key={`products-${refreshKey}`} onStatsUpdate={handleStatsUpdate} />
              ) : (
                <CategoryViewer key={`categories-${refreshKey}`} />
              )}
            </div>
          </div>
        </PageContent>
      </div>
    </FirebaseAuthProvider>
  );
}
