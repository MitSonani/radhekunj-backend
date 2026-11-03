import * as inventoryRepository from './repository.js';
import type {
  InventoryDashboardData,
  InventoryListFilters,
  InventoryListItem,
  InventoryMovementListItem,
  InventorySettings,
  StockAdjustmentInput,
  StockMovementFilters,
  UpdateThresholdInput,
} from './types.js';
import { buildPaginationMeta } from '../../shared/utils/pagination.js';
import type { PaginationMeta } from '../../shared/types/index.js';

export async function getDashboard(): Promise<InventoryDashboardData> {
  return inventoryRepository.getDashboardData();
}

export async function listInventory(
  filters: InventoryListFilters,
  page: number,
  limit: number,
): Promise<{
  items: InventoryListItem[];
  pagination: PaginationMeta;
}> {
  const { items, total } = await inventoryRepository.findManyInventory(filters, page, limit);

  return {
    items,
    pagination: buildPaginationMeta(page, limit, total),
  };
}

export async function getVariantInventory(variantId: string): Promise<{
  item: InventoryListItem;
  movements: InventoryMovementListItem[];
}> {
  return inventoryRepository.findInventoryByVariantId(variantId);
}

export async function adjustStock(
  variantId: string,
  input: StockAdjustmentInput,
  adminId: string,
): Promise<{
  item: InventoryListItem;
  movement: InventoryMovementListItem;
}> {
  return inventoryRepository.adjustStock(variantId, input, adminId);
}

export async function updateThreshold(
  variantId: string,
  input: UpdateThresholdInput,
): Promise<InventoryListItem> {
  return inventoryRepository.updateVariantThreshold(variantId, input.lowStockThreshold);
}

export async function listMovements(
  filters: StockMovementFilters,
  page: number,
  limit: number,
): Promise<{
  items: InventoryMovementListItem[];
  pagination: PaginationMeta;
}> {
  const { items, total } = await inventoryRepository.findManyMovements(filters, page, limit);

  return {
    items,
    pagination: buildPaginationMeta(page, limit, total),
  };
}

export async function getSettings(): Promise<InventorySettings> {
  return inventoryRepository.getInventorySettings();
}

export async function updateSettings(input: InventorySettings): Promise<InventorySettings> {
  return inventoryRepository.updateInventorySettings(input);
}
