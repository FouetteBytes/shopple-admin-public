import React, { useState, useCallback, useEffect } from 'react';

interface FileUploadStatus {
  status: 'local' | 'uploading' | 'both' | 'cloud_only' | 'failed' | 'missing';
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
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Use file data directly instead of making separate API calls
  const getDisplayStatus = () => {
    // Use the location and status_class from the file data
    const location = file.location || 'Unknown';
    const statusClass = file.status_class || 'unknown';
    
    if (location === 'Uploading...' || statusClass === 'uploading') {
      return { text: 'Uploading...', class: 'uploading', showSpinner: true };
    } else if (location === 'Cloud + Local' || statusClass === 'both') {
      return { text: 'Cloud + Local', class: 'both', showSpinner: false };
    } else if (location === 'Local' || statusClass === 'local') {
      return { text: 'Local', class: 'local', showSpinner: false };
    } else if (location === 'Cloud Only' || statusClass === 'cloud_only') {
      return { text: 'Cloud Only', class: 'cloud_only', showSpinner: false };
    } else if (statusClass === 'failed') {
      return { text: 'Upload Failed', class: 'failed', showSpinner: false };
    }
    
    return { text: location, class: statusClass, showSpinner: false };
  };

  // Get upload status from file data
  const getUploadStatus = () => {
    const hasLocal = file.has_local || file.location?.includes('Local') || false;
    const hasCloud = file.has_cloud || file.location?.includes('Cloud') || false;
    const status = file.status_class || 'unknown';
    
    return {
      status,
      has_local: hasLocal,
      has_cloud: hasCloud,
      upload_status: status
    };
  };

  const uploadStatus = getUploadStatus();

  const handleDelete = () => {
    // OneDrive-like behavior: delete from both local and cloud
    onDelete(
      file.metadata.store,
      file.metadata.category,
      file.name,
      true,  // always delete local
      true   // always delete cloud
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
            {/* Download Button */}
            {uploadStatus?.has_cloud && onDownload && (
              <button
                onClick={() => onDownload(file)}
                className="text-blue-600 hover:text-blue-900 flex items-center"
                title="Download file"
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <tr>
          <td colSpan={6}>
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
              <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div className="mt-3 text-center">
                  <h3 className="text-lg font-medium text-gray-900">Delete File</h3>
                  <div className="mt-2 px-7 py-3">
                    <p className="text-sm text-gray-500">
                      Are you sure you want to delete &quot;{file.name}&quot;?
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      This will remove the file from both local storage and cloud storage.
                    </p>
                  </div>
                  <div className="items-center px-4 py-3 space-y-2">
                    <button
                      onClick={handleDelete}
                      className="w-full px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md hover:bg-red-700"
                    >
                      Delete File
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
