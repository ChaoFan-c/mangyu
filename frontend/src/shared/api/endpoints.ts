import type {
  CalculatorInput,
  CalculatorOutput,
  MarketPrice,
  MockPriceRecord,
  OpportunityScore,
  ProductType,
  RiskAssessmentOutput,
} from '@daoye/shared';
import { deleteJSON, getJSON, patchJSON, postJSON } from './client';

export interface ProductListResponse {
  items: ProductType[];
  total: number;
}

export interface PriceRecordsResponse {
  items: MockPriceRecord[];
  counts: Record<string, number>;
}

export interface OpportunityListResponse {
  items: OpportunityScore[];
  summary: {
    total: number;
    watch: number;
    caution: number;
    avoid: number;
    riskLevels: Record<string, number>;
  };
}

export type FavoriteStatus = 'watching' | 'bought' | 'sold' | 'skipped';

export interface FavoritePayload {
  id: number;
  productId: number | null;
  productName: string;
  category: string;
  brand: string;
  condition: string;
  targetBuyPrice: number;
  targetSellPrice: number;
  actualBuyPrice?: number;
  actualSellPrice?: number;
  notes: string;
  status: FavoriteStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SearchHistoryPayload {
  id: number;
  keyword: string;
  filters: Record<string, string>;
  resultCount: number;
  useCount: number;
  pinned: boolean;
  createdAt: string;
}

export interface ImportRecordPayload {
  id: number;
  filename: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  errors: string[];
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export interface HealthResponse {
  status: string;
  dataSource: string;
  counts: { products: number; priceRecords: number };
}

export type SourceStatusValue = 'ok' | 'unavailable' | 'error' | 'unknown';

export interface DataSourceSummary {
  id: string;
  name: string;
  mode: 'official_api' | 'user_link' | 'manual' | 'csv';
  legalNote: string;
  requiresCredential: boolean;
  capabilities: string[];
  fields: string[];
  limits: string[];
  enabled: boolean;
  status: SourceStatusValue;
  message: string;
  checkedAt?: string;
}

export interface LinkPreviewPayload {
  status: SourceStatusValue;
  message: string;
  blocked?: boolean;
  metadata?: {
    title?: string;
    description?: string;
    image?: string;
    brand?: string;
    model?: string;
    condition?: string;
    price?: number;
    currency?: string;
    sourceUrl: string;
  };
  externalId?: string;
  sourceRef?: string;
}

export interface CollectionRunPayload {
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

export interface BrowserLoginStatusPayload {
  mode: 'launch' | 'connect';
  launched: boolean;
  loggedIn: boolean;
  message: string;
  url?: string;
}

export interface BrowserSearchResultPayload {
  status: SourceStatusValue;
  message: string;
  cardsSeen: number;
  ingested: Array<{
    productId: number;
    name: string;
    price: number;
    sourceUrl: string;
    createdProduct: boolean;
    collectedAt: string;
    missingFields: string[];
    capturedFields: string[];
  }>;
  createdProducts: number;
  newPriceRecords: number;
  skipped: Array<{ sourceUrl: string; reason: string }>;
  ingestErrors: string[];
  loginRequired: boolean;
  riskBlocked: boolean;
  accessDenied: boolean;
  filtersRequested: string[];
  filtersApplied: string[];
  filterCandidates: string[];
  sellerDiagnostics?: { keywords: string[]; snippets: string[] };
  notes: string[];
  run: CollectionRunPayload;
}

export type MarketPriceScope = 'keyword' | 'model';

export interface SavedAnalysisPayload {
  id: number;
  productId: number | null;
  label: string;
  inputParams: Record<string, number | undefined>;
  scenarios: {
    conservative: { name: string; netProfit: number; roi: number };
    baseline: { name: string; netProfit: number; roi: number };
    optimistic: { name: string; netProfit: number; roi: number };
  };
  costCompleteness: number;
  missingFields: string[];
  warnings: string[];
  createdAt: string;
}

export function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  health: (signal?: AbortSignal) => getJSON<HealthResponse>('/health', signal),
  listDataSources: (signal?: AbortSignal) =>
    getJSON<{ items: DataSourceSummary[] }>('/data-sources', signal),
  checkDataSource: (sourceId: string) =>
    postJSON<{ source: DataSourceSummary; run: CollectionRunPayload }>(
      `/data-sources/${encodeURIComponent(sourceId)}/check`,
      {}
    ),
  listCollectionRuns: (limit = 20, signal?: AbortSignal) =>
    getJSON<{ items: CollectionRunPayload[] }>(
      `/collection-runs?limit=${limit}`,
      signal
    ),
  previewLink: (url: string) =>
    postJSON<{ preview: LinkPreviewPayload; run: CollectionRunPayload }>(
      '/collection/link/preview',
      { url }
    ),
  browserStatus: (signal?: AbortSignal) =>
    getJSON<{ status: BrowserLoginStatusPayload; notes: string[] }>(
      '/collection/browser/status',
      signal
    ),
  browserStart: (body: Record<string, unknown> = {}) =>
    postJSON<{ status: BrowserLoginStatusPayload; notes: string[] }>(
      '/collection/browser/start',
      body
    ),
  browserStop: () => postJSON<{ stopped: boolean }>('/collection/browser/stop', {}),
  browserSearch: (body: Record<string, unknown>) =>
    postJSON<BrowserSearchResultPayload>('/collection/browser/search', body),
  listMarketPrices: (signal?: AbortSignal) =>
    getJSON<{ items: MarketPrice[] }>('/market-prices', signal),
  saveMarketPrice: (body: {
    scope: MarketPriceScope;
    label: string;
    price: number;
    note?: string;
  }) => postJSON<{ item: MarketPrice }>('/market-prices', body),
  deleteMarketPrice: (id: number) =>
    deleteJSON<{ removed: boolean }>(`/market-prices/${id}`),
  importLink: (body: Record<string, unknown>) =>
    postJSON<{
      product: ProductType;
      ingest: {
        productId: number;
        createdProduct: boolean;
        newPriceRecords: number;
        updatedPriceRecords: number;
      };
      run: CollectionRunPayload;
      warnings: string[];
    }>('/collection/link/import', body),
  listRegions: (signal?: AbortSignal) => getJSON<{ items: string[] }>('/regions', signal),
  listProducts: (
    params: Record<string, string | number | undefined> = {},
    signal?: AbortSignal
  ) => getJSON<ProductListResponse>(`/products${toQuery(params)}`, signal),
  getProduct: (id: number, signal?: AbortSignal) =>
    getJSON<{ product: ProductType; marketPrice: number | null }>(
      `/products/${id}`,
      signal
    ),
  listPriceRecords: (productId: number, signal?: AbortSignal) =>
    getJSON<PriceRecordsResponse>(`/products/${productId}/price-records`, signal),
  listOpportunities: (
    params: Record<string, string | number | undefined> = {},
    signal?: AbortSignal
  ) => getJSON<OpportunityListResponse>(`/opportunities${toQuery(params)}`, signal),
  /** 入参以「元」为单位，与界面口径一致；后端负责换算成「分」。 */
  calculate: (input: Partial<CalculatorInput>) =>
    postJSON<{ unit: string; result: CalculatorOutput }>('/calculate', input),
  assessRisk: (productId: number) =>
    postJSON<{ productId: number; assessment: RiskAssessmentOutput }>('/risk-assessment', {
      productId,
    }),
  listFavorites: (signal?: AbortSignal) =>
    getJSON<{ items: FavoritePayload[] }>('/favorites', signal),
  createFavorite: (body: Record<string, unknown>) =>
    postJSON<{ favorite: FavoritePayload }>('/favorites', body),
  updateFavorite: (id: number, body: Record<string, unknown>) =>
    patchJSON<{ favorite: FavoritePayload }>(`/favorites/${id}`, body),
  deleteFavorite: (id: number) => deleteJSON<{ removed: boolean }>(`/favorites/${id}`),
  listSearchHistory: (limit = 20, signal?: AbortSignal) =>
    getJSON<{ items: SearchHistoryPayload[] }>(`/search-history?limit=${limit}`, signal),
  listFrequentSearches: (limit = 6, signal?: AbortSignal) =>
    getJSON<{ items: SearchHistoryPayload[] }>(`/search-history/frequent?limit=${limit}`, signal),
  pinSearch: (id: number, pinned: boolean) =>
    patchJSON<{ item: SearchHistoryPayload }>(`/search-history/${id}`, { pinned }),
  deleteSearch: (id: number) => deleteJSON<{ removed: boolean }>(`/search-history/${id}`),
  recordSearch: (keyword: string, filters: Record<string, string>, resultCount: number) =>
    postJSON<{ item: SearchHistoryPayload }>('/search-history', {
      keyword,
      filters,
      resultCount,
    }),
  clearSearchHistory: () => deleteJSON<{ removed: number }>('/search-history'),
  listImports: (signal?: AbortSignal) =>
    getJSON<{ items: ImportRecordPayload[] }>('/imports', signal),
  clearImports: () => deleteJSON<{ removed: number }>('/imports'),
  importRows: (
    filename: string,
    rows: Array<Record<string, unknown>>,
    meta: { totalRows: number; clientErrors: string[] }
  ) =>
    postJSON<{
      record: ImportRecordPayload;
      successRows: number;
      failedRows: number;
      errors: string[];
    }>('/imports', { filename, rows, totalRows: meta.totalRows, clientErrors: meta.clientErrors }),
  createProduct: (body: Record<string, unknown>) =>
    postJSON<{ product: ProductType }>('/products', body),
  listAnalyses: (productId?: number, signal?: AbortSignal) =>
    getJSON<{ items: SavedAnalysisPayload[] }>(
      `/analyses${productId === undefined ? '' : `?productId=${productId}`}`,
      signal
    ),
  saveAnalysis: (body: { productId?: number; label?: string; input: Record<string, unknown> }) =>
    postJSON<{ analysis: SavedAnalysisPayload }>('/analyses', body),
  deleteAnalysis: (id: number) => deleteJSON<{ removed: boolean }>(`/analyses/${id}`),
};
