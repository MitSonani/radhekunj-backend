import { InventoryMovementType } from '@prisma/client';

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export type StockAdjustmentAction = 'ADD' | 'REMOVE' | 'SET' | 'CORRECTION';

export interface InventoryItemAttribute {
  name: string;
  value: string;
  colorCode?: string | null;
}

export interface InventoryItemCategory {
  id: string;
  name: string;
  slug: string;
}

export interface InventoryListItem {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  productImage: string | null;
  category: InventoryItemCategory;
  sku: string;
  price: string;
  compareAtPrice: string | null;
  attributes: InventoryItemAttribute[];
  quantity: number;
  reservedQuantity: number;
  availableStock: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryMovementAdmin {
  id: string;
  name: string;
  mobileNumber?: string;
}

export interface InventoryMovementListItem {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  productImage: string | null;
  attributes: InventoryItemAttribute[];
  type: InventoryMovementType;
  previousQuantity: number;
  quantityChange: number;
  newQuantity: number;
  previousReserved: number;
  reservedChange: number;
  newReserved: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  admin: InventoryMovementAdmin | null;
  createdAt: Date;
}

export interface InventoryValuation {
  retailValue: string;
  valuationMethod: string;
  currency: string;
}

export interface StockStatusBreakdown {
  inStock: number;
  lowStock: number;
  outOfStock: number;
}

export interface InventoryDashboardData {
  totalProducts: number;
  totalVariants: number;
  totalStock: number;
  totalAvailableStock: number;
  totalReservedStock: number;
  lowStockVariantsCount: number;
  outOfStockVariantsCount: number;
  inventoryValuation: InventoryValuation;
  stockStatusBreakdown: StockStatusBreakdown;
  recentMovements: InventoryMovementListItem[];
}

export interface InventoryListFilters {
  search?: string;
  categoryId?: string;
  stockStatus?: StockStatus | 'ALL';
  sortBy?: 'name' | 'sku' | 'stock' | 'availableStock' | 'updatedAt' | 'price';
  sortOrder?: 'asc' | 'desc';
}

export interface StockMovementFilters {
  variantId?: string;
  type?: InventoryMovementType;
  search?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface StockAdjustmentInput {
  action: StockAdjustmentAction;
  quantity: number;
  reason: string;
  notes?: string;
}

export interface UpdateThresholdInput {
  lowStockThreshold: number;
}

export interface InventorySettings {
  defaultLowStockThreshold: number;
}
