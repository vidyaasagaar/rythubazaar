import { useState } from 'react';
import { Download } from 'lucide-react';
import { download } from '../lib/api';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { Button } from './ui';

/** Redacted export buttons. Every export is recorded in the audit log by the server. */
export function ExportButtons({ base, query, name }: { base: string; query: string; name: string }) {
  const { errorText } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (format: 'json' | 'csv' | 'md') => {
    setBusy(format);
    try {
      const sep = query ? '&' : '?';
      await download(`${base}${query}${sep}format=${format}`, `${name}.${format}`);
      toast(
        'success',
        `Exported ${format.toUpperCase()} (redacted). The export was recorded in the audit log.`,
      );
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {(['json', 'csv', 'md'] as const).map((f) => (
        <Button
          key={f}
          size="sm"
          variant="secondary"
          loading={busy === f}
          onClick={() => run(f)}
          icon={<Download className="h-3.5 w-3.5" />}
        >
          {f === 'md' ? 'Markdown' : f.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
