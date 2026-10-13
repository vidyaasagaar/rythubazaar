import type { FeeConfig } from '@rythubazaar/shared';
import type { Env } from './config/env';
import { MockPayoutProvider, type PayoutProvider } from './adapters/payouts';
import { LogNotifier, type Notifier } from './adapters/notifications';
import { DemoTelephony, type TelephonyProvider } from './adapters/telephony';
import { RulesInterpreter, type Interpreter } from './adapters/interpreter';

export interface AppDeps {
  env: Env;
  fees: FeeConfig;
  payouts: PayoutProvider;
  notifier: Notifier;
  telephony: TelephonyProvider;
  interpreter: Interpreter;
}

export function createDeps(env: Env): AppDeps {
  return {
    env,
    fees: {
      deliveryFeePaise: env.DELIVERY_FEE_PAISE,
      freeDeliveryThresholdPaise: env.FREE_DELIVERY_THRESHOLD_PAISE,
      serviceFeeBps: env.SERVICE_FEE_BPS,
      serviceFeeCapPaise: env.SERVICE_FEE_CAP_PAISE,
    },
    payouts: new MockPayoutProvider(),
    notifier: new LogNotifier(),
    telephony: new DemoTelephony(env.demoRoutes),
    interpreter: new RulesInterpreter(),
  };
}
