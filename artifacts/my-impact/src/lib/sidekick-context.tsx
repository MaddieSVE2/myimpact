import { createContext, useContext, useState, ReactNode } from "react";

interface SidekickCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const SidekickContext = createContext<SidekickCtx>({ open: false, setOpen: () => {} });

export function SidekickProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SidekickContext.Provider value={{ open, setOpen }}>
      {children}
    </SidekickContext.Provider>
  );
}

export function useSidekick() {
  return useContext(SidekickContext);
}
