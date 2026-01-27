'use client';

import { useState } from 'react';
import { CloseCircle, DocumentText, TickCircle } from 'iconsax-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGlobalToast } from '@/contexts/ToastContext';

type RejectionModalProps = {
  productName: string;
  requestType: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

const QUICK_REJECTION_REASONS = [
  {
    id: 'already-exists',
    title: 'Product Already Exists',
    description: 'This product is already in our database',
    template: 'Thank you for your submission. However, this product already exists in our database. You can find it by searching for "{productName}".'
  },
  {
    id: 'insufficient-info',
    title: 'Insufficient Information',
    description: 'Not enough details provided',
    template: 'We need more information to process this request. Please provide additional details such as brand name, size, and a clear product image.'
  },
  {
    id: 'poor-image',
    title: 'Poor Image Quality',
    description: 'Image is unclear or missing',
    template: 'The product image provided is not clear enough or is missing. Please submit a new request with a high-quality photo showing the product clearly.'
  },
  {
    id: 'duplicate-request',
    title: 'Duplicate Request',
    description: 'Request already submitted',
    template: 'This product has already been requested by another user and is currently being processed.'
  },
  {
    id: 'out-of-scope',
    title: 'Out of Scope',
    description: 'Product not in our category',
    template: 'Unfortunately, this product falls outside our current product categories and cannot be added at this time.'
  },
  {
    id: 'incorrect-info',
    title: 'Incorrect Information',
    description: 'Details provided are inaccurate',
    template: 'The information provided appears to be incorrect or inconsistent. Please verify the product details and resubmit if necessary.'
  }
];

// Models will be fetched from backend allowed_models.json

export function RejectionModal({ productName, requestType, onConfirm, onCancel }: RejectionModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');
  const { error: showError } = useGlobalToast();

  const handleQuickSelect = (reasonId: string) => {
    setSelectedReason(reasonId);
    const reason = QUICK_REJECTION_REASONS.find(r => r.id === reasonId);
    if (reason) {
      setCustomReason(reason.template.replace('{productName}', productName));
    }
  };

  const handleConfirm = () => {
    const finalReason = customReason.trim();
    if (!finalReason) {
      showError('Reason required', 'Please provide a rejection reason');
      return;
    }
    onConfirm(finalReason);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={onCancel}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-rose-50 to-red-50 px-6 py-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Reject Request</h2>
              <p className="text-sm text-gray-600">Provide a clear reason for rejection</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onCancel}
              className="rounded-full p-2 text-gray-400 transition-colors hover:bg-white hover:text-gray-600"
            >
              <CloseCircle size={24} />
            </motion.button>
          </div>

          {/* Content */}
          <div className="max-h-[70vh] overflow-auto p-6">
            {/* Product Info */}
            <div className="mb-4 rounded-lg bg-blue-50 p-3">
              <p className="text-xs font-semibold uppercase text-blue-700">Rejecting Request</p>
              <p className="text-sm font-medium text-gray-900">{productName}</p>
              <p className="text-xs text-gray-600">Type: {requestType}</p>
            </div>

            {/* Quick Reason Cards */}
            <div className="mb-6">
              <label className="mb-3 block text-sm font-semibold text-gray-700">Quick Rejection Reasons</label>
              <div className="grid gap-3 md:grid-cols-2">
                {QUICK_REJECTION_REASONS.map((reason) => (
                  <motion.button
                    key={reason.id}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleQuickSelect(reason.id)}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      selectedReason === reason.id
                        ? 'border-primary bg-primary/5 shadow-md'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{reason.title}</p>
                        <p className="mt-1 text-xs text-gray-600">{reason.description}</p>
                      </div>
                      {selectedReason === reason.id && (
                        <TickCircle size={20} className="text-primary" variant="Bold" />
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Custom Reason Text Area with Inline AI */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Rejection Message
                <span className="ml-2 text-xs font-normal text-gray-500">(This will be sent to the user)</span>
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Enter a custom rejection reason or select a quick reason above..."
                rows={6}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
            <button
              onClick={onCancel}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!customReason.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-400"
            >
              <DocumentText size={16} />
              Confirm Rejection
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
