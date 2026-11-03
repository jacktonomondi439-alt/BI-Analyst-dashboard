/** Mock datasets + helpers — swap for API + query layer later. */

export type DateRangeKey = '7' | '30' | '90';
export type SiteFilter = 'all' | 'Warehouse A' | 'Warehouse B' | 'Terminal C';
export type RowStatus = 'ok' | 'low' | 'critical';
export type AnomalySeverity = 'Low' | 'Medium' | 'Critical';

export interface Anomaly {
  id: string;
  message: string;
  timestamp: string;
  severity: AnomalySeverity;
  site: Exclude<SiteFilter, 'all'>;
}

export interface InventoryRow {
  sku: string;
  site: SiteFilter;
  qtyOnHand: number;
  reorderLevel: number;
  daysOfSupply: number;
  status: RowStatus;
  /** Extra fields for detail panel */
  lastReceipt: string;
  category: string;
}

const RANGE_MULT: Record<DateRangeKey, number> = {
  '7': 0.96,
  '30': 1,
  '90': 1.045,
};

const SITE_THROUGHPUT_SHARE: Record<Exclude<SiteFilter, 'all'>, number> = {
  'Warehouse A': 0.44,
  'Warehouse B': 0.33,
  'Terminal C': 0.23,
};

export const SITE_OPTIONS: SiteFilter[] = ['all', 'Warehouse A', 'Warehouse B', 'Terminal C'];

export const ANOMALIES_SEED: Anomaly[] = [
  {
    id: 'LOG-882',
    message: 'Inventory drift detected in Warehouse B — cycle count variance 4.2%.',
    timestamp: '2026-03-22 10:14:02',
    severity: 'Medium',
    site: 'Warehouse B',
  },
  {
    id: 'LOG-879',
    message: 'Demand spike on SKU-20441 exceeded 2σ vs trailing 30d.',
    timestamp: '2026-03-22 09:58:41',
    severity: 'Low',
    site: 'Warehouse A',
  },
  {
    id: 'LOG-871',
    message: 'Terminal C dock throughput below SLA for 3 consecutive hours.',
    timestamp: '2026-03-22 09:12:09',
    severity: 'Critical',
    site: 'Terminal C',
  },
  {
    id: 'LOG-865',
    message: 'Reorder point breach risk on cold-chain lane (predicted 36h).',
    timestamp: '2026-03-22 08:44:33',
    severity: 'Medium',
    site: 'Terminal C',
  },
  {
    id: 'LOG-858',
    message: 'ASN mismatch: expected 120 cartons, received 118.',
    timestamp: '2026-03-22 07:30:00',
    severity: 'Low',
    site: 'Warehouse B',
  },
  {
    id: 'LOG-851',
    message: 'Warehouse A pick path congestion — suggest wave reschedule.',
    timestamp: '2026-03-22 06:05:12',
    severity: 'Low',
    site: 'Warehouse A',
  },
];

const THROUGHPUT_BASE = [
  { week: 'W1', units: 5620 },
  { week: 'W2', units: 5710 },
  { week: 'W3', units: 5580 },
  { week: 'W4', units: 5890 },
  { week: 'W5', units: 5920 },
  { week: 'W6', units: 6010 },
];

const VOLUME_BASE = [
  { name: 'Warehouse A', units: 12800 },
  { name: 'Warehouse B', units: 9400 },
  { name: 'Terminal C', units: 7100 },
];

const FORECAST_BASE = [
  { week: '+1', forecast: 5750, actual: 5680 },
  { week: '+2', forecast: 5820, actual: 5910 },
  { week: '+3', forecast: 5900, actual: 5865 },
  { week: '+4', forecast: 5980, actual: 6025 },
  { week: '+5', forecast: 6050, actual: 6110 },
  { week: '+6', forecast: 6120, actual: 6195 },
];

const AGING_BASE = [
  { bucket: '0–30d', 'Warehouse A': 1180, 'Warehouse B': 920, 'Terminal C': 640 },
  { bucket: '31–60d', 'Warehouse A': 420, 'Warehouse B': 510, 'Terminal C': 280 },
  { bucket: '61–90+d', 'Warehouse A': 95, 'Warehouse B': 140, 'Terminal C': 72 },
];

const INVENTORY_ROWS: InventoryRow[] = [
  {
    sku: 'SKU-10042',
    site: 'Warehouse A',
    qtyOnHand: 842,
    reorderLevel: 200,
    daysOfSupply: 22,
    status: 'ok',
    lastReceipt: '2026-03-19',
    category: 'Finished goods',
  },
  {
    sku: 'SKU-20441',
    site: 'Warehouse B',
    qtyOnHand: 118,
    reorderLevel: 150,
    daysOfSupply: 9,
    status: 'low',
    lastReceipt: '2026-03-17',
    category: 'Components',
  },
  {
    sku: 'SKU-08812',
    site: 'Terminal C',
    qtyOnHand: 45,
    reorderLevel: 120,
    daysOfSupply: 4,
    status: 'critical',
    lastReceipt: '2026-03-10',
    category: 'Spare parts',
  },
  {
    sku: 'SKU-33190',
    site: 'Warehouse A',
    qtyOnHand: 2100,
    reorderLevel: 400,
    daysOfSupply: 31,
    status: 'ok',
    lastReceipt: '2026-03-21',
    category: 'Raw materials',
  },
  {
    sku: 'SKU-77102',
    site: 'Warehouse B',
    qtyOnHand: 330,
    reorderLevel: 200,
    daysOfSupply: 14,
    status: 'ok',
    lastReceipt: '2026-03-18',
    category: 'Packaging',
  },
  {
    sku: 'SKU-50001',
    site: 'Terminal C',
    qtyOnHand: 560,
    reorderLevel: 180,
    daysOfSupply: 18,
    status: 'ok',
    lastReceipt: '2026-03-20',
    category: 'Finished goods',
  },
  {
    sku: 'SKU-22009',
    site: 'Warehouse A',
    qtyOnHand: 92,
    reorderLevel: 100,
    daysOfSupply: 7,
    status: 'low',
    lastReceipt: '2026-03-15',
    category: 'Components',
  },
];

function round(n: number) {
  return Math.round(n);
}

export function getThroughput(range: DateRangeKey, site: SiteFilter) {
  const m = RANGE_MULT[range];
  const siteM = site === 'all' ? 1 : SITE_THROUGHPUT_SHARE[site];
  return THROUGHPUT_BASE.map((d) => ({
    week: d.week,
    units: round(d.units * m * siteM),
  }));
}

export function getVolumeBySite(range: DateRangeKey, site: SiteFilter) {
  const m = RANGE_MULT[range];
  const rows = VOLUME_BASE.map((d) => ({ ...d, units: round(d.units * m) }));
  if (site === 'all') return rows;
  return rows.filter((r) => r.name === site);
}

export function getForecastVsActual(range: DateRangeKey, site: SiteFilter) {
  const m = RANGE_MULT[range];
  const siteM = site === 'all' ? 1 : 0.85 + SITE_THROUGHPUT_SHARE[site] * 0.35;
  return FORECAST_BASE.map((d) => ({
    week: d.week,
    forecast: round(d.forecast * m * siteM),
    actual: round(d.actual * m * siteM),
  }));
}

export function getAgingData(range: DateRangeKey, site: SiteFilter) {
  const m = RANGE_MULT[range];
  if (site === 'all') {
    return AGING_BASE.map((row) => ({
      bucket: row.bucket,
      'Warehouse A': round(row['Warehouse A'] * m),
      'Warehouse B': round(row['Warehouse B'] * m),
      'Terminal C': round(row['Terminal C'] * m),
    }));
  }
  const key = site as 'Warehouse A' | 'Warehouse B' | 'Terminal C';
  return AGING_BASE.map((row) => ({
    bucket: row.bucket,
    units: round(row[key] * m),
  }));
}

export function getKpis(range: DateRangeKey, site: SiteFilter) {
  const m = RANGE_MULT[range];
  const siteOnly = site !== 'all';

  return {
    stockVelocityPct:
      round((84.2 + (m - 1) * 4.5 + (siteOnly ? -1.8 : 0)) * 10) / 10,
    fillRatePct: round((97.4 + (m - 1) * 1.8 + (siteOnly ? 0.4 : 0)) * 10) / 10,
    openExceptions: Math.max(
      4,
      round(12 * (siteOnly ? 0.55 : 1) * (range === '7' ? 0.88 : range === '90' ? 1.12 : 1)),
    ),
    daysOfSupply:
      round(
        (18.3 +
          (range === '7' ? 1.1 : range === '90' ? -0.9 : 0) +
          (siteOnly ? 0.8 : 0)) *
          10,
      ) / 10,
  };
}

export function getInventoryRows(site: SiteFilter): InventoryRow[] {
  if (site === 'all') return [...INVENTORY_ROWS];
  return INVENTORY_ROWS.filter((r) => r.site === site);
}

/** Deterministic mock weekly demand for SKU detail sparkline. */
export function getSkuWeeklyDemand(sku: string): { week: string; units: number }[] {
  let h = 0;
  for (let i = 0; i < sku.length; i++) h = (h * 31 + sku.charCodeAt(i)) >>> 0;
  const base = 80 + (h % 120);
  return ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'].map((week, i) => {
    const wave = Math.sin((i + (h % 7)) * 0.85) * 18;
    const drift = (h % 13) + i * 3;
    return { week, units: Math.max(12, Math.round(base + wave + drift - i * 2)) };
  });
}
