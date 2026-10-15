import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { CalculatorInput } from '@daoye/shared';
import { api, type FavoritePayload } from '../api/endpoints';

export const queryKeys = {
  health: ['health'] as const,
  regions: ['regions'] as const,
  products: (params: Record<string, unknown>) => ['products', params] as const,
  product: (id: number) => ['product', id] as const,
  priceRecords: (id: number) => ['price-records', id] as const,
  risk: (id: number) => ['risk-assessment', id] as const,
  opportunities: (params: Record<string, unknown>) => ['opportunities', params] as const,
  favorites: ['favorites'] as const,
  searchHistory: ['search-history'] as const,
  frequentSearches: ['search-history', 'frequent'] as const,
  imports: ['imports'] as const,
  dataSources: ['data-sources'] as const,
  browserStatus: ['browser-status'] as const,
  marketPrices: ['market-prices'] as const,
  collectionRuns: (limit: number) => ['collection-runs', limit] as const,
  analyses: (productId?: number) => ['analyses', productId ?? 'all'] as const,
};

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => api.health(signal),
    staleTime: 60_000,
  });
}

export function useDataSources() {
  return useQuery({
    queryKey: queryKeys.dataSources,
    queryFn: ({ signal }) => api.listDataSources(signal),
  });
}

export function useCheckDataSource() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => api.checkDataSource(sourceId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.dataSources });
      void client.invalidateQueries({ queryKey: ['collection-runs'] });
    },
  });
}

export function useCollectionRuns(limit = 20) {
  return useQuery({
    queryKey: queryKeys.collectionRuns(limit),
    queryFn: ({ signal }) => api.listCollectionRuns(limit, signal),
  });
}

export function useBrowserStatus(enabled = true) {
  return useQuery({
    queryKey: queryKeys.browserStatus,
    queryFn: ({ signal }) => api.browserStatus(signal),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}

export function useBrowserStart() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown> = {}) => api.browserStart(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.browserStatus });
      void client.invalidateQueries({ queryKey: queryKeys.dataSources });
    },
  });
}

export function useBrowserStop() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.browserStop(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.browserStatus });
      void client.invalidateQueries({ queryKey: queryKeys.dataSources });
    },
  });
}

export function useBrowserSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.browserSearch(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['products'] });
      void client.invalidateQueries({ queryKey: ['opportunities'] });
      void client.invalidateQueries({ queryKey: ['collection-runs'] });
      void client.invalidateQueries({ queryKey: queryKeys.browserStatus });
    },
  });
}

/** 行情价由用户手动维护，采集程序不会写入或覆盖。 */
export function useMarketPrices() {
  return useQuery({
    queryKey: queryKeys.marketPrices,
    queryFn: ({ signal }) => api.listMarketPrices(signal),
  });
}

export function useSaveMarketPrice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { scope: 'keyword' | 'model'; label: string; price: number; note?: string }) =>
      api.saveMarketPrice(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.marketPrices });
      // 行情价会改变利润与机会评分，相关列表需要重新拉取。
      void client.invalidateQueries({ queryKey: ['opportunities'] });
      void client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteMarketPrice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteMarketPrice(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.marketPrices });
      void client.invalidateQueries({ queryKey: ['opportunities'] });
      void client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

/** 搜索栏「地区」筛选的候选项，来自价格记录中真实出现过的所在地。 */
export function useRegions() {
  return useQuery({
    queryKey: queryKeys.regions,
    queryFn: ({ signal }) => api.listRegions(signal),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProducts(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: queryKeys.products(params),
    queryFn: ({ signal }) => api.listProducts(params, signal),
  });
}

export function useProduct(id: number) {
  return useQuery({
    queryKey: queryKeys.product(id),
    queryFn: ({ signal }) => api.getProduct(id, signal),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function usePriceRecords(id: number) {
  return useQuery({
    queryKey: queryKeys.priceRecords(id),
    queryFn: ({ signal }) => api.listPriceRecords(id, signal),
    enabled: Number.isFinite(id) && id > 0,
  });
}

/** 风险评估由服务端计算，保证与后端结论一致。 */
export function useRiskAssessment(id: number) {
  return useQuery({
    queryKey: queryKeys.risk(id),
    queryFn: () => api.assessRisk(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useOpportunities(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: queryKeys.opportunities(params),
    queryFn: ({ signal }) => api.listOpportunities(params, signal),
  });
}

export function useFavorites() {
  return useQuery({
    queryKey: queryKeys.favorites,
    queryFn: ({ signal }) => api.listFavorites(signal),
  });
}

export function useCreateFavorite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.createFavorite(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.favorites });
    },
  });
}

export function useUpdateFavorite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) =>
      api.updateFavorite(id, patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.favorites });
    },
  });
}

export function useDeleteFavorite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteFavorite(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.favorites });
    },
  });
}

export function useSearchHistory(limit = 20) {
  return useQuery({
    queryKey: [...queryKeys.searchHistory, limit],
    queryFn: ({ signal }) => api.listSearchHistory(limit, signal),
  });
}

export function useRecordSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      keyword,
      filters,
      resultCount,
    }: {
      keyword: string;
      filters: Record<string, string>;
      resultCount: number;
    }) => api.recordSearch(keyword, filters, resultCount),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.searchHistory });
    },
  });
}

export function useClearSearchHistory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearSearchHistory(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.searchHistory });
    },
  });
}

/** 常用搜索：置顶优先，其次按使用次数。 */
export function useFrequentSearches(limit = 6) {
  return useQuery({
    queryKey: [...queryKeys.frequentSearches, limit],
    queryFn: ({ signal }) => api.listFrequentSearches(limit, signal),
  });
}

export function usePinSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
      api.pinSearch(id, pinned),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['search-history'] });
    },
  });
}

export function useDeleteSearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteSearch(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['search-history'] });
    },
  });
}

export function useImports() {
  return useQuery({
    queryKey: queryKeys.imports,
    queryFn: ({ signal }) => api.listImports(signal),
  });
}

export function useAnalyses(productId?: number) {
  return useQuery({
    queryKey: queryKeys.analyses(productId),
    queryFn: ({ signal }) => api.listAnalyses(productId, signal),
    enabled: productId === undefined || (Number.isFinite(productId) && productId > 0),
  });
}

export function useSaveAnalysis() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { productId?: number; label?: string; input: Record<string, unknown> }) =>
      api.saveAnalysis(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['analyses'] });
    },
  });
}

export function useDeleteAnalysis() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteAnalysis(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['analyses'] });
    },
  });
}

/**
 * 利润计算在服务端复核。
 * 前端不再自行计算作为唯一结果，避免两套算法给出不同答案。
 */
export function useCalculate() {
  return useMutation({
    mutationFn: (input: Partial<CalculatorInput>) => api.calculate(input),
  });
}

export function useFavoritesByProductId(productId: number) {
  const query = useFavorites();
  const match: FavoritePayload | undefined = query.data?.items.find(
    (item) => item.productId === productId
  );
  return { ...query, match };
}
