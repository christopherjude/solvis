import type { Category, EdgeKind } from '@solvis/core';

/** Color per resource category — drives node accent + legend. */
export const CATEGORY_COLOR: Record<Category, string> = {
  compute: '#e8833a',
  storage: '#3aa05a',
  database: '#2f6fd6',
  network: '#7a52cc',
  security: '#d23f3f',
  identity: '#c0392b',
  integration: '#d6a72f',
  frontend: '#2fb6b6',
  observability: '#6b7785',
  other: '#8a93a0',
};

/** Color + label per edge layer. */
export const EDGE_STYLE: Record<EdgeKind, { color: string; label: string }> = {
  reference: { color: '#9aa3ad', label: 'Reference' },
  'cross-stack': { color: '#2f6fd6', label: 'Cross-stack' },
  iam: { color: '#d23f3f', label: 'IAM / permissions' },
  dataflow: { color: '#e8833a', label: 'Data flow' },
};

export const CATEGORY_ORDER: Category[] = [
  'compute',
  'database',
  'storage',
  'integration',
  'network',
  'security',
  'identity',
  'frontend',
  'observability',
  'other',
];
