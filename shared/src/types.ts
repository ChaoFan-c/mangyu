/** 价格类型：五类价格在任何地方都不能互相冒充。 */
export type PriceType = 'listing' | 'sold' | 'reference' | 'manual' | 'simulated';

export type RiskLevel = 'low' | 'medium' | 'high' | 'insufficient';

export type EvidenceStatus = 'pass' | 'warning' | 'fail' | 'unknown';

export type Recommendation = 'watch' | 'caution' | 'avoid';

export type TrackStatus = 'watching' | 'bought' | 'sold' | 'skipped';

export type ProductOrigin = 'seed' | 'manual' | 'import';

/**
 * 卖家信誉资料。
 * 全部字段都来自页面上「实际展示」的信息；缺失一律留空，
 * 由风险评估标记为「无法确认」，绝不填占位值或推测值。
 */
export interface SellerProfile {
  name?: string;
  rating?: number;
  transactions?: number;
  /** 芝麻信用等级，例如「极好 / 优秀 / 良好」。 */
  zhimaLevel?: string;
  /** 好评率，百分比数值，例如 98.5。 */
  goodRatePercent?: number;
  /** 已售件数（页面展示的成交数）。 */
  soldCount?: number;
  /** 这些资料的来源说明，用于界面展示可信度。 */
  source?: string;
}

/**
 * 行情价：用户自己判断并手动输入的参考市场价格。
 * 它不是平台成交均价，也不是自动采集的挂牌均价，
 * 因此只能由用户创建、修改和删除，采集程序不得生成或覆盖。
 */
export interface MarketPrice {
  id: number;
  /** 关联口径：按关键词或按型号。 */
  scope: 'keyword' | 'model';
  /** 归一化后的匹配键。 */
  scopeKey: string;
  /** 用户原始输入，便于展示。 */
  label: string;
  /** 金额单位：分。 */
  price: number;
  note?: string;
  updatedAt: string;
}

/** 商品：列表、详情、搜索与评分都基于这一结构。 */
export interface ProductType {
  id: number;
  name: string;
  /** 型号：用于同型号不同成色的横向比较。 */
  model?: string;
  category: string;
  brand: string;
  /** 金额单位：分。 */
  price: number;
  price_type: PriceType;
  condition: string;
  image: string;
  /** 模拟挂牌的实拍图占位路径，非真实图片链接。 */
  images?: string[];
  /** 卖家描述文本。 */
  description?: string;
  /** 卖家公开资料，用于卖家信誉评估；缺失字段表示页面未展示。 */
  seller?: SellerProfile;
  origin: ProductOrigin;
  source_id?: string;
  source_ref?: string;
  profit_score?: number;
  roi_score?: number;
  risk_level?: RiskLevel;
  recommendation?: Recommendation;
}

export interface MockPriceRecord {
  id: number;
  product_id: number;
  platform: string;
  /** 金额单位：分。 */
  price: number;
  price_type: PriceType;
  condition: string;
  location: string;
  shipping_fee: number;
  platform_fee_rate: number;
  collected_at: string;
  source_url: string;
  confidence: number;
  listing_id: string;
  seller_info: SellerProfile;
  notes: string;
  data_source: string;
  source_id?: string;
  external_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryRef {
  id: number;
  name: string;
  slug: string;
  icon: string;
  /** 所属的大分类名（闲鱼官网 10 大类之一）；未映射时留空。 */
  group?: string;
}

export interface BrandRef {
  id: number;
  name: string;
  slug: string;
  category_id: number;
}
