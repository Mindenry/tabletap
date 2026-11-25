export interface PlanLimits {
  branches: number;
  staff: number;
  monthlyOrders: number;
  storageMb: number;
}

export interface PlanDefinition {
  key: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  name: string;
  description: string;
  priceMonthly: string;
  currency: 'THB';
  features: string[];
  limits: PlanLimits;
}

export const PLANS: PlanDefinition[] = [
  {
    key: 'STARTER',
    name: 'Starter',
    description: 'One branch getting started with QR ordering.',
    priceMonthly: '990.00',
    currency: 'THB',
    features: ['QR ordering', 'Menu management', 'Order and kitchen display', 'Basic reports'],
    limits: { branches: 1, staff: 5, monthlyOrders: 2_000, storageMb: 512 },
  },
  {
    key: 'GROWTH',
    name: 'Growth',
    description: 'Multi-branch operators who need inventory and analytics.',
    priceMonthly: '2_490.00',
    currency: 'THB',
    features: [
      'Everything in Starter',
      'Multiple branches',
      'Inventory and recipes',
      'Promotions',
      'Advanced analytics and exports',
    ],
    limits: { branches: 5, staff: 30, monthlyOrders: 20_000, storageMb: 5_120 },
  },
  {
    key: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Larger groups with custom limits and integrations.',
    priceMonthly: '0.00',
    currency: 'THB',
    features: [
      'Everything in Growth',
      'Custom limits',
      'Audit and operational controls',
      'Integration support',
    ],
    limits: { branches: 100, staff: 500, monthlyOrders: 500_000, storageMb: 51_200 },
  },
];

export function getPlan(key: string): PlanDefinition | undefined {
  return PLANS.find((plan) => plan.key === key);
}

/** Feature keys gated by subscription. Empty string means always available. */
export type FeatureKey =
  'qr_ordering' | 'kitchen_display' | 'inventory' | 'promotions' | 'analytics' | 'exports' | 'multi_branch';

const PLAN_FEATURES: Record<PlanDefinition['key'], FeatureKey[]> = {
  STARTER: ['qr_ordering', 'kitchen_display', 'analytics'],
  GROWTH: [
    'qr_ordering',
    'kitchen_display',
    'inventory',
    'promotions',
    'analytics',
    'exports',
    'multi_branch',
  ],
  ENTERPRISE: [
    'qr_ordering',
    'kitchen_display',
    'inventory',
    'promotions',
    'analytics',
    'exports',
    'multi_branch',
  ],
};

export function planHasFeature(key: string, feature: FeatureKey): boolean {
  const plan = getPlan(key);
  return plan ? PLAN_FEATURES[plan.key].includes(feature) : false;
}
