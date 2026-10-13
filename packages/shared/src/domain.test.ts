import { describe, expect, it } from 'vitest';
import {
  allowedOrderTransitions,
  canTransitionPayout,
  findOrderTransition,
  orderActorFor,
  LISTING_TRANSITIONS,
} from './domain';
import { priceShipment } from './pricing';
import { hasPermission, ROLE_PERMISSIONS } from './roles';

const fees = {
  deliveryFeePaise: 3000,
  freeDeliveryThresholdPaise: 50000,
  serviceFeeBps: 200,
  serviceFeeCapPaise: 2000,
};

describe('pricing', () => {
  it('computes each fee separately and pays the farmer the full subtotal', () => {
    const p = priceShipment([{ unitPricePaise: 4000, quantity: 5 }], fees);
    expect(p.subtotalPaise).toBe(20000);
    expect(p.deliveryFeePaise).toBe(3000);
    expect(p.serviceFeePaise).toBe(400);
    expect(p.discountPaise).toBe(0);
    expect(p.totalPaise).toBe(23400);
    expect(p.farmerPayoutPaise).toBe(20000);
  });

  it('waives delivery above the threshold and caps the service fee', () => {
    const p = priceShipment([{ unitPricePaise: 200000, quantity: 1 }], fees);
    expect(p.deliveryFeePaise).toBe(0);
    expect(p.serviceFeePaise).toBe(2000);
  });
});

describe('order state machine', () => {
  it('follows the happy path', () => {
    expect(findOrderTransition('PLACED', 'CONFIRMED')).toBeDefined();
    expect(findOrderTransition('READY_FOR_COLLECTION', 'COLLECTED')?.requiresCollection).toBe(true);
    expect(findOrderTransition('DISPATCHED', 'DELIVERED')).toBeDefined();
  });

  it('rejects skipping states', () => {
    expect(findOrderTransition('PLACED', 'DELIVERED')).toBeUndefined();
    expect(findOrderTransition('DELIVERED', 'CANCELLED')).toBeUndefined();
  });

  it('only lets operations collect/dispatch, and customers only cancel when PLACED', () => {
    expect(allowedOrderTransitions('READY_FOR_COLLECTION', 'FARMER_OWNER').map((t) => t.to)).toEqual([]);
    expect(allowedOrderTransitions('PLACED', 'CUSTOMER_OWNER').map((t) => t.to)).toEqual(['CANCELLED']);
    expect(allowedOrderTransitions('CONFIRMED', 'CUSTOMER_OWNER')).toEqual([]);
  });

  it('maps roles to actors only with ownership', () => {
    expect(orderActorFor('FARMER', { customer: false, farmer: false })).toBeNull();
    expect(orderActorFor('SUPPORT', { customer: false, farmer: false })).toBeNull();
    expect(orderActorFor('ADMIN', { customer: false, farmer: false })).toBe('OPERATIONS');
  });
});

describe('payout state machine', () => {
  it('requires a provider result for success or failure', () => {
    expect(canTransitionPayout('INITIATED', 'SUCCEEDED', 'PROVIDER')).toBe(true);
    expect(canTransitionPayout('INITIATED', 'SUCCEEDED', 'USER')).toBe(false);
    expect(canTransitionPayout('PENDING', 'SUCCEEDED', 'PROVIDER')).toBe(false);
    expect(canTransitionPayout('FAILED', 'INITIATED', 'USER')).toBe(true);
  });
});

describe('listing lifecycle', () => {
  it('cannot leave ARCHIVED', () => {
    expect(LISTING_TRANSITIONS.ARCHIVED).toEqual([]);
    expect(LISTING_TRANSITIONS.DRAFT).toContain('ACTIVE');
  });
});

describe('RBAC matrix', () => {
  it('keeps money movement and role management admin-only', () => {
    for (const role of ['CUSTOMER', 'FARMER', 'SUPPORT', 'OPERATIONS'] as const) {
      expect(hasPermission(role, 'payouts:manage')).toBe(false);
      expect(hasPermission(role, 'users:manage-roles')).toBe(false);
    }
    expect(hasPermission('ADMIN', 'payouts:manage')).toBe(true);
  });

  it('gives support read-only operational access', () => {
    expect(hasPermission('SUPPORT', 'orders:read:any')).toBe(true);
    expect(hasPermission('SUPPORT', 'orders:manage')).toBe(false);
    expect(hasPermission('SUPPORT', 'returns:manage')).toBe(false);
    expect(hasPermission('SUPPORT', 'pii:read')).toBe(false);
  });

  it('does not give customers or farmers any staff permission', () => {
    expect(ROLE_PERMISSIONS.CUSTOMER).not.toContain('orders:read:any');
    expect(ROLE_PERMISSIONS.FARMER).not.toContain('calls:read');
  });
});
