"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import ToastNotification, { type Toast } from '@/components/shared/ToastNotification'

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => string
  removeToast: (id: string) => void
  success: (title: string, message: string, duration?: number) => string
  error: (title: string, message: string, duration?: number) => string
  warning: (title: string, message: string, duration?: number) => string
  info: (title: string, message: string, duration?: number) => string
  confirm: (title: string, message: string) => Promise<boolean>
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

interface ToastProviderProps {
  children: ReactNode
}

interface ConfirmToast extends Toast {
  isConfirm: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<(Toast | ConfirmToast)[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
    const newToast: Toast = { ...toast, id }
    
    setToasts(prev => [...prev, newToast])
    
    return id
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const success = useCallback((title: string, message: string, duration?: number) => {
    return addToast({ type: 'success', title, message, duration })
  }, [addToast])

  const error = useCallback((title: string, message: string, duration?: number) => {
    console.error(`[Toast error] ${title}:`, message)
    return addToast({ type: 'error', title, message, duration })
  }, [addToast])

  const warning = useCallback((title: string, message: string, duration?: number) => {
    return addToast({ type: 'warning', title, message, duration })
  }, [addToast])

  const info = useCallback((title: string, message: string, duration?: number) => {
    return addToast({ type: 'info', title, message, duration })
  }, [addToast])

  const confirm = useCallback((title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
      
      const confirmToast: ConfirmToast = {
        id,
        type: 'warning',
        title,
        message,
        isConfirm: true,
        onConfirm: () => {
          removeToast(id)
          resolve(true)
        },
        onCancel: () => {
          removeToast(id)
          resolve(false)
        }
      }
      
      setToasts(prev => [...prev, confirmToast])
    })
  }, [removeToast])

  const contextValue: ToastContextType = {
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
    confirm
  }

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastNotification 
        toasts={toasts} 
        onRemove={removeToast}
      />
    </ToastContext.Provider>
  )
}

export const useGlobalToast = (): ToastContextType => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useGlobalToast must be used within a ToastProvider')
  }
  return context
}
