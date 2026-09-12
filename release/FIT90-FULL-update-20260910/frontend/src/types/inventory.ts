export interface ProductListItem {
  id: number;
  productCode: string;
  nameAr: string;
  nameEn?: string | null;
  costPrice: number;
  sellingPrice: number;
  wholesalePrice?: number | null;
  status: string;
  categoryId?: number | null;
  brandId?: number | null;
  supplierId?: number | null;
  imageUrl?: string | null;
  reorderPoint: number;
  unitOfMeasure: string;
}

export interface ProductFormData {
  nameAr: string;
  nameEn: string;
  productCode: string;
  sellingPrice: number;
  costPrice: number;
  categoryId?: number;
  brandId?: number;
  manufacturerId?: number;
  supplierId?: number;
  unitTemplateId?: number;
  imageUrl: string;
  status: string;
  barcode: string;
  description: string;
  reorderPoint: number;
  applyToAllBranches: boolean;
}

export interface InventoryDashboardSummary {
  branchId: string | null;
  totalProducts: number;
  totalWarehouses: number;
  totalStockValue: number;
  lowStockCount: number;
  movementCount: number;
  movementsByType: Record<string, number>;
  topItems: Array<{
    productId: number;
    productName: string | null;
    warehouseId: number;
    currentStock: number;
    stockValue: number;
  }>;
}

export interface NamedEntity {
  id: number;
  nameAr?: string;
  nameEn?: string;
  name?: string;
  isActive?: boolean;
}

export interface StockBalanceRow {
  id: number;
  productId: number;
  warehouseId: number;
  currentStock: number;
  reorderPoint: number;
  product?: { nameAr: string; productCode: string };
  warehouse?: { nameAr: string; warehouseCode: string };
}

export interface InventoryTransactionRow {
  id: number;
  reference: string;
  txnType: string;
  status: string;
  txnDate: string;
  branchId: number;
  totalAmount: number;
  notes?: string | null;
}

export interface InventoryMovementRow {
  id: number;
  movementDate: string;
  txnType: string;
  direction: string;
  quantity: number;
  balanceAfter: number;
  product?: { nameAr: string };
  warehouse?: { nameAr: string };
}
