import type {
  AdapterResult,
  CollectionAdapter,
  HistoryResult,
  SourceStatus,
} from '../types.ts';

const DESCRIPTOR = {
  id: 'csv',
  name: 'CSV 批量导入',
  mode: 'csv' as const,
  legalNote: '由用户自行整理并导入的文件数据，价格类型固定标记为手动录入。',
  requiresCredential: false,
  capabilities: ['status'] as const,
  fields: ['商品名称', '品类', '品牌', '型号', '成色', '买入价'],
  limits: ['文件由用户提供', '不会把导入价标记为挂牌价或成交价'],
};

export class CsvAdapter implements CollectionAdapter {
  readonly descriptor = {
    ...DESCRIPTOR,
    capabilities: [...DESCRIPTOR.capabilities],
  };

  async checkStatus(): Promise<SourceStatus> {
    return {
      status: 'ok',
      message: 'CSV 导入入口已就绪，数据将标记为“手动录入”。',
      checkedAt: new Date().toISOString(),
    };
  }

  async searchProducts(): Promise<AdapterResult> {
    return {
      status: 'unavailable',
      message: 'CSV 导入不支持远端关键词搜索。',
      items: [],
    };
  }

  async getProductDetail(): Promise<AdapterResult> {
    return {
      status: 'unavailable',
      message: 'CSV 导入没有外部商品详情接口。',
      items: [],
    };
  }

  async getPriceHistory(): Promise<HistoryResult> {
    return {
      status: 'unavailable',
      message: 'CSV 导入没有平台价格历史。',
      records: [],
    };
  }
}
