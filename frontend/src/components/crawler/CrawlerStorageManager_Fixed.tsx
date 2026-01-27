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
  status_class?: string;
  has_local?: boolean;
  has_cloud?: boolean;
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
      
      // Load file list from the backend (includes both local and cloud files with status)
      const filesResponse = await fetch('/api/crawler/storage/files', {
        credentials: 'include'
      });
      
      if (filesResponse.ok) {
        const fileData = await filesResponse.json();
        console.log('Files response:', fileData);
        
        // Handle the files array format
        if (fileData.files && Array.isArray(fileData.files)) {
          // Sort files by most recent first
          const sortedFiles = fileData.files.sort((a: StorageFile, b: StorageFile) => {
            const timeA = new Date(a.updated || a.created || 0).getTime();
            const timeB = new Date(b.updated || b.created || 0).getTime();
            return timeB - timeA;
          });
          
          setFiles(sortedFiles);
          
          // Generate storage stats from files
          if (sortedFiles.length > 0) {
            const stats = generateStorageStats(sortedFiles);
            setStorageStats(stats);
          } else {
            setStorageStats(null);
          }
        } else {
          console.warn('Unexpected file data format:', fileData);
          setFiles([]);
          setStorageStats(null);
        }
      } else {
        console.error('Failed to load files:', filesResponse.status);
        const errorText = await filesResponse.text();
        console.error('Error details:', errorText);
        showError('Storage Error', 'Failed to load files');
        setFiles([]);
        setStorageStats(null);
      }
      
    } catch (error) {
      console.error('Failed to load storage data:', error);
      showError('Storage Error', 'Failed to load storage data');
      setFiles([]);
      setStorageStats(null);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const checkUploadStatus = useCallback(async () => {
    try {
      // Check if there are any files currently uploading
      const uploadingFiles = files.filter(file => 
        file.location === 'Uploading...' || 
        file.status_class === 'uploading'
      );
      
      setUploadStatus(prev => ({
        ...prev,
        uploading: uploadingFiles.length > 0,
        pendingFiles: uploadingFiles.length,
        lastUpload: uploadingFiles.length > 0 ? new Date().toISOString() : prev.lastUpload
      }));
    } catch (error) {
      console.error('Failed to check upload status:', error);
    }
  }, [files]);

  useEffect(() => {
    if (user) {
      loadStorageData();
      loadStorageConfig();
      checkUploadStatus();
      
      // Set up periodic checks for file changes and upload status
      const interval = setInterval(() => {
        loadStorageData(); // Refresh file list to catch new uploads and status changes
        checkUploadStatus();
      }, 5000); // Check every 5 seconds for real-time updates
      
      return () => clearInterval(interval);
    }
  }, [user, loadStorageData, checkUploadStatus]);

  const loadStorageConfig = async () => {
    try {
      const response = await fetch('/api/crawler/storage/config', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const config = await response.json();
        setStorageConfig(config);
      }
    } catch (error) {
      console.error('Failed to load storage config:', error);
    }
  };

  const saveStorageConfig = async () => {
    try {
      const response = await fetch('/api/crawler/storage/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(storageConfig)
      });
      
      if (response.ok) {
        success('Configuration Saved', 'Storage configuration updated successfully');
      } else {
        showError('Save Failed', 'Failed to save storage configuration');
      }
    } catch (error) {
      showError('Save Error', 'Error saving storage configuration');
    }
  };

  const downloadFile = async (file: StorageFile) => {
    try {
      const cloudPath = file.metadata?.full_path || file.name;
      
      const response = await fetch('/api/crawler/storage/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          operation: 'download_to_browser',
          cloud_path: cloudPath
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        success('Download Complete', 'File downloaded to your device');
      } else {
        showError('Download Failed', 'Failed to download file');
      }
    } catch (error) {
      console.error('Download error:', error);
      showError('Download Error', 'Error downloading file');
    }
  };

  const handleSmartDelete = async (store: string, category: string, filename: string, deleteLocal: boolean, deleteCloud: boolean) => {
    try {
      // Call the API with proper parameters for OneDrive-like delete (both local and cloud)
      const response = await fetch('/api/crawler/storage/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'smart_delete',
          store,
          category,
          filename,
          delete_local: true,  // Always delete local (OneDrive-like)
          delete_cloud: true   // Always delete cloud (OneDrive-like)
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          success('File Deleted', `Successfully deleted "${filename}" from both local and cloud storage`);
          
          // Immediately refresh to show updated state
          await loadStorageData();
        } else {
          showError('Delete Failed', result.error || 'Failed to delete file');
        }
      } else {
        showError('Delete Failed', 'Failed to delete file');
      }
    } catch (error) {
      console.error('Delete error:', error);
      showError('Delete Error', 'Error deleting file');
    }
  };

  const triggerManualUpload = async () => {
    try {
      setUploadStatus(prev => ({ ...prev, uploading: true }));
      
      const response = await fetch('/api/crawler/storage/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'auto_upload',
          store: selectedStore === 'all' ? '' : selectedStore,
          category: selectedCategory === 'all' ? '' : selectedCategory
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          success('Upload Started', `Started uploading ${result.count || 0} files to cloud storage`);
          
          // Refresh immediately to show uploading status
          await loadStorageData();
          
          // Continue monitoring upload progress
          const monitorInterval = setInterval(async () => {
            await loadStorageData();
            
            // Check if uploads are complete
            const uploadingFiles = files.filter(file => 
              file.location === 'Uploading...' || file.status_class === 'uploading'
            );
            
            if (uploadingFiles.length === 0) {
              clearInterval(monitorInterval);
              setUploadStatus(prev => ({ ...prev, uploading: false }));
            }
          }, 2000);
          
          // Stop monitoring after 2 minutes max
          setTimeout(() => {
            clearInterval(monitorInterval);
            setUploadStatus(prev => ({ ...prev, uploading: false }));
          }, 120000);
          
        } else {
          showError('Upload Failed', result.error || 'Failed to upload files');
          setUploadStatus(prev => ({ ...prev, uploading: false }));
        }
      } else {
        showError('Upload Failed', 'Failed to upload files');
        setUploadStatus(prev => ({ ...prev, uploading: false }));
      }
    } catch (error) {
      console.error('Upload error:', error);
      showError('Upload Error', 'Error uploading files');
      setUploadStatus(prev => ({ ...prev, uploading: false }));
    }
  };

  const clearAllFiles = async () => {
    if (!confirm('Are you sure you want to clear all files? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/crawler/storage/files?clearAll=true', {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        success('Files Cleared', 'All files have been cleared');
        loadStorageData();
      } else {
        showError('Clear Failed', 'Failed to clear files');
      }
    } catch (error) {
      console.error('Clear error:', error);
      showError('Clear Error', 'Error clearing files');
    }
  };

  const generateStorageStats = (files: StorageFile[]): StorageStats => {
    const stats: StorageStats = {
      total_files: files.length,
      total_size: 0,
      total_size_mb: 0,
      stores: {}
    };

    files.forEach(file => {
      const store = file.metadata?.store || 'unknown';
      const category = file.metadata?.category || 'unknown';
      
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

      const fileSize = file.size || 0;
      stats.total_size += fileSize;
      stats.stores[store].total_size += fileSize;
      stats.stores[store].total_files += 1;
      stats.stores[store].categories[category].files += 1;
      stats.stores[store].categories[category].size += fileSize;
    });

    stats.total_size_mb = Math.round((stats.total_size / (1024 * 1024)) * 100) / 100;
    return stats;
  };

  // Filter files based on selected store and category
  const filteredFiles = files.filter(file => {
    const fileStore = file.metadata?.store || '';
    const fileCategory = file.metadata?.category || '';
    
    const storeMatch = selectedStore === 'all' || fileStore === selectedStore;
    const categoryMatch = selectedCategory === 'all' || fileCategory === selectedCategory;
    
    return storeMatch && categoryMatch;
  });

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Firebase Storage Files
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Manage crawler output files stored in Firebase
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={loadStorageData}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 mr-2"></div>
              ) : (
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              Refresh
            </button>
            <button
              onClick={triggerManualUpload}
              disabled={uploadStatus.uploading || loading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {uploadStatus.uploading && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              )}
              Manual Upload
            </button>
            <button
              onClick={clearAllFiles}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Storage Statistics */}
        {storageStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{storageStats.total_files}</div>
              <div className="text-sm text-blue-600">Total Files</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{storageStats.total_size_mb} MB</div>
              <div className="text-sm text-green-600">Total Size</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{Object.keys(storageStats.stores).length}</div>
              <div className="text-sm text-purple-600">Active Stores</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{uploadStatus.pendingFiles}</div>
              <div className="text-sm text-yellow-600">Pending Uploads</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex space-x-4 mb-6">
          <div className="flex-1">
            <label htmlFor="store-filter" className="block text-sm font-medium text-gray-700">
              Store
            </label>
            <select
              id="store-filter"
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="all">All Stores</option>
              <option value="keells">Keells</option>
              <option value="cargills">Cargills</option>
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700">
              Category
            </label>
            <select
              id="category-filter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="all">All Categories</option>
              <option value="fruits">Fruits</option>
              <option value="vegetables">Vegetables</option>
            </select>
          </div>
        </div>

        {/* Files Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  File Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Store/Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Loading files...</p>
                  </td>
                </tr>
              ) : filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No files found
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file, index) => (
                  <SmartFileRow
                    key={`${file.name}-${index}`}
                    file={file}
                    onStatusChange={loadStorageData}
                    onDelete={handleSmartDelete}
                    onDownload={downloadFile}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Storage Configuration */}
        <div className="mt-8 border-t pt-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Storage Configuration</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={storageConfig.auto_upload}
                  onChange={(e) => setStorageConfig(prev => ({ ...prev, auto_upload: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm text-gray-700">Auto-upload new files</span>
              </label>
            </div>
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={storageConfig.auto_cleanup}
                  onChange={(e) => setStorageConfig(prev => ({ ...prev, auto_cleanup: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm text-gray-700">Auto-cleanup old files</span>
              </label>
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={saveStorageConfig}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CrawlerStorageManager;
