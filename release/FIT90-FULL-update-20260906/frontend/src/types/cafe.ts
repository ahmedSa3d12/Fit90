export type RecipeUnit = 'g' | 'kg' | 'ml' | 'L' | 'piece' | string;

export interface CafeRecipeItem {
  id: number;
  ingredientId: number;
  ingredientName: string;
  ingredientBaseUnit: string;
  quantity: number;
  unit: RecipeUnit;
  sortOrder: number;
}

export interface CafeProductListItem {
  id: number;
  productCode: string;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  sellPrice: number;
  imageUrl: string | null;
  isActive: boolean;
  recipeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CafeProductDetail extends CafeProductListItem {
  recipes: CafeRecipeItem[];
}

export interface CafeCategory {
  id: number;
  nameAr: string;
  nameEn: string;
  description?: string | null;
  parentCategoryId?: number | null;
  isActive: boolean;
  parent: { id: number; nameAr: string; nameEn: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CafeSellResult {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface UpsertCafeProductDto {
  name: string;
  sellPrice: number;
  categoryId?: number;
  imageUrl?: string;
  isActive?: boolean;
  recipes?: Array<{
    ingredientId: number;
    quantity: number;
    unit: RecipeUnit;
  }>;
}

export interface SellCafeProductDto {
  quantity: number;
}

export interface CafeCartItem {
  product: CafeProductListItem;
  quantity: number;
}
