import type {
  AdapterResult,
  CollectionAdapter,
  HistoryResult,
  SourceStatus,
} from '../types.ts';

const DESCRIPTOR = {
  id: 'manual',
  name: '用户手动录入',
  mode: 'manual' as const,
  legalNote: '用户在界面中主动填写的数据，价格类型固定标记为手动录入。',
  requiresCredential: false,
  capabilities: ['status'] as const,
  fields: ['名称', '品类', '品牌', '型号', '成色', '买入价'],
  limits: ['单条录入', '不抓取外部页面'],
};

export class ManualAdapter implements CollectionAdapter {
  readonly descriptor = {
    ...DESCRIPTOR,
    capabilities: [...DESCRIPTOR.capabilities],
  };

  async checkStatus(): Promise<SourceStatus> {
    return {
      status: 'ok',
      message: '手动录入入口已就绪，数据将标记为“手动录入”。',
      checkedAt: new Date().toISOString(),
    };
  }

  async searchProducts(): Promise<AdapterResult> {
    return {
      status: 'unavailable',
      message: '手动录入不支持关键词搜索，请在数据录入页或收藏页填写商品。',
      items: [],
    };
  }

  async getProductDetail(): Promise<AdapterResult> {
    return {
      status: 'unavailable',
      message: '手动录入没有外部详情接口。',
      items: [],
    };
  }

  async getPriceHistory(): Promise<HistoryResult> {
    return {
      status: 'unavailable',
      message: '手动录入不会提供平台价格历史，只保留用户提交的时间点。',
      records: [],
    };
  }
}
