'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useSocket } from '@/lib/socket';

function SocketProvider({ children }: { children: ReactNode }) {
  useSocket();
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5000, retry: 1 },
    },
  }));

  return (
    <QueryClientProvider client={qc}>
      <SocketProvider>
        {children}
      </SocketProvider>
    </QueryClientProvider>
  );
}
