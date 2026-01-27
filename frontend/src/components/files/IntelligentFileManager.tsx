import React, { useState, useEffect, useCallback } from 'react';
import { useGlobalToast } from '@/contexts/ToastContext';
import { 
  Cloud, 
  DocumentText1, 
  Eye, 
  Trash, 
  CloudAdd,
  DocumentDownload,
  Refresh2,
  Activity,
  ArrowDown,
  ArrowUp
} from 'iconsax-react';

interface FileStatus {
  location: 'local' | 'uploading' | 'cloud' | 'both' | 'downloading' | 'failed';
  uploadProgress?: number;
  downloadProgress?: number;
  hasLocal: boolean;
  hasCloud: boolean;
  isUploading: boolean;
  isDownloading: boolean;
  lastSync?: string;
}

interface IntelligentFile {
  id: string;
  name: string;
  size: number;
  store: string;
  category: string;
  created: string;
  updated: string;
  status: FileStatus;
  metadata?: {
    localPath?: string;
    cloudPath?: string;
    itemCount?: number;
    store: string;
    category: string;
  };
  cloudUrl?: string;
}

interface IntelligentFileManagerProps {
  files: IntelligentFile[];
  onRefresh: () => void;
  onViewFile: (file: IntelligentFile) => void;
  onDeleteFile: (file: IntelligentFile) => void;
  onMakeLocal: (file: IntelligentFile) => void;
  onMakeCloudOnly: (file: IntelligentFile) => void;
  onDownloadFile: (file: IntelligentFile) => void;
  onLoadToClassifier: (file: IntelligentFile) => void;
  refreshing?: boolean;
}

const IntelligentFileManager: React.FC<IntelligentFileManagerProps> = ({
  files,
  onRefresh,
  onViewFile,
  onDeleteFile,
  onMakeLocal,
  onMakeCloudOnly,
  onDownloadFile,
  onLoadToClassifier,
  refreshing = false
}) => {
  const { success, error: showError, info } = useGlobalToast();
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'status'>('date');
  const [filterStatus, setFilterStatus] = useState<'all' | 'local' | 'cloud' | 'both' | 'uploading'>('all');
  const [selectedStore, setSelectedStore] = useState<'all' | string>('all');

  // Sort and filter files
  const processedFiles = React.useMemo(() => {
    let filtered = files;

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(file => {
        switch (filterStatus) {
          case 'local':
            return file.status.hasLocal && !file.status.hasCloud;
          case 'cloud':
            return file.status.hasCloud && !file.status.hasLocal;
          case 'both':
            return file.status.hasLocal && file.status.hasCloud;
          case 'uploading':
            return file.status.isUploading;
          default:
            return true;
        }
      });
    }

    // Filter by store
    if (selectedStore !== 'all') {
      filtered = filtered.filter(file => file.store === selectedStore);
    }

    // Sort files
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'size':
          return b.size - a.size;
        case 'status':
          return a.status.location.localeCompare(b.status.location);
        case 'date':
        default:
          return new Date(b.updated || b.created).getTime() - new Date(a.updated || a.created).getTime();
      }
    });
  }, [files, sortBy, filterStatus, selectedStore]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusDisplay = (status: FileStatus) => {
    if (status.isUploading) {
      return {
        icon: <ArrowUp size={14} className="animate-pulse" />,
        text: `Uploading... ${status.uploadProgress || 0}%`,
        className: 'bg-blue-100 text-blue-800 border-blue-200',
        showProgress: true,
        progress: status.uploadProgress || 0
      };
    }

    if (status.isDownloading) {
      return {
        icon: <ArrowDown size={14} className="animate-pulse" />,
        text: `Downloading... ${status.downloadProgress || 0}%`,
        className: 'bg-green-100 text-green-800 border-green-200',
        showProgress: true,
        progress: status.downloadProgress || 0
      };
    }

    if (status.location === 'failed') {
      return {
        icon: <Activity size={14} />,
        text: 'Sync Failed',
        className: 'bg-red-100 text-red-800 border-red-200',
        showProgress: false
      };
    }

    if (status.hasLocal && status.hasCloud) {
      return {
        icon: <Cloud size={14} />,
        text: 'Cloud + Local',
        className: 'bg-green-100 text-green-800 border-green-200',
        showProgress: false
      };
    }

    if (status.hasCloud && !status.hasLocal) {
      return {
        icon: <CloudAdd size={14} />,
        text: 'Cloud Only',
        className: 'bg-purple-100 text-purple-800 border-purple-200',
        showProgress: false
      };
    }

    if (status.hasLocal && !status.hasCloud) {
      return {
        icon: <DocumentText1 size={14} />,
        text: 'Local Only',
        className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        showProgress: false
      };
    }

    return {
      icon: <Activity size={14} />,
      text: 'Unknown',
      className: 'bg-gray-100 text-gray-800 border-gray-200',
      showProgress: false
    };
  };

  const handleViewFile = async (file: IntelligentFile) => {
    // Load file content directly (backend handles both local and cloud efficiently)
    onViewFile(file);
  };

  const handleLoadToClassifier = async (file: IntelligentFile) => {
    // Load file content directly (backend handles both local and cloud efficiently)
    onLoadToClassifier(file);
  };

  // Get unique stores for filter
  const stores = React.useMemo(() => {
    const uniqueStores = Array.from(new Set(files.map(f => f.store)));
    return uniqueStores.sort();
  }, [files]);

  const stats = React.useMemo(() => {
    return {
      total: files.length,
      local: files.filter(f => f.status.hasLocal && !f.status.hasCloud).length,
      cloud: files.filter(f => f.status.hasCloud && !f.status.hasLocal).length,
      synced: files.filter(f => f.status.hasLocal && f.status.hasCloud).length,
      uploading: files.filter(f => f.status.isUploading).length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0)
    };
  }, [files]);

  return (
    <div className='space-y-6'>
      {/* Header with Stats */}
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='text-lg font-semibold text-gray-800'> Intelligent File Manager</h3>
          <p className='text-sm text-gray-600'>
            {stats.total} files • {formatFileSize(stats.totalSize)}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className='inline-flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors'
        >
          <Refresh2 size={16} className={refreshing ? 'animate-spin' : ''} />
          <span className='hidden md:inline'>Refresh</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className='grid grid-cols-2 md:grid-cols-5 gap-4'>
        <div className='bg-white rounded-lg border p-3'>
          <div className='flex items-center gap-2'>
            <div className='w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center'>
              <DocumentText1 size={16} className='text-blue-600' />
            </div>
            <div>
              <p className='text-sm text-gray-600'>Total</p>
              <p className='text-lg font-bold text-gray-900'>{stats.total}</p>
            </div>
          </div>
        </div>

        <div className='bg-white rounded-lg border p-3'>
          <div className='flex items-center gap-2'>
            <div className='w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center'>
              <DocumentText1 size={16} className='text-yellow-600' />
            </div>
            <div>
              <p className='text-sm text-gray-600'>Local</p>
              <p className='text-lg font-bold text-yellow-600'>{stats.local}</p>
            </div>
          </div>
        </div>

        <div className='bg-white rounded-lg border p-3'>
          <div className='flex items-center gap-2'>
            <div className='w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center'>
              <CloudAdd size={16} className='text-purple-600' />
            </div>
            <div>
              <p className='text-sm text-gray-600'>Cloud</p>
              <p className='text-lg font-bold text-purple-600'>{stats.cloud}</p>
            </div>
          </div>
        </div>

        <div className='bg-white rounded-lg border p-3'>
          <div className='flex items-center gap-2'>
            <div className='w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center'>
              <Cloud size={16} className='text-green-600' />
            </div>
            <div>
              <p className='text-sm text-gray-600'>Synced</p>
              <p className='text-lg font-bold text-green-600'>{stats.synced}</p>
            </div>
          </div>
        </div>

        <div className='bg-white rounded-lg border p-3'>
          <div className='flex items-center gap-2'>
            <div className='w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center'>
              <ArrowUp size={16} className='text-blue-600' />
            </div>
            <div>
              <p className='text-sm text-gray-600'>Uploading</p>
              <p className='text-lg font-bold text-blue-600'>{stats.uploading}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className='bg-white rounded-lg border p-4'>
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className='w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary'
            >
              <option value="date">Date Modified</option>
              <option value="name">File Name</option>
              <option value="size">File Size</option>
              <option value="status">Status</option>
            </select>
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className='w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary'
            >
              <option value="all">All Files</option>
              <option value="local">Local Only</option>
              <option value="cloud">Cloud Only</option>
              <option value="both">Synced Files</option>
              <option value="uploading">Uploading</option>
            </select>
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>Filter by Store</label>
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className='w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary'
            >
              <option value="all">All Stores</option>
              {stores.map(store => (
                <option key={store} value={store}>{store}</option>
              ))}
            </select>
          </div>

          <div className='flex items-end'>
            <div className='text-sm text-gray-600'>
              Showing {processedFiles.length} of {files.length} files
            </div>
          </div>
        </div>
      </div>

      {/* Files Table */}
      <div className='bg-white rounded-lg border overflow-hidden'>
        {processedFiles.length === 0 ? (
          <div className='p-8 text-center'>
            <DocumentText1 size={48} className='mx-auto text-gray-400 mb-4' />
            <h3 className='text-lg font-medium text-gray-900 mb-2'>No files found</h3>
            <p className='text-gray-600'>
              {filterStatus !== 'all' || selectedStore !== 'all' 
                ? 'Try adjusting your filters or refresh the list.'
                : 'Files will appear here after crawlers generate results.'}
            </p>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-gray-200'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    File Name
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    Status
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    Size
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    Store/Category
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    Updated
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className='bg-white divide-y divide-gray-200'>
                {processedFiles.map((file) => {
                  const statusDisplay = getStatusDisplay(file.status);
                  
                  return (
                    <tr key={file.id} className='hover:bg-gray-50 transition-colors'>
                      <td className='px-6 py-4 whitespace-nowrap'>
                        <div className='flex items-center gap-3'>
                          <div className='w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center'>
                            <DocumentText1 size={16} className='text-gray-600' />
                          </div>
                          <div>
                            <div className='text-sm font-medium text-gray-900 max-w-xs truncate'>
                              {file.name}
                            </div>
                            <div className='text-xs text-gray-500'>
                              {file.metadata?.itemCount ? `${file.metadata.itemCount} items` : 'JSON file'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap'>
                        <div className='space-y-2'>
                          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${statusDisplay.className}`}>
                            {statusDisplay.icon}
                            {statusDisplay.text}
                          </span>
                          {statusDisplay.showProgress && (
                            <div className='w-full bg-gray-200 rounded-full h-1'>
                              <div 
                                className='bg-primary h-1 rounded-full transition-all duration-300'
                                style={{ width: `${statusDisplay.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900'>
                        {formatFileSize(file.size)}
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap'>
                        <div className='text-sm font-medium text-gray-900'>{file.store}</div>
                        <div className='text-xs text-gray-500'>{file.category}</div>
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
                        {formatDate(file.updated || file.created)}
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap'>
                        <div className='flex items-center gap-1 flex-wrap'>
                          {/* View File */}
                          <button
                            onClick={() => handleViewFile(file)}
                            className='inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-colors'
                            title='View file contents'
                          >
                            <Eye size={12} />
                            <span className='hidden sm:inline'>View</span>
                          </button>

                          {/* Load to Classifier (only for local files) */}
                          {file.status.hasLocal && (
                            <button
                              onClick={() => handleLoadToClassifier(file)}
                              className='inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 transition-colors'
                              title='Load to classifier'
                            >
                              <Activity size={12} />
                              <span className='hidden sm:inline'>Classify</span>
                            </button>
                          )}

                          {/* Download */}
                          {file.status.hasCloud && (
                            <button
                              onClick={() => onDownloadFile(file)}
                              className='inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200 transition-colors'
                              title='Download to device'
                            >
                              <ArrowDown size={12} />
                              <span className='hidden sm:inline'>Download</span>
                            </button>
                          )}

                          {/* Storage Actions */}
                          {file.status.hasLocal && file.status.hasCloud && (
                            <button
                              onClick={() => onMakeCloudOnly(file)}
                              className='inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs hover:bg-orange-200 transition-colors'
                              title='Keep in cloud only'
                            >
                              <CloudAdd size={12} />
                              <span className='hidden sm:inline'>Cloud Only</span>
                            </button>
                          )}

                          {file.status.hasCloud && !file.status.hasLocal && (
                            <button
                              onClick={() => onMakeLocal(file)}
                              className='inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 transition-colors'
                              title='Download to local storage'
                            >
                              <DocumentDownload size={12} />
                              <span className='hidden sm:inline'>Make Local</span>
                            </button>
                          )}

                          {/* Delete */}
                          <button
                            onClick={() => onDeleteFile(file)}
                            className='inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 transition-colors'
                            title='Delete file'
                          >
                            <Trash size={12} />
                            <span className='hidden sm:inline'>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default IntelligentFileManager;
