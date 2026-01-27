'use client';

import { SWRConfig } from 'swr';
import { ReactNode } from 'react';

export const SWRProvider = ({ children }: { children: ReactNode }) => {
  return (
    <SWRConfig 
      value={{
        revalidateOnFocus: false, // Prevent re-fetching when window gains focus
        revalidateOnReconnect: true,
        dedupingInterval: 5000, // Dedupe requests within 5 seconds
        shouldRetryOnError: false,
        fetcher: (resource, init) => fetch(resource, init).then(res => res.json())
      }}
    >
      {children}
    </SWRConfig>
  );
};
