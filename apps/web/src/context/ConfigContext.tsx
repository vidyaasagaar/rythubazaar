import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { FeeConfig } from '@rythubazaar/shared';
import { api } from '../lib/api';

export interface PublicConfig {
  demoDialCodes: string[];
  telephonyMode: 'DEMO';
  placesRealCalls: boolean;
  interpreter: string;
  paymentMode: string;
  payoutProvider: { name: string; simulated: boolean };
  notifications: string;
  audioRecording: 'DISABLED';
  fees: FeeConfig;
  farmerCommissionBps: number;
  returnWindowHours: number;
}

const ConfigContext = createContext<{ config: PublicConfig | null; error: boolean }>({
  config: null,
  error: false,
});

/** Runtime config from the API — the demo dial code is never hard-coded in the web app. */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api
      .get<PublicConfig>('/api/config')
      .then(setConfig)
      .catch(() => setError(true));
  }, []);
  return <ConfigContext.Provider value={{ config, error }}>{children}</ConfigContext.Provider>;
}

export const useConfig = () => useContext(ConfigContext);
