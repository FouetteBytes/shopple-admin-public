import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { SWRProvider } from '@/components/providers/SWRProvider'
import { AuditProvider } from '@/components/providers/AuditProvider'
import SimpleSessionGuard from '@/components/auth/SimpleSessionGuard'
import AuthInterceptor from '@/components/auth/AuthInterceptor'

export const metadata: Metadata = {
  title: 'Shopple Admin',
  description: 'Shopple Admin console for product intelligence, cache control, and operations.',
  keywords: 'shopple, admin dashboard, product classifier, operations',
  icons: {
    icon: '/shopple-admin-icon.png',
    shortcut: '/shopple-admin-icon.png',
    apple: '/shopple-admin-icon.png',
  },
}

import { Suspense } from 'react'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="cache-control" content="no-cache, no-store, must-revalidate" />
        <meta name="pragma" content="no-cache" />
        <meta name="expires" content="0" />
        {/* Runtime Environment Configuration */}
        <script src="/env-config.js" />
        {/* Runtime-loaded Inter font from Google Fonts (no build-time fetch) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/shopple-admin-icon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/shopple-admin-icon.png" />
      </head>
      <body className="font-sans">
        <AuthInterceptor />
        <AuthProvider>
          <SWRProvider>
            <ToastProvider>
              <Suspense fallback={null}>
                <AuditProvider>
                  <SimpleSessionGuard>
                    {children}
                  </SimpleSessionGuard>
                </AuditProvider>
              </Suspense>
            </ToastProvider>
          </SWRProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
