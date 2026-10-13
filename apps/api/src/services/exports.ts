import { CALL_EVENT_LANE, type CallEventKind } from '@rythubazaar/shared';
import { redactDeep } from '../lib/redact';

type Row = Record<string, unknown>;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Neutralise spreadsheet formula injection and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(rows: Row[], columns: string[]): string {
  const header = columns.map(csvCell).join(',');
  const body = rows.map((r) =>
    columns
      .map((c) => csvCell(c.split('.').reduce<unknown>((v, k) => (v as Row | undefined)?.[k], r)))
      .join(','),
  );
  return [header, ...body].join('\r\n');
}

export interface CallExportItem {
  session: Row;
  events: {
    seq: number;
    at: Date | string;
    kind: string;
    node: string;
    text?: string | null;
    payload: Row;
  }[];
}

export function callsToJson(items: CallExportItem[], meta: Row): string {
  return JSON.stringify({ meta, calls: redactDeep(items) }, null, 2);
}

export function callsToCsv(items: CallExportItem[]): string {
  const rows: Row[] = [];
  for (const item of items) {
    const s = redactDeep(item.session) as Row;
    for (const e of redactDeep(item.events) as CallExportItem['events']) {
      rows.push({
        callId: s.callId,
        dialedCode: s.dialedCode,
        language: s.language,
        outcome: s.outcome,
        seq: e.seq,
        at: e.at,
        lane: CALL_EVENT_LANE[e.kind as CallEventKind] ?? 'SYSTEM',
        kind: e.kind,
        node: e.node,
        text: e.text,
        payload: e.payload,
      });
    }
  }
  return toCsv(rows, [
    'callId',
    'dialedCode',
    'language',
    'outcome',
    'seq',
    'at',
    'lane',
    'kind',
    'node',
    'text',
    'payload',
  ]);
}

export function callsToMarkdown(items: CallExportItem[], meta: Row): string {
  const out: string[] = [
    '# RythuBazaar call audit export',
    '',
    `Generated: ${String(meta.generatedAt)}  `,
    `Exported by role: ${String(meta.exportedByRole)}  `,
    `Filters: ${JSON.stringify(meta.filters)}  `,
    'Personal data is redacted. Mode: DEMO (in-app simulation — no telephone-network calls).',
    '',
  ];
  for (const item of items) {
    const s = redactDeep(item.session) as Row;
    out.push(`## Call ${String(s.callId)}`, '');
    out.push(
      `- Dialed: ${String(s.dialedCode)} · Language: ${String(s.language ?? '—')} · Outcome: ${String(s.outcome)}`,
      `- Started: ${String(s.startedAt)} · Ended: ${String(s.endedAt ?? '—')}`,
      `- Caller role: ${String(s.userRole ?? 'GUEST')} · Errors: ${s.hasError ? 'yes' : 'no'}`,
      '',
      '| # | Time | Lane | Event | Detail |',
      '|---|------|------|-------|--------|',
    );
    for (const e of redactDeep(item.events) as CallExportItem['events']) {
      const detail = (e.text ?? JSON.stringify(e.payload))
        .replace(/\|/g, '\\|')
        .replace(/\s+/g, ' ')
        .slice(0, 300);
      out.push(
        `| ${e.seq} | ${String(e.at)} | ${CALL_EVENT_LANE[e.kind as CallEventKind] ?? 'SYSTEM'} | ${e.kind} | ${detail} |`,
      );
    }
    out.push('');
  }
  return out.join('\n');
}

export function auditToMarkdown(rows: Row[], meta: Row): string {
  const out = [
    '# RythuBazaar audit log export',
    '',
    `Generated: ${String(meta.generatedAt)} · Filters: ${JSON.stringify(meta.filters)}`,
    '',
    '| Time | Category | Action | Outcome | Actor | Resource | Correlation |',
    '|------|----------|--------|---------|-------|----------|-------------|',
  ];
  for (const r of redactDeep(rows) as Row[]) {
    out.push(
      `| ${String(r.at)} | ${String(r.category)} | ${String(r.action)} | ${String(r.outcome)} | ${String(r.actorRole ?? r.actorType)} | ${String(r.resourceType ?? '')} ${String(r.resourceId ?? '')} | ${String(r.correlationId ?? '')} |`,
    );
  }
  return out.join('\n');
}
