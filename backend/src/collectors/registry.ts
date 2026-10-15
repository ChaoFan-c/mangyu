import { CsvAdapter } from './adapters/csv.ts';
import { ManualAdapter } from './adapters/manual.ts';
import { BrowserAutomationAdapter } from './adapters/browserAutomation.ts';
import {
  UserLinkAdapter,
  linkExternalId,
} from './adapters/publicLink.ts';
import type {
  CollectionAdapter,
  LinkFetchResult,
  SourceDescriptor,
  SourceStatus,
} from './types.ts';

export interface SourceSummary extends SourceDescriptor {
  enabled: boolean;
  status: SourceStatus['status'];
  message: string;
  checkedAt?: string;
}

export interface LinkPreviewResult extends LinkFetchResult {
  externalId?: string;
  sourceRef?: string;
}

const XIANYU_LIVE: SourceDescriptor = {
  id: 'xianyu-live',
  name: '闲鱼实时采集（未接入）',
  mode: 'official_api',
  legalNote:
    '未找到可确认的官方授权接口或允许自动化采集的明确条款，因此在获得平台书面授权前保持禁用。',
  requiresCredential: true,
  capabilities: [],
  fields: [],
  limits: [
    '不使用账号、Cookie 或浏览器登录态',
    '不调用 mtop 或其他内部接口',
    '不绕过验证码、人机识别或访问限制',
  ],
};

export class CollectorRegistry {
  private readonly adapters = new Map<string, CollectionAdapter>();
  private readonly linkAdapter: UserLinkAdapter;

  constructor(adapters: CollectionAdapter[]) {
    const linkAdapter = adapters.find(
      (adapter): adapter is UserLinkAdapter => adapter instanceof UserLinkAdapter
    );
    if (!linkAdapter) {
      throw new Error('采集注册表缺少用户链接适配器');
    }
    this.linkAdapter = linkAdapter;
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.descriptor.id)) {
        throw new Error(`采集适配器 id 重复：${adapter.descriptor.id}`);
      }
      this.adapters.set(adapter.descriptor.id, adapter);
    }
  }

  getAdapter(sourceId: string): CollectionAdapter | undefined {
    return this.adapters.get(sourceId);
  }

  listAdapters(): CollectionAdapter[] {
    return [...this.adapters.values()];
  }

  listBlockedSources(): SourceDescriptor[] {
    return [{ ...XIANYU_LIVE }];
  }

  async previewLink(url: string): Promise<LinkPreviewResult> {
    const result = await this.linkAdapter.fetchMetadata(url);
    if (!result.metadata) {
      return { ...result };
    }
    return {
      ...result,
      externalId: linkExternalId(result.metadata.sourceUrl),
      sourceRef: result.metadata.sourceUrl,
    };
  }
}

export function createDefaultRegistry(): CollectorRegistry {
  return new CollectorRegistry([
    new ManualAdapter(),
    new CsvAdapter(),
    new UserLinkAdapter(),
    new BrowserAutomationAdapter(),
  ]);
}
