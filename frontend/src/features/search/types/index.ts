export interface SearchParams {
  keyword?: string;
  categoryId?: number;
  brandId?: number;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: "profit" | "roi" | "price" | "date";
  sortOrder?: "asc" | "desc";
}

export interface SearchResult {
  id: number;
  name: string;
  category: string;
  brand: string;
  price: number;
  price_type: "listing" | "sold" | "reference" | "manual" | "simulated";
  condition?: string;
  location?: string;
  image?: string;
  profit_score?: number;
  roi_score?: number;
  risk_level?: "low" | "medium" | "high" | "insufficient";
  recommendation?: "watch" | "caution" | "avoid";
}
