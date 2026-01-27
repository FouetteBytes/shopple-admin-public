import React, { useState, useEffect } from 'react';
import { Upload, DollarSign, Store, AlertCircle, CheckCircle, Loader } from 'lucide-react';

interface SupermarketOption {
  id: string;
  name: string;
  description?: string;
}

interface PriceUploadProps {
  onUploadComplete?: (result: any) => void;
}

const PriceUpload: React.FC<PriceUploadProps> = ({ onUploadComplete }) => {
  const [selectedSupermarket, setSelectedSupermarket] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState<string>('');
  
  const supermarkets: SupermarketOption[] = [
    { id: 'cargills', name: 'Cargills Food City', description: 'Largest supermarket chain in Sri Lanka' },
    { id: 'keells', name: 'Keells Super', description: 'Premium supermarket chain' },
    { id: 'arpico', name: 'Arpico Supercenter', description: 'Department store and supermarket' },
    { id: 'laughs', name: 'Laughs Supermarket', description: 'Popular neighborhood supermarket' },
    { id: 'spar', name: 'SPAR Supermarket', description: 'International supermarket brand' }
  ];

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === 'application/json') {
        setSelectedFile(file);
        setError('');
      } else {
        setError('Please select a valid JSON file');
        setSelectedFile(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedSupermarket || !selectedFile) {
      setError('Please select both a supermarket and a JSON file');
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadResult(null);

    try {
      // Read file content
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(selectedFile);
      });

      // Parse JSON
      let priceData;
      try {
        priceData = JSON.parse(fileContent);
      } catch (parseError) {
        throw new Error('Invalid JSON format');
      }

      // Upload to backend
      const response = await fetch('/api/prices/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supermarket_id: selectedSupermarket,
          price_data: priceData
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      setUploadResult(result);
      
      if (onUploadComplete) {
        onUploadComplete(result);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setSelectedSupermarket('');
    setSelectedFile(null);
    setUploadResult(null);
    setError('');
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <DollarSign className="h-6 w-6 text-green-600" />
        <h2 className="text-2xl font-bold text-gray-900">Upload Price Data</h2>
      </div>

      {!uploadResult ? (
        <div className="space-y-6">
          {/* Supermarket Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Supermarket
            </label>
            <select
              value={selectedSupermarket}
              onChange={(e) => setSelectedSupermarket(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">Choose a supermarket...</option>
              {supermarkets.map((supermarket) => (
                <option key={supermarket.id} value={supermarket.id}>
                  {supermarket.name}
                </option>
              ))}
            </select>
            {selectedSupermarket && (
              <p className="mt-1 text-sm text-gray-500">
                {supermarkets.find(s => s.id === selectedSupermarket)?.description}
              </p>
            )}
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload JSON File
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-green-400 transition-colors">
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <input
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <span className="text-sm text-gray-600">
                  Click to upload or drag and drop
                </span>
                <p className="text-xs text-gray-500 mt-1">JSON files only</p>
              </label>
            </div>
            {selectedFile && (
              <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={!selectedSupermarket || !selectedFile || isUploading}
            className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isUploading ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                Upload Price Data
              </>
            )}
          </button>
        </div>
      ) : (
        /* Upload Result */
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-6 w-6" />
            <h3 className="text-lg font-semibold">Upload Successful!</h3>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">Processed:</span>
                <span className="ml-2 text-green-600">{uploadResult.processed_count} items</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Errors:</span>
                <span className="ml-2 text-red-600">{uploadResult.error_count} items</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Supermarket:</span>
                <span className="ml-2 capitalize">{uploadResult.supermarket_id}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Upload Time:</span>
                <span className="ml-2">{new Date(uploadResult.upload_timestamp).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {uploadResult.errors && uploadResult.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-medium text-red-800 mb-2">Errors encountered:</h4>
              <ul className="text-sm text-red-700 space-y-1">
                {uploadResult.errors.slice(0, 5).map((error: string, index: number) => (
                  <li key={index}>• {error}</li>
                ))}
                {uploadResult.errors.length > 5 && (
                  <li className="text-red-600">... and {uploadResult.errors.length - 5} more errors</li>
                )}
              </ul>
            </div>
          )}

          <button
            onClick={resetForm}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
          >
            Upload More Data
          </button>
        </div>
      )}
    </div>
  );
};

export default PriceUpload;
