'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useGlobalToast } from '@/contexts/ToastContext';
import { 
  Cloud, 
  DocumentText1, 
  ArrowDown, 
  Eye, 
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
  SearchNormal1,
  CloudAdd,
  CloudChange,
  CloudRemove,
  TickCircle,
  CloseCircle,
  InfoCircle
} from 'iconsax-react';

interface SmartFile {
  name: string;
  size: number;
  store: string;
  category: string;
  created: string;
  updated: string;
  has_local: boolean;
  has_cloud: boolean;
  status_class: string;
  status?: string;
  upload_status?: string;
  location?: string;
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

type StoreSummary = Record<string, {
  total: number;
  local_only: number;
  cloud_only: number;
  both: number;
}>;

interface FileSummary {
  totalFiles: number;
  statusCounts: Record<string, number>;
  stores: StoreSummary;
  totalSizeBytes: number;
  totalSizeDisplay: string;
  generatedAt: string;
}

interface FileStats {
  total: number;
  local_only: number;
  cloud_only: number;
  both: number;
  uploading: number;
  downloading: number;
  failed: number;
  totalSize: number;
}

interface SmartFileManagerProps {
  onViewFile?: (file: SmartFile) => void;
  onLoadToClassifier?: (file: SmartFile) => void;
}

const SmartFileManager: React.FC<SmartFileManagerProps> = ({
  onViewFile,
  onLoadToClassifier
}) => {
  const { success, error: showError, info, warning } = useGlobalToast();
  const router = useRouter();
  
  // State management
  const [files, setFiles] = useState<SmartFile[]>([]);
  const [summary, setSummary] = useState<FileSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'status'>('date');
  const [filterStatus, setFilterStatus] = useState<'all' | 'cloud_only' | 'uploading' | 'failed'>('all');
  const [selectedStore, setSelectedStore] = useState<'all' | 'keells' | 'cargills'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionInProgress, setActionInProgress] = useState<{[key: string]: string}>({});
  const [progressInfo, setProgressInfo] = useState<{[key: string]: number}>({});

  // Load files from API
  const loadFiles = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
      setRefreshing(true);
    }
    try {
      const response = await fetch('/api/crawler/storage/files', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.files) {
          setFiles(data.files);
          setSummary(data.summary ?? null);
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
      if (showLoader) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [showError]);

  // Load files on mount only, refresh manually or after operations
  useEffect(() => {
    loadFiles();
  }, []);

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
          case 'cloud_only':
            return file.has_cloud; // All files are cloud-only now
          case 'uploading':
            return file.status_class === 'uploading';
          case 'failed':
            return file.status_class === 'failed';
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
    if (summary) {
      const counts = summary.statusCounts || {};
      const safeNumber = (value: unknown): number => (typeof value === 'number' && !Number.isNaN(value) ? value : 0);
      return {
        total: typeof summary.totalFiles === 'number' ? summary.totalFiles : files.length,
        local_only: safeNumber(counts.local_only),
        cloud_only: safeNumber(counts.cloud_only),
        both: safeNumber(counts.both),
        uploading: safeNumber(counts.uploading),
        downloading: safeNumber(counts.downloading),
        failed: safeNumber(counts.failed),
        totalSize: typeof summary.totalSizeBytes === 'number' ? summary.totalSizeBytes : files.reduce((sum, file) => sum + file.size, 0)
      };
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    return {
      total: files.length,
      local_only: 0, // No longer tracking local-only files
      cloud_only: files.filter(f => f.has_cloud).length, // All files are cloud
      both: 0, // No longer tracking both locations
      uploading: files.filter(f => f.status_class === 'uploading').length,
      downloading: 0, // No longer downloading to local
      failed: files.filter(f => f.status_class === 'failed').length,
      totalSize
    };
  }, [files, summary]);

  // Helper functions
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatRelativeTimestamp = (isoString?: string): string => {
    if (!isoString) return 'unknown time';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return 'unknown time';

    const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSeconds < 0) return 'just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleString();
  };

  const formatAbsoluteTimestamp = (isoString?: string): string => {
    if (!isoString) return 'Unknown timestamp';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return 'Unknown timestamp';
    return date.toLocaleString();
  };

  const prettifyStoreName = (name: string): string => {
    if (!name) return 'Unknown';
    return name
      .split(/[-_]/)
      .filter(Boolean)
      .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  };

  const getFileId = (file: SmartFile): string => {
    return `${file.store}-${file.category}-${file.name}`;
  };

  const setFileAction = (file: SmartFile, action: string) => {
    const fileId = getFileId(file);
    setActionInProgress(prev => ({ ...prev, [fileId]: action }));
  };

  const clearFileAction = (file: SmartFile) => {
    const fileId = getFileId(file);
    setActionInProgress(prev => {
      const newState = { ...prev };
      delete newState[fileId];
      return newState;
    });
  };

  // OneDrive-like file actions
  const handleViewFile = async (file: SmartFile) => {
    try {
      setFileAction(file, 'viewing');

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
      clearFileAction(file);
    }
  };

  const handleLoadToClassifier = async (file: SmartFile) => {
    // If a parent onLoadToClassifier is provided, use it instead
    if (onLoadToClassifier) {
      onLoadToClassifier(file);
      return;
    }

    // Otherwise, handle it directly with the fast method
    try {
      setFileAction(file, 'loading');

      // Use the same fast method as the working view window - direct file content API
      const response = await fetch('/api/crawler/storage/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          operation: 'get_file_content_as_json',
          store: file.store,
          category: file.category,
          filename: file.name
        })
      });
        
      if (response.ok) {
        const content = await response.json();
        const productCount = content?.items?.length || 0;
        
        if (productCount === 0) {
          warning('Empty File', 'No products found in this file');
          return;
        }
        
        // Store products in localStorage for classifier
        localStorage.setItem('crawlerProducts', JSON.stringify(content.items));
        localStorage.setItem('crawlerProductsTimestamp', new Date().toISOString());
        
        // Show confirmation dialog and offer navigation (same as working pattern)
        const shouldNavigate = await new Promise<boolean>((resolve) => {
          const dialog = document.createElement('div');
          dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
          dialog.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
              <h3 class="text-lg font-semibold text-gray-800 mb-4">Products Ready for Classification</h3>
              <p class="text-gray-600 mb-6">Successfully prepared ${productCount} products for classification! Would you like to go to the Classification page now?</p>
              <div class="flex justify-end gap-3">
                <button id="stay-btn" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md border">Cancel</button>
                <button id="navigate-btn" class="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-md">Confirm</button>
              </div>
            </div>
          `;
          
          document.body.appendChild(dialog);
          
          const stayBtn = dialog.querySelector('#stay-btn');
          const navigateBtn = dialog.querySelector('#navigate-btn');
          
          const cleanup = () => {
            document.body.removeChild(dialog);
          };
          
          stayBtn?.addEventListener('click', () => {
            cleanup();
            resolve(false);
          });
          
          navigateBtn?.addEventListener('click', () => {
            cleanup();
            resolve(true);
          });
          
          // Close on backdrop click
          dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
              cleanup();
              resolve(false);
            }
          });
        });
        
        if (shouldNavigate) {
          // Use Next.js router for navigation to prevent auth refresh
          router.push('/app/classifier');
        } else {
          success('Products Ready', `${productCount} products are now available in the Classification page.`);
        }
      } else {
        showError('Load Failed', 'Failed to load file content');
      }
    } catch (error) {
      console.error('Load to classifier error:', error);
      showError('Load Error', 'Failed to load file content for classifier');
    } finally {
      clearFileAction(file);
    }
  };

  const handleMakeCloudOnly = async (file: SmartFile) => {
    // Check if file is in cloud or both locations
    if (!file.has_cloud) {
      warning('Not Available', `File must be uploaded to cloud first. Has cloud: ${file.has_cloud}, Has local: ${file.has_local}`);
      return;
    }

    try {
      setFileAction(file, 'cloud_only');
      console.log('Making file cloud-only:', { store: file.store, category: file.category, filename: file.name });
      
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

      const result = await response.json();
      console.log('Cloud-only response:', result);
      
      if (response.ok && result.success) {
        success('File Updated', 'Local copy deleted, kept in cloud');
        await loadFiles(false);
      } else {
        showError('Operation Failed', result.error || result.message || 'Failed to move file to cloud-only');
      }
    } catch (error) {
      console.error('Cloud-only error:', error);
      showError('Operation Error', 'Failed to move file to cloud-only');
    } finally {
      clearFileAction(file);
    }
  };

  const handleMakeLocal = async (file: SmartFile) => {
    if (!file.has_cloud) {
      warning('Not Available', 'File is not available in cloud storage');
      return;
    }

    try {
      setFileAction(file, 'downloading');
      
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
          success('File Downloaded', 'File downloaded to local storage');
          loadFiles(false);
        } else {
          showError('Download Failed', result.error || 'Failed to download file');
        }
      } else {
        showError('Download Failed', 'Failed to download file');
      }
    } catch (error) {
      showError('Download Error', 'Failed to download file');
    } finally {
      clearFileAction(file);
    }
  };

  const handleDownloadAndInspect = async (file: SmartFile) => {
    try {
      setFileAction(file, 'inspecting');
      const url = `/api/crawler/storage/files/${encodeURIComponent(file.store)}/${encodeURIComponent(file.category)}/${encodeURIComponent(file.name)}/download-inspect`;
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorMessage = `Download failed (${response.status})`;
        showError('Inspect Download Failed', errorMessage);
        return;
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const tempLink = document.createElement('a');
      tempLink.href = downloadUrl;
      tempLink.download = file.name;
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      window.URL.revokeObjectURL(downloadUrl);

      const storageStatus = response.headers.get('X-Shopple-Storage-Status');
      success(
        'Download Complete',
        storageStatus === 'cloud_only'
          ? 'File downloaded for inspection. Local copy remains cloud-only.'
          : 'File downloaded for inspection.'
      );

      await loadFiles(false);
    } catch (error) {
      console.error('Download & inspect error:', error);
      showError('Inspect Error', 'Failed to download file for inspection');
    } finally {
      clearFileAction(file);
    }
  };

  const handleUploadToCloud = async (file: SmartFile) => {
    if (!file.has_local) {
      warning('Not Available', 'File is not available locally');
      return;
    }

    try {
      setFileAction(file, 'uploading');
      
      const response = await fetch('/api/crawler/storage/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          operation: 'upload_to_cloud',
          store: file.store,
          category: file.category,
          filename: file.name
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          success('File Uploaded', 'File uploaded to cloud storage');
          loadFiles(false);
        } else {
          showError('Upload Failed', result.error || 'Failed to upload file');
        }
      } else {
        showError('Upload Failed', 'Failed to upload file');
      }
    } catch (error) {
      showError('Upload Error', 'Failed to upload file');
    } finally {
      clearFileAction(file);
    }
  };

  const handleDeleteFile = async (file: SmartFile) => {
    try {
      setFileAction(file, 'deleting');
      
      // Optimistically remove from UI immediately
      const fileId = getFileId(file);
      setFiles(prevFiles => prevFiles.filter(f => getFileId(f) !== fileId));
      
      // Determine what to delete based on file status
      let deleteLocal = false;
      let deleteCloud = false;
      
      if (file.has_local && file.has_cloud) {
        deleteLocal = true;
        deleteCloud = true;
      } else if (file.has_local) {
        deleteLocal = true;
      } else if (file.has_cloud) {
        deleteCloud = true;
      }
      
      const response = await fetch('/api/crawler/storage/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'smart_delete',
          store: file.store,
          category: file.category,
          filename: file.name,
          delete_local: deleteLocal,
          delete_cloud: deleteCloud
        })
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        success('Deleted', 'File removed successfully');
        // File already removed from UI, no need to reload
      } else {
        showError('Delete Failed', result.error || 'Failed to delete file');
        // Restore file on error
        setFiles(prevFiles => [...prevFiles, file]);
      }
    } catch (error) {
      console.error('Delete error:', error);
      showError('Delete Error', 'Failed to delete file');
      // Restore file on error
      setFiles(prevFiles => [...prevFiles, file]);
    } finally {
      clearFileAction(file);
    }
  };

  // Status icon component
  const getStatusIcon = (file: SmartFile) => {
    const fileId = getFileId(file);
    const currentAction = actionInProgress[fileId];
    
    if (currentAction) {
      switch (currentAction) {
        case 'uploading':
          return <ArrowUp size={16} className="text-blue-500 animate-pulse" />;
        case 'downloading':
          return <ArrowDown size={16} className="text-blue-500 animate-pulse" />;
        case 'viewing':
          return <Eye size={16} className="text-purple-500 animate-pulse" />;
        case 'loading':
          return <Activity size={16} className="text-green-500 animate-pulse" />;
        case 'deleting':
          return <Trash size={16} className="text-red-500 animate-pulse" />;
        case 'inspecting':
          return <DocumentDownload size={16} className="text-blue-500 animate-pulse" />;
        default:
          return <Activity size={16} className="text-gray-500 animate-pulse" />;
      }
    }
    
    // Normal status icons
    if (file.has_local && file.has_cloud) {
      return <TickCircle size={16} className="text-green-600" />; // Both locations
    } else if (file.has_cloud && !file.has_local) {
      return <Cloud size={16} className="text-blue-600" />; // Cloud only
    } else if (file.has_local && !file.has_cloud) {
      return <Monitor size={16} className="text-gray-600" />; // Local only
    } else if (file.status_class === 'uploading') {
      return <ArrowUp size={16} className="text-blue-500 animate-pulse" />; // Uploading
    } else {
      return <CloseCircle size={16} className="text-red-500" />; // Error state
    }
  };

  const getStatusText = (file: SmartFile): string => {
    const fileId = getFileId(file);
    const currentAction = actionInProgress[fileId];
    
    if (currentAction) {
      switch (currentAction) {
        case 'uploading':
          return 'Uploading...';
        case 'downloading':
          return 'Downloading...';
        case 'viewing':
          return 'Preparing view...';
        case 'loading':
          return 'Loading to classifier...';
        case 'deleting':
          return 'Deleting...';
        case 'inspecting':
          return 'Preparing inspection download...';
        default:
          return 'Processing...';
      }
    }
    
    if (file.has_local && file.has_cloud) {
      return 'Available locally and in cloud';
    } else if (file.has_cloud && !file.has_local) {
      return 'Cloud only';
    } else if (file.has_local && !file.has_cloud) {
      return 'Local only';
    } else if (file.status_class === 'uploading') {
      return 'Uploading to cloud...';
    } else {
      return 'Unknown status';
    }
  };

  const getStatusBadge = (file: SmartFile) => {
    const status = file.status_class || file.status;
    switch (status) {
      case 'cloud_only':
        return {
          label: 'Cloud Only',
          className: 'bg-blue-50 text-blue-700 border border-blue-200'
        };
      case 'uploading':
        return {
          label: 'Uploading',
          className: 'bg-orange-50 text-orange-700 border border-orange-200'
        };
      case 'failed':
        return {
          label: 'Failed Sync',
          className: 'bg-red-50 text-red-700 border border-red-200'
        };
      case 'both':
        return {
          label: 'Cloud + Local',
          className: 'bg-green-50 text-green-700 border border-green-200'
        };
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Activity size={32} className="text-primary animate-spin" />
        <span className="ml-3 text-lg">Loading files...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Intelligent File Management</h3>
          <button
            onClick={() => loadFiles(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={refreshing}
          >
            <Refresh2 size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        
        {/* Stats - Cloud-Only Storage */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600">Total Files</div>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <div className="text-xl font-bold text-purple-600">{stats.cloud_only}</div>
            <div className="text-sm text-gray-600">Cloud Storage</div>
          </div>
          <div className="text-center p-3 bg-orange-50 rounded-lg">
            <div className="text-xl font-bold text-orange-600">{stats.uploading}</div>
            <div className="text-sm text-gray-600">Uploading</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-xl font-bold text-gray-900">{summary?.totalSizeDisplay ?? formatFileSize(stats.totalSize)}</div>
            <div className="text-sm text-gray-600">Total Size</div>
          </div>
        </div>
        
        {/* Cloud-Only Notice */}
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <Cloud size={20} className="flex-shrink-0" />
          <span>All crawler files are stored in Firebase Cloud Storage for reliability and accessibility.</span>
        </div>

        {summary && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Timer size={14} className="text-gray-400" />
                <span title={formatAbsoluteTimestamp(summary.generatedAt)}>
                  Last sync {formatRelativeTimestamp(summary.generatedAt)}
                </span>
              </span>
              <span className="hidden md:inline text-gray-300">|</span>
              <span>Total payload {summary.totalFiles} files | {summary.totalSizeDisplay}</span>
            </div>

            {Object.keys(summary.stores || {}).length > 0 && (
              <div className="mt-4 flex flex-col md:flex-row gap-3">
                {Object.entries(summary.stores).map(([storeName, storeStats]) => (
                  <div key={storeName} className="border border-gray-200 rounded-lg p-3 bg-gray-50 flex-1">
                    <div className="flex items-center justify-between text-sm font-medium text-gray-700">
                      <span>{prettifyStoreName(storeName)}</span>
                      <span className="text-xs text-gray-500">{storeStats.total} files</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600">
                      <div className="rounded-md bg-white shadow-inner px-2 py-1 text-center">
                        <div className="font-semibold text-green-600">{storeStats.local_only}</div>
                        <div className="text-[11px] text-gray-500">Local</div>
                      </div>
                      <div className="rounded-md bg-white shadow-inner px-2 py-1 text-center">
                        <div className="font-semibold text-purple-600">{storeStats.cloud_only}</div>
                        <div className="text-[11px] text-gray-500">Cloud</div>
                      </div>
                      <div className="rounded-md bg-white shadow-inner px-2 py-1 text-center">
                        <div className="font-semibold text-blue-600">{storeStats.both}</div>
                        <div className="text-[11px] text-gray-500">Synced</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <SearchNormal1 size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="all">All Files</option>
            <option value="cloud_only">Cloud Storage</option>
            <option value="uploading">Uploading</option>
            <option value="failed">Failed</option>
          </select>

          {/* Store Filter */}
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="all">All Stores</option>
            <option value="keells">Keells</option>
            <option value="cargills">Cargills</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="size">Sort by Size</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>
      </div>

      {/* Files List */}
      <div className="bg-white rounded-lg border">
        {processedFiles.length === 0 ? (
          <div className="text-center py-12">
            <Folder size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="text-lg text-gray-600 mb-2">No files found</p>
            <p className="text-sm text-gray-500">
              {searchTerm ? 'Try adjusting your search criteria' : 'Start a crawler to generate files'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {processedFiles.map((file) => {
              const fileId = getFileId(file);
              const currentAction = actionInProgress[fileId];
              const statusBadge = getStatusBadge(file);
              
              return (
                <div key={fileId} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      {/* File Icon */}
                      <div className="flex-shrink-0">
                        <DocumentText1 size={24} className="text-blue-600" />
                      </div>
                      
                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-sm font-medium text-gray-900 truncate">{file.name}</h4>
                          {statusBadge && (
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusBadge.className}`}>
                              {statusBadge.label}
                            </span>
                          )}
                          {getStatusIcon(file)}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          <span className="capitalize">{file.store}</span> • {file.category} • {formatFileSize(file.size)}
                          {file.metadata.itemCount && (
                            <span> • {file.metadata.itemCount} items</span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-gray-400">
                          {getStatusText(file)}
                        </div>
                        <div className="mt-1 text-xs text-gray-400 flex items-center gap-1">
                          <Timer size={12} className="text-gray-400" />
                          <span title={formatAbsoluteTimestamp(file.updated || file.created)}>
                            Updated {formatRelativeTimestamp(file.updated || file.created)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center space-x-2">
                      {/* View Button */}
                      <button
                        onClick={() => handleViewFile(file)}
                        disabled={currentAction === 'viewing'}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                        title="View file"
                      >
                        <Eye size={16} />
                      </button>

                      {/* Load to Classifier - All files available from cloud */}
                      {file.has_cloud && (
                        <button
                          onClick={() => handleLoadToClassifier(file)}
                          disabled={currentAction === 'loading'}
                          className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Load to classifier from cloud"
                        >
                          <Activity size={16} />
                        </button>
                      )}

                      {/* Download from Cloud (via view) */}
                      {file.has_cloud && (
                        <button
                        onClick={() => handleDownloadAndInspect(file)}
                        disabled={currentAction === 'inspecting'}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Download & inspect (keeps cloud-only)"
                        >
                          <DocumentDownload size={16} />
                        </button>
                      )}

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDeleteFile(file)}
                        disabled={currentAction === 'deleting'}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete file"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SmartFileManager;
