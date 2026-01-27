import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TickCircle, CloseCircle, InfoCircle, Warning2, CloseSquare } from 'iconsax-react'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message: string
  duration?: number
  isConfirm?: boolean
  onConfirm?: () => void
  onCancel?: () => void
}

interface ToastNotificationProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

const getToastIcon = (type: Toast['type']) => {
  switch (type) {
    case 'success':
      return <TickCircle size={20} className="text-green-600" />
    case 'error':
      return <CloseCircle size={20} className="text-red-600" />
    case 'warning':
      return <Warning2 size={20} className="text-yellow-600" />
    case 'info':
    default:
      return <InfoCircle size={20} className="text-blue-600" />
  }
}

const getToastStyles = (type: Toast['type']) => {
  switch (type) {
    case 'success':
      return 'border-green-200 bg-green-50'
    case 'error':
      return 'border-red-200 bg-red-50'
    case 'warning':
      return 'border-yellow-200 bg-yellow-50'
    case 'info':
    default:
      return 'border-blue-200 bg-blue-50'
  }
}

const urlPattern = /(https?:\/\/[^\s)]+[^\s.,!?)]?)/g

const renderToastMessage = (message: string) => {
  const content: Array<{ type: 'text'; value: string } | { type: 'link'; value: string }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = urlPattern.exec(message)) !== null) {
    if (match.index > lastIndex) {
      content.push({ type: 'text', value: message.slice(lastIndex, match.index) })
    }
    content.push({ type: 'link', value: match[0] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < message.length) {
    content.push({ type: 'text', value: message.slice(lastIndex) })
  }

  if (content.length === 0) {
    return message
  }

  return content.map((item, index) =>
    item.type === 'link' ? (
      <a
        key={`toast-link-${index}`}
        href={item.value}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline break-all"
      >
        {item.value}
      </a>
    ) : (
      <span key={`toast-text-${index}`}>{item.value}</span>
    )
  )
}

const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  useEffect(() => {
    // Don't auto-remove confirmation toasts
    if (toast.isConfirm) return
    
    const duration = toast.duration || 5000
    const timer = setTimeout(() => {
      onRemove(toast.id)
    }, duration)

    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, toast.isConfirm, onRemove])

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -50, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className={`rounded-lg border p-4 shadow-lg backdrop-blur-sm ${getToastStyles(toast.type)} ${
        toast.isConfirm ? 'border-l-4 border-l-orange-500' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {getToastIcon(toast.type)}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900">
            {toast.title}
          </h4>
          <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap break-words">
            {renderToastMessage(toast.message)}
          </div>
          {toast.isConfirm && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={toast.onConfirm}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={toast.onCancel}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        {!toast.isConfirm && (
          <button
            onClick={() => onRemove(toast.id)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <CloseSquare size={18} />
          </button>
        )}
      </div>
    </motion.div>
  )
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
        ))}
      </AnimatePresence>
    </div>
  )
}

export default ToastNotification
