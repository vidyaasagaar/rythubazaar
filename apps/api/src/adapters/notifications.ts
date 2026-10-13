import { logger } from '../lib/logger';

export interface Notifier {
  readonly mode: 'MOCK_LOG_ONLY';
  notify(input: { userId: string; template: string; data: Record<string, string | number> }): Promise<void>;
}

/** Records the intent to notify. No SMS/email is sent until a real provider is configured. */
export class LogNotifier implements Notifier {
  readonly mode = 'MOCK_LOG_ONLY' as const;
  async notify(input: { userId: string; template: string; data: Record<string, string | number> }) {
    logger.debug(
      { notification: { template: input.template, userId: input.userId } },
      'Notification (mock, not sent)',
    );
  }
}
