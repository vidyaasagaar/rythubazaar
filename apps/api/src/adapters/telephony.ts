import type { Env, IvrRoute } from '../config/env';

/**
 * Telephony provider interface. The demo provider only routes internal dial codes to the
 * in-app IVR; it never places or receives a telephone-network call. A real provider needs a
 * verified number, credentials, and webhook handling for inbound call events.
 */
export interface TelephonyProvider {
  readonly mode: 'DEMO';
  readonly placesRealCalls: false;
  resolveRoute(dialedCode: string): IvrRoute | null;
  listDemoCodes(): string[];
}

export class DemoTelephony implements TelephonyProvider {
  readonly mode = 'DEMO' as const;
  readonly placesRealCalls = false as const;
  constructor(private readonly routes: Env['demoRoutes']) {}

  resolveRoute(dialedCode: string): IvrRoute | null {
    return this.routes[dialedCode] ?? null;
  }

  listDemoCodes(): string[] {
    return Object.keys(this.routes);
  }
}
