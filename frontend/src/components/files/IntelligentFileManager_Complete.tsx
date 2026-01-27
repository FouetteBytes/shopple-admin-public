'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useGlobalToast } from '@/contexts/ToastContext';
import { 
  Cloud, 
  DocumentText1, 
  ArrowDown as Download, 
  Eye, 
  ArrowUp as Upload, 
  ArrowDown as CloudDownload, 
  Trash, 
  Add,
  DocumentDownload,
  Refresh2,
  Activity,
  Folder,
  Monitor,
  Timer,
  Document,
  Archive,
  ArrowUp,
  FolderOpen,
  Sort,
  Filter,
  SearchNormal1
} from 'iconsax-react';

interface FileStatus {
  location: 'local' | 'uploading' | 'cloud_only' | 'both' | 'downloading' | 'failed';
  uploadProgress?: number;
  downloadProgress?: number;
  hasLocal: boolean;
  hasCloud: boolean;
  isUploading: boolean;
  isDownloading: boolean;
  lastSync?: string;
}

interface IntelligentFile {
  name: string;
  size: number;
  store: string;
  category: string;
  created: string;
  updated: string;
  location: string;
  status_class: string;
  has_local: boolean;
  has_cloud: boolean;
  metadata: {
    store: string;
    category: string;
    full_path: string;
    localPath?: string;
    cloudPath?: string;
    itemCount?: number;
  };
  public_url?: string;
}

interface FileStats {
  total: number;
  local: number;
  cloud: number;
  both: number;
  uploading: number;
  totalSize: number;
}

interface IntelligentFileManagerProps {
  onViewFile?: (file: IntelligentFile) => void;
  onLoadToClassifier?: (file: IntelligentFile) => void;
}

const IntelligentFileManager: React.FC<IntelligentFileManagerProps> = ({
  onViewFile,
  onLoadToClassifier
}) => {
  const { success, error: showError, info } = useGlobalToast();
  
  // State management
  const [files, setFiles] = useState<IntelligentFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'status'>('date');
  const [filterStatus, setFilterStatus] = useState<'all' | 'local' | 'cloud' | 'both' | 'uploading'>('all');
  const [selectedStore, setSelectedStore] = useState<'all' | 'keells' | 'cargills'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [actionInProgress, setActionInProgress] = useState<{[key: string]: string}>({});

  // Load files from API
  const loadFiles = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const response = await fetch('/api/crawler/storage/files', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.files) {
          setFiles(data.files);
        } else {
          showError('Load Error', 'Failed to load files');
        }
      } else {
        showError('Load Error', 'Failed to load files');
      }
    } catch (error) {
      console.error('Load files error:', error);
      showError('Load Error', 'Failed to load files');
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [showError]);

  // Auto-refresh files (reduced from 5s to 30s to avoid overloading local cluster)
  useEffect(() => {
    loadFiles();
    const interval = setInterval(() => loadFiles(false), 30000);
    return () => clearInterval(interval);
  }, [loadFiles]);

  // Process and filter files
  const processedFiles = useMemo(() => {
    let filtered = [...files];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(file => 
        file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.store.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(file => {
        switch (filterStatus) {
          case 'local':
            return file.has_local && !file.has_cloud;
          case 'cloud':
            return file.has_cloud && !file.has_local;
          case 'both':
            return file.has_local && file.has_cloud;
          case 'uploading':
            return file.status_class === 'uploading';
          default:
            return true;
        }
      });
    }

    // Apply store filter
    if (selectedStore !== 'all') {
      filtered = filtered.filter(file => file.store === selectedStore);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'size':
          return b.size - a.size;
        case 'status':
          return a.status_class.localeCompare(b.status_class);
        case 'date':
        default:
          return new Date(b.updated || b.created).getTime() - new Date(a.updated || a.created).getTime();
      }
    });

    return filtered;
  }, [files, searchTerm, filterStatus, selectedStore, sortBy]);

  // Calculate statistics
  const stats: FileStats = useMemo(() => {
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    return {
      total: files.length,
      local: files.filter(f => f.has_local && !f.has_cloud).length,
      cloud: files.filter(f => f.has_cloud && !f.has_local).length,
      both: files.filter(f => f.has_local && f.has_cloud).length,
      uploading: files.filter(f => f.status_class === 'uploading').length,
      totalSize
    };
  }, [files]);

  // File actions
  const handleViewFile = async (file: IntelligentFile) => {
    try {
      const fileId = `${file.store}-${file.category}-${file.name}`;
      setActionInProgress(prev => ({ ...prev, [fileId]: 'viewing' }));

      // If file is cloud-only, download it first
      if (!file.has_local && file.has_cloud) {
        info('Downloading File', 'Downloading file from cloud for viewing...');
        
        const response = await fetch('/api/crawler/storage/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            operation: 'download_to_local',
            store: file.store,
            category: file.category,
            filename: file.name
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            success('File Ready', 'File downloaded and ready for viewing');
            // Refresh files to show updated status
            await loadFiles(false);
          } else {
            showError('Download Failed', result.error || 'Failed to download file');
            return;
          }
        } else {
          showError('Download Failed', 'Failed to download file');
          return;
        }
      }

      // Now view the file
      if (onViewFile) {
        onViewFile(file);
      }
    } catch (error) {
      showError('View Error', 'Failed to view file');
    } finally {
      const fileId = `${file.store}-${file.category}-${file.name}`;
      setActionInProgress(prev => {
        const newState = { ...prev };
        delete newState[fileId];
        return newState;
      });
    }
  };

  const handleLoadToClassifier = async (file: IntelligentFile) => {
    try {
      const fileId = `${file.store}-${file.category}-${file.name}`;
      setActionInProgress(prev => ({ ...prev, [fileId]: 'loading' }));

      // If file is cloud-only, download it first
      if (!file.has_local && file.has_cloud) {
        info('Downloading File', 'Downloading file from cloud for classifier...');
        
        const response = await fetch('/api/crawler/storage/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            operation: 'download_to_local',
            store: file.store,
            category: file.category,
            filename: file.name
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            success('File Ready', 'File downloaded and ready for classifier');
            // Refresh files to show updated status
            await loadFiles(false);
          } else {
            showError('Download Failed', result.error || 'Failed to download file');
            return;
          }
        } else {
          showError('Download Failed', 'Failed to download file');
          return;
        }
      }

      // Now load to classifier
      if (onLoadToClassifier) {
        onLoadToClassifier(file);
      }
    } catch (error) {
      showError('Load Error', 'Failed to load file to classifier');
    } finally {
      const fileId = `${file.store}-${file.category}-${file.name}`;
      setActionInProgress(prev => {
        const newState = { ...prev };
        delete newState[fileId];
        return newState;
      });
    }
  };

  const handleDownload = async (file: IntelligentFile) => {
    try {
      const fileId = `${file.store}-${file.category}-${file.name}`;
      setActionInProgress(prev => ({ ...prev, [fileId]: 'downloading' }));

      const response = await fetch('/api/crawler/storage/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          operation: 'download_to_browser',
          cloud_path: file.metadata.full_path
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        success('Download Complete', 'File downloaded successfully');
      } else {
        showError('Download Failed', 'Failed to download file');
      }
    } catch (error) {
      showError('Download Error', 'Failed to download file');
    } finally {
      const fileId = `${file.store}-${file.category}-${file.name}`;
      setActionInProgress(prev => {
        const newState = { ...prev };
        delete newState[fileId];
        return newState;
      });
    }
  };

  const handleMakeCloudOnly = async (file: IntelligentFile) => {
    try {
      const fileId = `${file.store}-${file.category}-${file.name}`;
      setActionInProgress(prev => ({ ...prev, [fileId]: 'making_cloud_only' }));

      const response = await fetch('/api/crawler/storage/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          operation: 'make_cloud_only',
          store: file.store,
          category: file.category,
          filename: file.name
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          success('File Updated', 'File is now cloud-only');
          await loadFiles(false);
        } else {
          showError('Update Failed', result.error || 'Failed to update file');
        }
      } else {
        showError('Update Failed', 'Failed to update file');
      }
    } catch (error) {
      showError('Update Error', 'Failed to update file');
    } finally {
      const fileId = `${file.store}-${file.category}-${file.name}`;
      setActionInProgress(prev => {
        const newState = { ...prev };
        delete newState[fileId];
        return newState;
      });
    }
  };

  const handleMakeLocal = async (file: IntelligentFile) => {
    try {
      const fileId = `${file.store}-${file.category}-${file.name}`;
      setActionInProgress(prev => ({ ...prev, [fileId]: 'making_local' }));

      const response = await fetch('/api/crawler/storage/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          operation: 'download_to_local',
          store: file.store,
          category: file.category,
          filename: file.name
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          success('File Updated', 'File is now available locally');
          await loadFiles(false);
        } else {
          showError('Update Failed', result.error || 'Failed to update file');
        }
      } else {
        showError('Update Failed', 'Failed to update file');
      }
    } catch (error) {
      showError('Update Error', 'Failed to update file');
    } finally {
      const fileId = `${file.store}-${file.category}-${file.name}`;
      setActionInProgress(prev => {
        const newState = { ...prev };
        delete newState[fileId];
        return newState;
      });
    }
  };

  const handleDelete = async (file: IntelligentFile) => {
    if (!confirm(`Are you sure you want to delete "${file.name}"? This will remove it from both local and cloud storage.`)) {
      return;
    }

    try {
      const fileId = `${file.store}-${file.category}-${file.name}`;
      setActionInProgress(prev => ({ ...prev, [fileId]: 'deleting' }));

      const response = await fetch('/api/crawler/storage/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'smart_delete',
          store: file.store,
          category: file.category,
          filename: file.name,
          delete_local: true,
          delete_cloud: true
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          success('File Deleted', 'File deleted successfully');
          await loadFiles(false);
        } else {
          showError('Delete Failed', result.error || 'Failed to delete file');
        }
      } else {
        showError('Delete Failed', 'Failed to delete file');
      }
    } catch (error) {
      showError('Delete Error', 'Failed to delete file');
    } finally {
      const fileId = `${file.store}-${file.category}-${file.name}`;
      setActionInProgress(prev => {
        const newState = { ...prev };
        delete newState[fileId];
        return newState;
      });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadFiles(false);
    setRefreshing(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (file: IntelligentFile) => {
    const fileId = `${file.store}-${file.category}-${file.name}`;
    const action = actionInProgress[fileId];
    
    if (action) {
      return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>;
    }

    switch (file.status_class) {
      case 'uploading':
        return <Upload size={16} className="text-blue-500 animate-pulse" />;
      case 'both':
        return <Cloud size={16} className="text-green-500" />;
      case 'local':
        return <DocumentText1 size={16} className="text-orange-500" />;
      case 'cloud_only':
        return <Document size={16} className="text-blue-500" />;
      default:
        return <DocumentText1 size={16} className="text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploading':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'both':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'local':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'cloud_only':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getActionButtons = (file: IntelligentFile) => {
    const fileId = `${file.store}-${file.category}-${file.name}`;
    const action = actionInProgress[fileId];
    
    if (action) {
      return (
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <span className="text-sm text-gray-600 capitalize">{action.replace('_', ' ')}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        {/* View button */}
        <button
          onClick={() => handleViewFile(file)}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          title="View file"
        >
          <Eye size={16} className="text-gray-600" />
        </button>

        {/* Load to classifier button - only for local files */}
        {file.has_local && (
          <button
            onClick={() => handleLoadToClassifier(file)}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
            title="Load to classifier"
          >
            <Activity size={16} className="text-green-600" />
          </button>
        )}

        {/* Download button */}
        {file.has_cloud && (
          <button
            onClick={() => handleDownload(file)}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
            title="Download file"
          >
            <Download size={16} className="text-blue-600" />
          </button>
        )}

        {/* Make cloud-only button */}
        {file.has_local && file.has_cloud && (
          <button
            onClick={() => handleMakeCloudOnly(file)}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
            title="Make cloud-only"
          >
            <Add size={16} className="text-purple-600" />
          </button>
        )}

        {/* Make local button */}
        {!file.has_local && file.has_cloud && (
          <button
            onClick={() => handleMakeLocal(file)}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
            title="Make local"
          >
            <CloudDownload size={16} className="text-indigo-600" />
          </button>
        )}

        {/* Delete button */}
        <button
          onClick={() => handleDelete(file)}
          className="p-1 rounded-lg hover:bg-red-50 transition-colors"
          title="Delete file"
        >
          <Trash size={16} className="text-red-600" />
        </button>
      </div>
    );
  };

  return (
    <div className="border text-gray-500 w-full p-4 rounded-2xl bg-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center text-sm gap-2">
          <Folder size={18} />
          <p className="text-gray-800 font-medium">Intelligent File Manager</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg border hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Refresh files"
          >
            <Refresh2 size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-xs text-blue-600">Total Files</div>
        </div>
        <div className="bg-green-50 p-3 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{stats.both}</div>
          <div className="text-xs text-green-600">Cloud + Local</div>
        </div>
        <div className="bg-orange-50 p-3 rounded-lg">
          <div className="text-2xl font-bold text-orange-600">{stats.local}</div>
          <div className="text-xs text-orange-600">Local Only</div>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{stats.cloud}</div>
          <div className="text-xs text-purple-600">Cloud Only</div>
        </div>
        <div className="bg-red-50 p-3 rounded-lg">
          <div className="text-2xl font-bold text-red-600">{stats.uploading}</div>
          <div className="text-xs text-red-600">Uploading</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="flex-1 relative">
          <SearchNormal1 size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="local">Local Only</option>
            <option value="cloud">Cloud Only</option>
            <option value="both">Both</option>
            <option value="uploading">Uploading</option>
          </select>

          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Stores</option>
            <option value="keells">Keells</option>
            <option value="cargills">Cargills</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="size">Sort by Size</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>
      </div>

      {/* Files List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-600">Loading files...</span>
          </div>
        ) : processedFiles.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchTerm || filterStatus !== 'all' || selectedStore !== 'all'
              ? 'No files match your filters'
              : 'No files found'
            }
          </div>
        ) : (
          processedFiles.map((file, index) => (
            <div
              key={`${file.store}-${file.category}-${file.name}-${index}`}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                {getStatusIcon(file)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-800 truncate">{file.name}</p>
                    <span className={`px-2 py-1 text-xs rounded-full border ${getStatusColor(file.status_class)}`}>
                      {file.location}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                    <span>{file.store} • {file.category}</span>
                    <span>{formatFileSize(file.size)}</span>
                    <span>{new Date(file.updated || file.created).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getActionButtons(file)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default IntelligentFileManager;
