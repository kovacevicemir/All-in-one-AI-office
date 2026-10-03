import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { RuntimeClient, type RuntimeClientOptions } from './client.js';
import { createOfficeStore, type OfficeStore, type OfficeStoreState } from './store.js';

const StoreContext = createContext<OfficeStore | null>(null);

export interface RuntimeProviderProps {
  children: ReactNode;
  /** Inject a prepared client (tests). Otherwise one is created. */
  client?: RuntimeClient;
  clientOptions?: RuntimeClientOptions;
  /** Set false in tests to avoid opening a socket. */
  autoConnect?: boolean;
  store?: OfficeStore;
}

export function RuntimeProvider({
  children,
  client,
  clientOptions,
  autoConnect = true,
  store: providedStore,
}: RuntimeProviderProps) {
  const [runtime] = useState(() => {
    const activeClient = client ?? new RuntimeClient(clientOptions);
    return {
      client: activeClient,
      store: providedStore ?? createOfficeStore(activeClient),
    };
  });

  useEffect(() => {
    if (!autoConnect) return;
    runtime.client.connect();
    return () => runtime.client.close();
  }, [autoConnect, runtime]);

  return <StoreContext.Provider value={runtime.store}>{children}</StoreContext.Provider>;
}

export function useOfficeStore<T>(selector: (state: OfficeStoreState) => T): T {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('useOfficeStore must be used inside <RuntimeProvider>');
  return useStore(store, selector);
}

export function useOfficeStoreApi(): OfficeStore {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('useOfficeStoreApi must be used inside <RuntimeProvider>');
  return store;
}
