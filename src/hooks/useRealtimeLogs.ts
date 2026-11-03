import * as React from 'react';
import type { Anomaly } from '../data/analytics';
import { supabase } from '../lib/supabase';

type RealtimePayload = {
  id?: string | number;
  message?: string;
  severity?: string;
  timestamp?: string;
  created_at?: string;
  site?: string;
};

function isSeverity(value: string): value is Anomaly['severity'] {
  return value === 'Low' || value === 'Medium' || value === 'Critical';
}

function toAnomaly(row: RealtimePayload): Anomaly | null {
  if (!row.id || !row.message) return null;
  const severityStr = row.severity ?? '';
  const severity: Anomaly['severity'] = isSeverity(severityStr) ? severityStr : 'Low';
  const iso = row.timestamp ?? row.created_at;
  const timestamp = iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 19) : 'Live event';
  const allowedSites = new Set<Anomaly['site']>(['Warehouse A', 'Warehouse B', 'Terminal C']);
  const site = allowedSites.has(row.site as Anomaly['site']) ? (row.site as Anomaly['site']) : 'Warehouse A';
  return {
    id: String(row.id),
    message: row.message,
    severity,
    timestamp,
    site,
  };
}

export function useRealtimeLogs(initialLogs: Anomaly[]) {
  const [logs, setLogs] = React.useState<Anomaly[]>(initialLogs);
  const [lastInsertedId, setLastInsertedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

  React.useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel('anomaly_logs_stream')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'anomaly_logs' },
        (payload) => {
          const next = toAnomaly((payload.new ?? {}) as RealtimePayload);
          if (!next) return;
          setLastInsertedId(next.id);
          setLogs((prev) => [next, ...prev.filter((log) => log.id !== next.id)]);
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  return { logs, setLogs, lastInsertedId };
}
