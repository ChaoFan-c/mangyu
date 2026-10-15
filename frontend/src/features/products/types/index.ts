export interface Product {
  id: number;
  category_id: number;
  brand_id: number;
  model: string;
  sku?: string;
  name: string;
  specs?: Record<string, any>;
  original_price?: number;
  release_year?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PriceRecord {
  id: number;
  product_id: number;
  platform: string;
  price: number;
  price_type: "listing" | "sold" | "reference" | "manual" | "simulated";
  condition?: string;
  location?: string;
  shipping_fee?: number;
  platform_fee_rate?: number;
  collected_at: string;
  source_url?: string;
  confidence?: number;
  listing_id?: string;
  seller_info?: Record<string, any>;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductType {
  id: number;
  name: string;
  /** 型号：用于同型号不同成色的横向比较。 */
  model?: string;
  category: string;
  brand: string;
  price: number;
  price_type: "listing" | "sold" | "reference" | "manual" | "simulated";
  condition: string;
  image: string;
  /** 模拟挂牌的实拍图占位路径，非真实图片链接。 */
  images?: string[];
  /** 模拟卖家描述文本。 */
  description?: string;
  /** 模拟卖家公开资料，仅用于演示信誉维度。 */
  seller?: {
    name?: string;
    rating?: number;
    transactions?: number;
    zhimaLevel?: string;
    goodRatePercent?: number;
    soldCount?: number;
    source?: string;
  };
  origin: "seed" | "manual" | "import";
  source_id?: string;
  source_ref?: string;
  profit_score?: number;
  roi_score?: number;
  risk_level?: "low" | "medium" | "high" | "insufficient";
  recommendation?: "watch" | "caution" | "avoid";
}
