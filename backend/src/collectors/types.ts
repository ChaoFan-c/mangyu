import type { PriceType, SellerProfile } from '@daoye/shared';

export type SourceMode =
  | 'official_api'
  | 'user_link'
  | 'manual'
  | 'csv'
  | 'browser';
export type SourceStatusValue = 'ok' | 'unavailable' | 'error' | 'unknown';
export type SourceCapability =
  | 'status'
  | 'search'
  | 'detail'
  | 'history'
  | 'link_import';

export interface SourceDescriptor {
  id: string;
  name: string;
  mode: SourceMode;
  legalNote: string;
  requiresCredential: boolean;
  capabilities: SourceCapability[];
  fields: string[];
  limits: string[];
}

export interface SourceStatus {
  status: SourceStatusValue;
  message: string;
  checkedAt?: string;
}

export interface CollectedPrice {
  platform: string;
  priceType: PriceType;
  price: number;
  currency: string;
  condition?: string;
  location?: string;
  shippingFee?: number;
  platformFeeRate?: number;
  collectedAt: string;
  sourceUrl?: string;
  confidence: number;
  notes?: string;
  externalId?: string;
}

export interface CollectedItem {
  sourceId: string;
  externalId: string;
  /** 来源侧可读引用，例如规范化后的商品链接。 */
  sourceRef?: string;
  sourceUrl: string;
  name: string;
  category?: string;
  brand?: string;
  model?: string;
  condition: string;
  description?: string;
  /** 页面上实际展示的卖家信誉信息；缺失字段留空，不填推测值。 */
  seller?: SellerProfile;
  images?: string[];
  prices: CollectedPrice[];
  dataSource: string;
  warnings?: string[];
}

export interface AdapterResult {
  status: SourceStatusValue;
  message: string;
  items: CollectedItem[];
}

export interface HistoryRecord {
  priceType: PriceType;
  price: number;
  currency: string;
  collectedAt: string;
  sourceUrl?: string;
  notes?: string;
}

export interface HistoryResult {
  status: SourceStatusValue;
  message: string;
  records: HistoryRecord[];
}

export interface CollectionAdapter {
  descriptor: SourceDescriptor;
  checkStatus(): Promise<SourceStatus>;
  searchProducts(query: string, limit: number): Promise<AdapterResult>;
  getProductDetail(externalId: string): Promise<AdapterResult>;
  getPriceHistory(externalId: string): Promise<HistoryResult>;
}

export interface LinkMetadata {
  title?: string;
  description?: string;
  image?: string;
  brand?: string;
  model?: string;
  condition?: string;
  price?: number;
  currency?: string;
  sourceUrl: string;
}

export interface LinkFetchResult {
  status: SourceStatusValue;
  message: string;
  /** 是否属于安全或授权边界，不能被“手动补全”绕过后继续保存。 */
  blocked?: boolean;
  metadata?: LinkMetadata;
}

export interface LinkFallbackInput {
  name?: string;
  category?: string;
  brand?: string;
  model?: string;
  condition?: string;
  price?: number;
  location?: string;
  shippingFee?: number;
  notes?: string;
}

/**
 * 本机浏览器采集从页面读出的原始卡片。
 * 与 CollectedItem 的区别：这里允许字段缺失，由适配器决定是否入库。
 */
export interface RawCardLike {
  sourceUrl: string;
  title?: string;
  /** 页面价格，单位「元」。 */
  priceYuan?: number;
  imageUrl?: string;
  publishTimeText?: string;
  location?: string;
  seller?: SellerProfile;
  missingFields: string[];
}

export interface IngestResult {
  productId: number;
  createdProduct: boolean;
  newPriceRecords: number;
  updatedPriceRecords: number;
}

export interface CollectionRun {
  id: number;
  sourceId: string;
  mode: 'status' | 'search' | 'detail' | 'history' | 'link';
  query: string;
  status: SourceStatusValue;
  itemCount: number;
  newProducts: number;
  newPriceRecords: number;
  message: string;
  createdAt: string;
}
