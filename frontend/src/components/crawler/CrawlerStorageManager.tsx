'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalToast } from '@/contexts/ToastContext';
import { SmartFileRow } from '@/components/files/SmartFileRow';

interface StorageFile {
  name: string;
  size: number;
  created: string;
  updated: string;
  metadata: any;
  public_url: string;
  location: string;
  store?: string;
  category?: string;
}

interface StorageStats {
  total_files: number;
  total_size: number;
  total_size_mb: number;
  stores: {
    [key: string]: {
      categories: {
        [key: string]: {
          files: number;
          size: number;
        }
      };
      total_files: number;
      total_size: number;
    }
  };
}

const CrawlerStorageManager: React.FC = () => {
  const { user } = useAuth();
  const { success, error: showError } = useGlobalToast();
  
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [uploadStatus, setUploadStatus] = useState<{
    uploading: boolean;
    pendingFiles: number;
    lastUpload: string | null;
  }>({
    uploading: false,
    pendingFiles: 0,
    lastUpload: null
  });
  const [storageConfig, setStorageConfig] = useState({
    storage_mode: 'both',
    auto_upload: true,
    keep_local_days: 7,
    max_local_files: 50,
    auto_cleanup: true
  });

  const loadStorageData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load file list from Firebase
      const filesResponse = await fetch('/api/crawler/storage/files', {
        credentials: 'include'
      });
      
      if (filesResponse.ok) {
        const fileData = await filesResponse.json();
        console.log('Firebase files response:', fileData);
        
        // Handle the new files array format
        if (fileData.files && Array.isArray(fileData.files)) {
          setFiles(fileData.files);
        } else {
          console.warn('Unexpected file data format:', fileData);
          setFiles([]);
        }
        
        // Generate storage stats from files
        if (fileData.files && fileData.files.length > 0) {
          const stats = generateStorageStats(fileData.files);
          setStorageStats(stats);
        }
      } else {
        console.error('Failed to load files:', filesResponse.status);
        const errorText = await filesResponse.text();
        console.error('Error details:', errorText);
        showError('Storage Error', 'Failed to load Firebase files');
        setFiles([]);
      }
      
    } catch (error) {
      console.error('Failed to load storage data:', error);
      showError('Storage Error', 'Failed to load storage data');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const generateStorageStats = (files: StorageFile[]): StorageStats => {
    const stats: StorageStats = {
      total_files: files.length,
      total_size: 0,
      total_size_mb: 0,
      stores: {}
    };

    files.forEach(file => {
      stats.total_size += file.size;
      
      const store = file.store || 'unknown';
      const category = file.category || 'unknown';
      
      if (!stats.stores[store]) {
        stats.stores[store] = {
          categories: {},
          total_files: 0,
          total_size: 0
        };
      }
      
      if (!stats.stores[store].categories[category]) {
        stats.stores[store].categories[category] = {
          files: 0,
          size: 0
        };
      }
      
      stats.stores[store].categories[category].files++;
      stats.stores[store].categories[category].size += file.size;
      stats.stores[store].total_files++;
      stats.stores[store].total_size += file.size;
    });

    stats.total_size_mb = stats.total_size / (1024 * 1024);
    return stats;
  };

  const handleDeleteFile = async (store: string, category: string, filename: string, deleteLocal: boolean, deleteCloud: boolean) => {
    try {
      const response = await fetch('/api/crawler/storage/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'smart_delete',
          store,
          category,
          filename,
          delete_local: deleteLocal,
          delete_cloud: deleteCloud
        })
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        const deletedItems = [];
        if (deleteLocal) deletedItems.push('local file');
        if (deleteCloud) deletedItems.push('cloud file');
        
        success('File Deleted', `Successfully deleted ${deletedItems.join(' and ')}`);
        loadStorageData(); // Reload data
      } else {
        showError('Delete Failed', result.error || 'Failed to delete file');
      }
    } catch (error) {
      console.error('Delete error:', error);
      showError('Delete Error', 'Error deleting file');
    }
  };

  const handleDownloadFile = async (file: StorageFile) => {
    try {
      const response = await fetch('/api/crawler/storage/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'download',
          store: file.metadata?.store || 'unknown',
          category: file.metadata?.category || 'unknown',
          filename: file.name
        })
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        success('Downloaded to Local', 'File downloaded to local storage for AI processing');
        loadStorageData(); // Refresh to show updated location
      } else {
        showError('Download Failed', result.error || 'Failed to download to local');
      }
    } catch (error) {
      console.error('Download to local error:', error);
      showError('Download Error', 'Error downloading to local storage');
    }
  };

  const filteredFiles = files.filter(file => {
    if (selectedStore !== 'all' && file.store !== selectedStore) return false;
    if (selectedCategory !== 'all' && file.category !== selectedCategory) return false;
    return true;
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  useEffect(() => {
    if (user) {
      loadStorageData();
    }
  }, [user, loadStorageData]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Please log in to access storage management</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Crawler Storage Manager</h2>
        <button
          onClick={loadStorageData}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Storage Stats */}
      {storageStats && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Storage Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Total Files</p>
              <p className="text-2xl font-bold text-blue-600">{storageStats.total_files}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Total Size</p>
              <p className="text-2xl font-bold text-green-600">{formatFileSize(storageStats.total_size)}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Stores</p>
              <p className="text-2xl font-bold text-purple-600">{Object.keys(storageStats.stores).length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {storageStats && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Store</label>
              <select
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="all">All Stores</option>
                {Object.keys(storageStats.stores).map(store => (
                  <option key={store} value={store}>{store}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="all">All Categories</option>
                {selectedStore === 'all' 
                  ? Array.from(new Set(Object.values(storageStats.stores).flatMap(store => Object.keys(store.categories)))).map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))
                  : storageStats.stores[selectedStore] 
                    ? Object.keys(storageStats.stores[selectedStore].categories).map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))
                    : []
                }
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Upload Status */}
      {uploadStatus.uploading && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2"></div>
            <span className="text-yellow-800">
              Uploading files to Firebase... ({uploadStatus.pendingFiles} pending)
            </span>
          </div>
        </div>
      )}

      {/* Files List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Files ({filteredFiles.length})</h3>
        </div>
        
        {filteredFiles.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {loading ? 'Loading files...' : 'No files found'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    File
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Store/Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredFiles.map((file, index) => (
                  <SmartFileRow
                    key={`${file.name}-${index}`}
                    file={file}
                    onStatusChange={loadStorageData}
                    onDelete={handleDeleteFile}
                    onDownload={handleDownloadFile}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CrawlerStorageManager;
