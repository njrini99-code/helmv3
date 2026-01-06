'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface MobileNavContextType {
  isVisible: boolean;
  hide: () => void;
  show: () => void;
}

const MobileNavContext = createContext<MobileNavContextType | undefined>(undefined);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(true);

  return (
    <MobileNavContext.Provider
      value={{
        isVisible,
        hide: () => setIsVisible(false),
        show: () => setIsVisible(true),
      }}
    >
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  const context = useContext(MobileNavContext);
  if (context === undefined) {
    throw new Error('useMobileNav must be used within a MobileNavProvider');
  }
  return context;
}
