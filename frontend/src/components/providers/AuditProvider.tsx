'use client';

import { useEffect, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuditLogger } from '@/lib/audit-logger';

export function AuditProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  // 1. Track Page Views
  useEffect(() => {
    if (!user) return;

    const fullPath = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    
    AuditLogger.getInstance().log(
      user.uid,
      user.email || 'unknown',
      'PAGE_VIEW',
      pathname || 'unknown',
      { path: fullPath, title: document.title }
    );
  }, [pathname, searchParams, user]);

  // 2. Track UI Interactions (Clicks)
  const handleGlobalClick = useCallback((e: MouseEvent) => {
    if (!user) return;

    const target = e.target as HTMLElement;
    
    // Find closest interactive element
    const interactive = target.closest('button, a, input, select, [role="button"], [data-audit-action]');
    
    if (interactive) {
      const element = interactive as HTMLElement;
      
      // Get identifying info
      const action = element.getAttribute('data-audit-action');
      const label = element.getAttribute('aria-label') || element.innerText || element.id || element.getAttribute('name');
      const href = element.getAttribute('href');
      
      // Don't log clicks on generic containers with no info
      if (!action && !label && !href) return;

      AuditLogger.getInstance().log(
        user.uid,
        user.email || 'unknown',
        'UI_INTERACTION',
        element.tagName.toLowerCase(),
        {
          label: label?.substring(0, 50), // Truncate to save space
          action,
          href,
          x: e.clientX,
          y: e.clientY,
          path: pathname
        }
      );
    }
  }, [user, pathname]);

  useEffect(() => {
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [handleGlobalClick]);

  return <>{children}</>;
}
