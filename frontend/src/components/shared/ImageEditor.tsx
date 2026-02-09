'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '@/components/ui/Button';
import { API_BASE_URL } from '@/lib/api';

interface ImageEditorProps {
  imageUrl: string;
  onSave: (editedImageUrl: string, blob: Blob) => void;
  onCancel: () => void;
}

const ImageEditor: React.FC<ImageEditorProps> = ({ imageUrl, onSave, onCancel }) => {
  // Use proxy URL to avoid CORS issues with Firebase Storage
  const [proxiedImageUrl, setProxiedImageUrl] = useState<string>('');
  
  useEffect(() => {
    if (!imageUrl) {
      setProxiedImageUrl('');
      return;
    }

    // Allow data URLs to pass through untouched
    if (imageUrl.startsWith('data:')) {
      setProxiedImageUrl(imageUrl);
      return;
    }

    try {
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const resolvedUrl = new URL(imageUrl, currentOrigin || undefined);
      const isSameOrigin = currentOrigin && resolvedUrl.origin === currentOrigin;

      if (isSameOrigin || resolvedUrl.protocol === 'blob:') {
        setProxiedImageUrl(resolvedUrl.href);
      } else {
        const proxyUrl = `${API_BASE_URL}/api/products/proxy-image?url=${encodeURIComponent(resolvedUrl.href)}`;
        console.log('🔧 [ImageEditor] Using proxy URL for cross-origin image:', proxyUrl);
        setProxiedImageUrl(proxyUrl);
      }
    } catch (error) {
      console.warn('⚠️ [ImageEditor] Failed to resolve image URL, using original.', error);
      setProxiedImageUrl(imageUrl);
    }
  }, [imageUrl]);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTab, setActiveTab] = useState<'filters' | 'crop'>('filters');
  const [isSaving, setIsSaving] = useState(false);
  
  // Filter states
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [blur, setBlur] = useState(0);
  const [grayscale, setGrayscale] = useState(0);
  const [sepia, setSepia] = useState(0);
  const [hueRotate, setHueRotate] = useState(0);
  
  // Crop states
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();

  const getFilterString = () => {
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px) grayscale(${grayscale}%) sepia(${sepia}%) hue-rotate(${hueRotate}deg)`;
  };

  const resetFilters = () => {
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setBlur(0);
    setGrayscale(0);
    setSepia(0);
    setHueRotate(0);
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    // Start with a small crop in the center
    const crop = centerCrop(
      makeAspectCrop(
        {
          unit: '%',
          width: 90,
        },
        1,
        width,
        height
      ),
      width,
      height
    );
    setCrop(crop);
  }, []);

  const getCroppedImage = useCallback(async (): Promise<Blob | null> => {
    const image = imgRef.current;
    const canvas = canvasRef.current;
    
    if (!image || !canvas) return null;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    let cropX = 0;
    let cropY = 0;
    let cropWidth = image.naturalWidth;
    let cropHeight = image.naturalHeight;

    if (completedCrop && activeTab === 'crop') {
      cropX = completedCrop.x * scaleX;
      cropY = completedCrop.y * scaleY;
      cropWidth = completedCrop.width * scaleX;
      cropHeight = completedCrop.height * scaleY;
    }

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    // Apply filters
    ctx.filter = getFilterString();
    
    ctx.drawImage(
      image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  }, [completedCrop, activeTab, brightness, contrast, saturation, blur, grayscale, sepia, hueRotate]);

  const handleSave = async () => {
    console.log('🎨 [ImageEditor] Starting save process');
    setIsSaving(true);
    try {
      console.log('🎨 [ImageEditor] Getting cropped image...');
      const blob = await getCroppedImage();
      
      if (!blob) {
        console.error('❌ [ImageEditor] Failed to generate blob from canvas');
        throw new Error('Failed to generate image blob');
      }
      
      console.log('🎨 [ImageEditor] Blob created:', {
        size: blob.size,
        type: blob.type
      });
      
      const url = URL.createObjectURL(blob);
      console.log('🎨 [ImageEditor] Local URL created:', url);
      
      console.log('🎨 [ImageEditor] Calling onSave callback...');
      // Call onSave and wait for it if it's async
      await Promise.resolve(onSave(url, blob));
      
      console.log('✅ [ImageEditor] Save completed successfully');
    } catch (error) {
      console.error('❌ [ImageEditor] Error during save:', error);
      console.error('❌ [ImageEditor] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      alert('Failed to save image. Please try again.');
    } finally {
      setIsSaving(false);
      console.log('🎨 [ImageEditor] Save process ended');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col relative">
        {/* Loading Overlay */}
        {isSaving && (
          <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-10">
            <div className="text-center">
              <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent mb-4"></div>
              <p className="text-lg font-semibold text-gray-800">Processing Image...</p>
              <p className="text-sm text-gray-600 mt-2">Uploading to Firebase Storage</p>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Edit Image</h2>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('filters')}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === 'filters'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Filters & Adjustments
          </button>
          <button
            onClick={() => setActiveTab('crop')}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === 'crop'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Crop
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Controls Panel */}
          <div className="w-80 border-r border-gray-200 p-6 overflow-y-auto bg-gray-50">
            {activeTab === 'filters' ? (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Brightness: {brightness}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contrast: {contrast}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Saturation: {saturation}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={saturation}
                    onChange={(e) => setSaturation(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Blur: {blur}px
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={blur}
                    onChange={(e) => setBlur(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Grayscale: {grayscale}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={grayscale}
                    onChange={(e) => setGrayscale(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sepia: {sepia}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sepia}
                    onChange={(e) => setSepia(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hue Rotate: {hueRotate}°
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={hueRotate}
                    onChange={(e) => setHueRotate(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <Button
                  onClick={resetFilters}
                  variant="outline"
                  className="w-full"
                >
                  Reset Filters
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Drag on the image to select the area you want to keep.
                  Use the handles to adjust the crop area.
                </p>
                <Button
                  onClick={() => setCrop(undefined)}
                  variant="outline"
                  className="w-full"
                >
                  Clear Crop
                </Button>
              </div>
            )}
          </div>

          {/* Image Preview */}
          <div className="flex-1 flex items-center justify-center p-6 bg-gray-100 overflow-auto">
            <div className="max-w-full max-h-full">
              {!proxiedImageUrl ? (
                <div className="text-gray-500">Loading image...</div>
              ) : activeTab === 'crop' ? (
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={undefined}
                >
                  <img
                    ref={imgRef}
                    src={proxiedImageUrl}
                    alt="Edit"
                    crossOrigin="anonymous"
                    onLoad={onImageLoad}
                    style={{
                      filter: getFilterString(),
                      maxWidth: '100%',
                      maxHeight: '70vh',
                    }}
                  />
                </ReactCrop>
              ) : (
                <img
                  ref={imgRef}
                  src={proxiedImageUrl}
                  alt="Edit"
                  crossOrigin="anonymous"
                  onLoad={onImageLoad}
                  style={{
                    filter: getFilterString(),
                    maxWidth: '100%',
                    maxHeight: '70vh',
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Hidden canvas for rendering */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <Button onClick={onCancel} variant="outline" disabled={isSaving}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white min-w-[140px]"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImageEditor;
