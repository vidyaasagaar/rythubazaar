/** All money is integer paise (₹1 = 100 paise) to avoid floating point errors. */
export interface FeeConfig {
  deliveryFeePaise: number;
  freeDeliveryThresholdPaise: number;
  serviceFeeBps: number;
  serviceFeeCapPaise: number;
}

export interface PricedLine {
  unitPricePaise: number;
  quantity: number;
}

export interface ShipmentPricing {
  subtotalPaise: number;
  deliveryFeePaise: number;
  serviceFeePaise: number;
  discountPaise: number;
  totalPaise: number;
  /** Amount owed to the farmer. Zero commission: always equal to the item subtotal. */
  farmerPayoutPaise: number;
}

export function lineTotal(line: PricedLine): number {
  return line.unitPricePaise * line.quantity;
}

/** Customer-paid fees per shipment; the farmer always receives the full item subtotal. */
export function priceShipment(lines: readonly PricedLine[], cfg: FeeConfig): ShipmentPricing {
  const subtotalPaise = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const deliveryFeePaise = subtotalPaise >= cfg.freeDeliveryThresholdPaise ? 0 : cfg.deliveryFeePaise;
  const serviceFeePaise = Math.min(
    Math.round((subtotalPaise * cfg.serviceFeeBps) / 10_000),
    cfg.serviceFeeCapPaise,
  );
  const discountPaise = 0;
  return {
    subtotalPaise,
    deliveryFeePaise,
    serviceFeePaise,
    discountPaise,
    totalPaise: subtotalPaise + deliveryFeePaise + serviceFeePaise - discountPaise,
    farmerPayoutPaise: subtotalPaise,
  };
}

export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}
