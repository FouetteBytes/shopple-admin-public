import React, { useState, useCallback, useEffect } from 'react';

interface FileUploadStatus {
  status: 'uploading' | 'cloud_only' | 'failed' | 'missing';
  has_local: boolean;
  has_cloud: boolean;
  upload_status: string;
  local_path?: string;
}

interface SmartFileRowProps {
  file: any;
  onStatusChange: () => void;
  onDelete: (store: string, category: string, filename: string, deleteLocal: boolean, deleteCloud: boolean) => void;
  onDownload?: (file: any) => void;
}

export const SmartFileRow: React.FC<SmartFileRowProps> = ({ 
  file, 
  onStatusChange, 
  onDelete, 
  onDownload 
}) => {
  const [uploadStatus, setUploadStatus] = useState<FileUploadStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  const checkUploadStatus = useCallback(async () => {
    if (!file.metadata?.store || !file.metadata?.category || !file.name) {
      return;
    }

    try {
      const response = await fetch('/api/crawler/storage/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload_status',
          store: file.metadata.store,
          category: file.metadata.category,
          filename: file.name
        })
      });

      if (response.ok) {
        const status = await response.json();
        setUploadStatus(status);
        
        // If uploading, continue polling
        if (status.status === 'uploading') {
          if (!pollInterval) {
            const interval = setInterval(checkUploadStatus, 2000);
            setPollInterval(interval);
          }
        } else {
          // Stop polling if not uploading
          if (pollInterval) {
            clearInterval(pollInterval);
            setPollInterval(null);
          }
        }
      }
    } catch (error) {
      console.error('Failed to check upload status:', error);
    }
  }, [file, pollInterval]);

  useEffect(() => {
    checkUploadStatus();
    
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [checkUploadStatus, pollInterval]);

  // Determine display status - Cloud-only storage
  const getDisplayStatus = () => {
    if (uploadStatus) {
      switch (uploadStatus.status) {
        case 'uploading':
          return { text: 'Uploading...', class: 'uploading', showSpinner: true };
        case 'cloud_only':
          return { text: 'Cloud Storage', class: 'cloud_only', showSpinner: false };
        case 'failed':
          return { text: 'Upload Failed', class: 'failed', showSpinner: false };
        default:
          return { text: 'Cloud Storage', class: 'cloud_only', showSpinner: false };
      }
    }
    
    // Fallback - All files are in cloud storage
    return { text: 'Cloud Storage', class: 'cloud_only', showSpinner: false };
  };

  // Cloud-only storage - no need for storage mode switching functions

  const handleDelete = (deleteLocal: boolean, deleteCloud: boolean) => {
    onDelete(
      file.metadata.store,
      file.metadata.category,
      file.name,
      deleteLocal,
      deleteCloud
    );
    setShowDeleteConfirm(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Invalid Date';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Invalid Date';
    }
  };

  const status = getDisplayStatus();

  return (
    <>
      <tr className="border-b border-gray-200 hover:bg-gray-50">
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex flex-col">
            <div className="text-sm font-medium text-gray-900 break-all">
              {file.name}
            </div>
            <div className="text-sm text-gray-500">
              {file.metadata?.store}/{file.metadata?.category}
            </div>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center">
            {status.showSpinner && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            )}
            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
              status.class === 'uploading' ? 'bg-yellow-100 text-yellow-800' :
              status.class === 'both' ? 'bg-green-100 text-green-800' :
              status.class === 'local' ? 'bg-blue-100 text-blue-800' :
              status.class === 'cloud_only' ? 'bg-purple-100 text-purple-800' :
              status.class === 'failed' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {status.text}
            </span>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {formatFileSize(file.size)}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {file.metadata?.store || 'Unknown'}/{file.metadata?.category || 'Unknown'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {formatDate(file.created)}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
          <div className="flex space-x-2">
            {/* Download Button - All files in cloud */}
            {uploadStatus?.has_cloud && onDownload && (
              <button
                onClick={() => onDownload(file)}
                className="text-blue-600 hover:text-blue-900 flex items-center"
                title="Download file from cloud"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
            )}

            {/* Delete Button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-red-600 hover:text-red-900"
              title="Delete file"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </td>
      </tr>

      {/* Delete Confirmation Modal - Cloud-only */}
      {showDeleteConfirm && (
        <tr>
          <td colSpan={6}>
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
              <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div className="mt-3 text-center">
                  <h3 className="text-lg font-medium text-gray-900">Delete File from Cloud</h3>
                  <div className="mt-2 px-7 py-3">
                    <p className="text-sm text-gray-500">
                      Are you sure you want to delete &quot;{file.name}&quot; from cloud storage?
                    </p>
                    <p className="text-xs text-red-500 mt-2">
                      This action cannot be undone.
                    </p>
                  </div>
                  <div className="items-center px-4 py-3 space-y-2">
                    <button
                      onClick={() => handleDelete(false, true)}
                      className="w-full px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md hover:bg-red-700"
                    >
                      Delete from Cloud Storage
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="w-full px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};
