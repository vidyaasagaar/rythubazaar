import type {
  CertificationStatus,
  Category,
  GrowingPractice,
  ListingStatus,
  OrderStatus,
  PayoutStatus,
  ReturnReason,
  ReturnStatus,
  Unit,
} from '@rythubazaar/shared';

export interface PublicListing {
  id: string;
  cropName: string;
  category: Category;
  description: string;
  photos: string[];
  unit: Unit;
  pricePerUnitPaise: number;
  quantityAvailable: number;
  harvestDate: string | null;
  availableFrom: string | null;
  availableUntil: string | null;
  location: { village: string; district: string; state: string };
  growingPractice: GrowingPractice;
  claim: {
    basis: 'FARMER_REPORTED' | 'STAFF_VERIFIED_CERTIFICATE';
    certificationStatus: CertificationStatus;
    body?: string;
    certificateNumber?: string;
    verifiedAt?: string;
  };
  status: ListingStatus;
  purchasable: boolean;
  farmer: { id: string; name?: string; farmName?: string | null; sellingSince?: string | null };
  createdAt: string;
}

export interface OwnerListing extends PublicListing {
  quantityTotal: number;
  quantityReserved: number;
  quantitySold: number;
  certification: {
    status: CertificationStatus;
    body?: string;
    certificateNumber?: string;
    validUntil?: string | null;
    reviewNote?: string;
  };
  source: 'WEB' | 'CALL';
  sourceCallId: string | null;
  statusHistory: HistoryEntry[];
  updatedAt: string;
}

export interface HistoryEntry {
  from: string | null;
  to: string;
  at: string;
  actorRole?: string | null;
  actorId?: string | null;
  note?: string;
}

export interface CartLine {
  listingId: string;
  quantity: number;
  cropName: string;
  unit: Unit;
  unitPricePaise: number;
  lineTotalPaise: number;
  quantityAvailable: number;
  farmerId: string;
  photo: string | null;
  issue: 'UNAVAILABLE' | 'INSUFFICIENT_STOCK' | null;
}

export interface Shipment {
  farmerId: string;
  farmName: string;
  lines: CartLine[];
  subtotalPaise: number;
  deliveryFeePaise: number;
  serviceFeePaise: number;
  discountPaise: number;
  totalPaise: number;
  farmerPayoutPaise: number;
}

export interface CartQuote {
  lines: CartLine[];
  shipments: Shipment[];
  grandTotalPaise: number;
  hasIssues: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  checkoutGroupId: string;
  customerId?: string;
  farmerId: string;
  farmName: string;
  items: {
    listingId: string;
    cropName: string;
    unit: Unit;
    unitPricePaise: number;
    quantity: number;
    lineTotalPaise: number;
  }[];
  pricing: {
    subtotalPaise: number;
    deliveryFeePaise?: number;
    serviceFeePaise?: number;
    discountPaise?: number;
    totalPaise?: number;
    farmerPayoutPaise: number;
  };
  deliveryAddress: Partial<{
    recipientName: string;
    phone: string;
    line1: string;
    locality: string;
    district: string;
    state: string;
    pincode: string;
  }>;
  payment: { mode: string; status: string };
  status: OrderStatus;
  statusHistory: HistoryEntry[];
  delivery: {
    agentName: string | null;
    agentPhone?: string | null;
    assignedAt: string | null;
    failedAttempts: number;
  };
  assignmentHistory?: { agentName: string; at: string; actorId: string }[];
  pickup: {
    collectedAt: string | null;
    qualityGrade: string | null;
    quantitiesVerified: boolean;
    weightKg: number | null;
    notes?: string | null;
    evidencePhoto?: string | null;
    collectedBy?: string | null;
  };
  cancellationReason: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface Payout {
  id: string;
  farmerId: string;
  orderId: string;
  orderNumber: string;
  amountPaise: number;
  status: PayoutStatus;
  provider: string;
  simulated: boolean;
  providerReference: string | null;
  failureReason: string | null;
  attempts: number;
  history: {
    from: string | null;
    to: string;
    at: string;
    source: string;
    actorId: string | null;
    note?: string;
  }[];
  createdAt: string;
}

export interface ReturnSummary {
  id: string;
  orderId: string;
  orderNumber: string;
  reason: ReturnReason;
  status: ReturnStatus;
  refund: { amountPaise: number; mode: string; recordedAt?: string | null };
  createdAt: string;
}
