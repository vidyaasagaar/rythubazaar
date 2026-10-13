/**
 * Central RBAC definition. The API enforces these on every protected route;
 * the web app only uses them to shape navigation (never as a security boundary).
 */
export const ROLES = ['CUSTOMER', 'FARMER', 'SUPPORT', 'OPERATIONS', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: readonly Role[] = ['SUPPORT', 'OPERATIONS', 'ADMIN'];
export const SELF_REGISTER_ROLES = ['CUSTOMER', 'FARMER'] as const;

export const PERMISSIONS = [
  'cart:manage',
  'orders:create',
  'orders:read:own',
  'returns:create:own',
  'support:create',
  'listings:manage:own',
  'orders:read:farmer',
  'orders:transition:farmer',
  'payouts:read:own',
  'profile:farmer',
  'users:read',
  'listings:read:any',
  'listings:verify-certification',
  'orders:read:any',
  'orders:manage',
  'deliveries:manage',
  'returns:read:any',
  'returns:manage',
  'payouts:read:any',
  'payouts:manage',
  'support:read:any',
  'support:manage',
  'calls:read',
  'audit:read',
  'audit:export',
  'pii:read',
  'users:manage-roles',
  'config:read',
  'uploads:create',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const SUPPORT_PERMISSIONS: Permission[] = [
  'users:read',
  'listings:read:any',
  'orders:read:any',
  'returns:read:any',
  'support:read:any',
  'support:manage',
  'calls:read',
];

const OPERATIONS_PERMISSIONS: Permission[] = [
  ...SUPPORT_PERMISSIONS,
  'listings:verify-certification',
  'orders:manage',
  'deliveries:manage',
  'returns:manage',
  'payouts:read:any',
  'audit:read',
  'audit:export',
  'pii:read',
  'uploads:create',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  CUSTOMER: ['cart:manage', 'orders:create', 'orders:read:own', 'returns:create:own', 'support:create'],
  FARMER: [
    'listings:manage:own',
    'orders:read:farmer',
    'orders:transition:farmer',
    'payouts:read:own',
    'profile:farmer',
    'support:create',
    'uploads:create',
  ],
  SUPPORT: SUPPORT_PERMISSIONS,
  OPERATIONS: OPERATIONS_PERMISSIONS,
  // Admin is the only role with money movement, role management and config access.
  ADMIN: [...OPERATIONS_PERMISSIONS, 'payouts:manage', 'users:manage-roles', 'config:read'],
};

export function hasPermission(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isStaff(role: Role | undefined | null): boolean {
  return !!role && STAFF_ROLES.includes(role);
}
