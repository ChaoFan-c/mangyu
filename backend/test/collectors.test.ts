import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db/index.ts';
import { seedDatabase } from '../src/db/seed.ts';
import {
  UserLinkAdapter,
  linkExternalId,
  parseHtmlMetadata,
} from '../src/collectors/adapters/publicLink.ts';
import { createDefaultRegistry } from '../src/collectors/registry.ts';
import { ingestCollectedItem } from '../src/collectors/ingest.ts';
import { rawCardToCollectedItem } from '../src/collectors/adapters/browserAutomation.ts';
import { detectAccessDeniedText } from '../src/collectors/browserSession.ts';
import { decideWaitOutcome } from '../src/collectors/browserSession.ts';
import {
  countPriceRecords,
  listPriceRecordsBySource,
} from '../src/repositories/priceRecords.ts';
import {
  listCollectionRuns,
  recordCollectionRun,
} from '../src/repositories/collectionRuns.ts';
import {
  getSourceStatus,
  saveSourceStatus,
} from '../src/repositories/sourceStatus.ts';
import type { CollectedItem } from '../src/collectors/types.ts';

function freshDb() {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  return db;
}

const PUBLIC_HOST = [{ address: '93.184.216.34', family: 4 }];

function htmlResponse(
  body: string,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });
}

function makeAdapter(
  fetchImpl: typeof fetch,
  options: { requestTimeoutMs?: number; robotsTimeoutMs?: number } = {}
): UserLinkAdapter {
  return new UserLinkAdapter({
    fetchImpl,
    resolveHost: async () => PUBLIC_HOST,
    ...options,
  });
}

describe('采集适配器注册表与公开链接安全边界', () => {
  it('默认注册表只启用手动、CSV 和用户链接三个适配器', () => {
    const registry = createDefaultRegistry();
    assert.deepEqual(
      registry.listAdapters().map((adapter) => adapter.descriptor.id),
      ['manual', 'csv', 'user-link', 'xianyu-browser']
    );
    assert.deepEqual(
      registry.listBlockedSources().map((source) => source.id),
      ['xianyu-live']
    );
    assert.equal(registry.getAdapter('xianyu-live'), undefined);
  });

  it('公开链接适配器拒绝非 HTTP(S) 和带账号密码的链接', async () => {
    const adapter = makeAdapter(async () => {
      throw new Error('不应访问网络');
    });

    const ftp = await adapter.fetchMetadata('ftp://example.com/item');
    assert.equal(ftp.status, 'unavailable');
    assert.equal(ftp.blocked, true);
    assert.match(ftp.message, /http|https/i);

    const withCredential = await adapter.fetchMetadata('https://user:pass@example.com/item');
    assert.equal(withCredential.status, 'unavailable');
    assert.equal(withCredential.blocked, true);
    assert.match(withCredential.message, /账号|密码/);
  });

  it('公开链接适配器拒绝本机、内网和 IPv4 映射地址', async () => {
    let fetchCalls = 0;
    const adapter = makeAdapter(async () => {
      fetchCalls += 1;
      return htmlResponse('<title>不应读取</title>');
    });

    for (const raw of [
      'http://127.0.0.1/item',
      'http://localhost/item',
      'http://10.0.0.8/item',
      'http://[::1]/item',
      'http://[::ffff:127.0.0.1]/item',
    ]) {
      const result = await adapter.fetchMetadata(raw);
      assert.equal(result.status, 'unavailable', raw);
      assert.equal(result.blocked, true, raw);
      assert.match(result.message, /本机|内网|保留地址/);
    }
    assert.equal(fetchCalls, 0, '被拒绝的地址不应发出 HTTP 请求');
  });

  it('robots.txt 禁止的路径不会继续请求商品页', async () => {
    let pageFetches = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(input.toString());
      if (url.pathname === '/robots.txt') {
        return new Response('User-agent: *\nDisallow: /blocked\n', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      pageFetches += 1;
      return htmlResponse('<title>不应读取</title>');
    };

    const result = await makeAdapter(fetchImpl).fetchMetadata(
      'https://example.com/blocked/item'
    );
    assert.equal(result.status, 'unavailable');
    assert.equal(result.blocked, true);
    assert.match(result.message, /robots\.txt/);
    assert.equal(pageFetches, 0);
  });

  it('401、403、429 会停止读取并标记为授权或限流边界', async () => {
    for (const status of [401, 403, 429]) {
      const fetchImpl: typeof fetch = async (input) => {
        const url = new URL(input.toString());
        if (url.pathname === '/robots.txt') {
          return new Response('User-agent: *\nAllow: /\n');
        }
        return htmlResponse('blocked', status);
      };
      const result = await makeAdapter(fetchImpl).fetchMetadata(
        'https://example.com/item'
      );
      assert.equal(result.status, 'unavailable', String(status));
      assert.equal(result.blocked, true, String(status));
      assert.match(result.message, new RegExp(String(status)));
    }
  });

  it('读取超时会返回失败状态而不是假装成功', async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(input.toString());
      if (url.pathname === '/robots.txt') {
        return new Response('User-agent: *\nAllow: /\n');
      }
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    };
    const result = await makeAdapter(fetchImpl, {
      requestTimeoutMs: 5,
    }).fetchMetadata('https://example.com/slow');
    assert.equal(result.status, 'unavailable');
    assert.equal(result.blocked, false);
    assert.match(result.message, /abort/i);
  });

  it('重定向到内网会被拒绝', async () => {
    let publicFetches = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(input.toString());
      if (url.pathname === '/robots.txt') {
        return new Response('User-agent: *\nAllow: /\n');
      }
      publicFetches += 1;
      return new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private' },
      });
    };
    const result = await makeAdapter(fetchImpl).fetchMetadata(
      'https://example.com/redirect'
    );
    assert.equal(result.status, 'unavailable');
    assert.equal(result.blocked, true);
    assert.match(result.message, /本机|内网/);
    assert.equal(publicFetches, 1);
  });
});

describe('公开网页元数据解析与价格语义', () => {
  it('解析 Open Graph、JSON-LD 字段并把页面价格换算为分', () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>备用标题</title>
          <meta property="og:title" content="Canon RF 24-70mm F2.8" />
          <meta property="og:description" content="页面描述" />
          <meta property="og:image" content="https://cdn.example.com/item.jpg" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Canon RF 24-70mm F2.8",
              "brand": { "name": "Canon" },
              "model": "RF24-70F28",
              "offers": {
                "@type": "Offer",
                "price": "12888.50",
                "priceCurrency": "CNY"
              }
            }
          </script>
        </head>
      </html>
    `;
    const metadata = parseHtmlMetadata(html, 'https://shop.example/item/1');
    assert.equal(metadata.title, 'Canon RF 24-70mm F2.8');
    assert.equal(metadata.description, '页面描述');
    assert.equal(metadata.brand, 'Canon');
    assert.equal(metadata.model, 'RF24-70F28');
    assert.equal(metadata.price, 1_288_850);
    assert.equal(metadata.currency, 'CNY');
    assert.equal(metadata.sourceUrl, 'https://shop.example/item/1');
  });

  it('页面价格被固定映射为 listing，不生成 sold', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(input.toString());
      if (url.pathname === '/robots.txt') {
        return new Response('User-agent: *\nAllow: /\n');
      }
      return htmlResponse(`
        <meta property="og:title" content="测试相机" />
        <meta property="product:price:amount" content="4999" />
        <meta property="product:price:currency" content="CNY" />
      `);
    };
    const result = await makeAdapter(fetchImpl).getProductDetail(
      'https://example.com/item/1'
    );
    assert.equal(result.status, 'ok');
    assert.equal(result.items[0].prices.length, 1);
    assert.equal(result.items[0].prices[0].priceType, 'listing');
    assert.equal(
      result.items[0].prices.some((price) => price.priceType === 'sold'),
      false
    );
  });

  it('页面没有价格时不臆造价格', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(input.toString());
      if (url.pathname === '/robots.txt') {
        return new Response('User-agent: *\nAllow: /\n');
      }
      return htmlResponse('<title>只有标题</title>');
    };
    const result = await makeAdapter(fetchImpl).getProductDetail(
      'https://example.com/item/2'
    );
    assert.equal(result.items[0].prices.length, 0);
  });
});

describe('采集入库去重、价格历史与流水', () => {
  let db: ReturnType<typeof freshDb>;

  before(() => {
    db = freshDb();
  });

  after(() => {
    db.close();
  });

  function item(price: number, collectedAt: string): CollectedItem {
    return {
      sourceId: 'user-link',
      externalId: linkExternalId('https://example.com/item/collector-test'),
      sourceRef: 'https://example.com/item/collector-test',
      sourceUrl: 'https://example.com/item/collector-test',
      name: '采集测试商品',
      category: '镜头',
      brand: 'Canon',
      model: 'RF24-70F28',
      condition: '95new',
      prices: [
        {
          platform: '公开网页',
          priceType: 'listing',
          price,
          currency: 'CNY',
          collectedAt,
          sourceUrl: 'https://example.com/item/collector-test',
          confidence: 0.55,
          notes: '页面挂牌价候选',
        },
      ],
      dataSource: '用户提供公开链接（测试）',
      warnings: ['需要回到原页面核对'],
    };
  }

  it('同一来源同一商品重复采集会更新观测时间而不是重复建商品', () => {
    const beforeCount = countPriceRecords(db);
    const first = ingestCollectedItem({
      db,
      sourceId: 'user-link',
      item: item(9_900_00, '2026-10-15T01:00:00.000Z'),
    });
    assert.equal(first.createdProduct, true);
    assert.equal(first.newPriceRecords, 1);

    const second = ingestCollectedItem({
      db,
      sourceId: 'user-link',
      item: item(9_900_00, '2026-10-15T02:00:00.000Z'),
    });
    assert.equal(second.createdProduct, false);
    assert.equal(second.newPriceRecords, 0);
    assert.equal(second.updatedPriceRecords, 1);
    assert.equal(countPriceRecords(db), beforeCount + 1);

    const records = listPriceRecordsBySource(
      db,
      'user-link',
      linkExternalId('https://example.com/item/collector-test')
    );
    assert.equal(records.length, 1);
    assert.equal(records[0].collected_at, '2026-10-15T02:00:00.000Z');
  });

  it('价格上涨会追加历史记录而不是覆盖旧观测', () => {
    const before = listPriceRecordsBySource(
      db,
      'user-link',
      linkExternalId('https://example.com/item/collector-test')
    ).length;
    const result = ingestCollectedItem({
      db,
      sourceId: 'user-link',
      item: item(10_100_00, '2026-10-16T01:00:00.000Z'),
    });
    assert.equal(result.createdProduct, false);
    assert.equal(result.newPriceRecords, 1);
    assert.equal(
      listPriceRecordsBySource(
        db,
        'user-link',
        linkExternalId('https://example.com/item/collector-test')
      ).length,
      before + 1
    );
  });

  it('数据源状态与采集流水会写入 SQLite', () => {
    saveSourceStatus(db, 'user-link', {
      status: 'ok',
      message: '检查通过',
      checkedAt: '2026-10-15T03:00:00.000Z',
    });
    assert.equal(getSourceStatus(db, 'user-link')?.message, '检查通过');

    recordCollectionRun(db, {
      sourceId: 'user-link',
      mode: 'detail',
      query: 'https://example.com/item/collector-test',
      status: 'ok',
      itemCount: 1,
      newProducts: 0,
      newPriceRecords: 1,
      message: '测试流水',
    });
    const runs = listCollectionRuns(db, 10);
    assert.equal(runs[0].sourceId, 'user-link');
    assert.equal(runs[0].message, '测试流水');
  });
});

describe('本机浏览器采集的字段映射与入库', () => {
  it('把页面「元」价格换算为「分」，并把价格类型固定为 listing', () => {
    const item = rawCardToCollectedItem(
      {
        sourceUrl: 'https://www.goofish.com/item?id=1001',
        title: 'iPhone 15 256GB 国行 95新',
        priceYuan: 4299,
        imageUrl: 'https://img.alicdn.com/a.jpg',
        publishTimeText: '3小时前',
        missingFields: [],
      },
      'iPhone 15 256GB'
    );

    assert.equal(item.sourceId, 'xianyu-browser');
    assert.equal(item.prices.length, 1);
    assert.equal(item.prices[0].priceType, 'listing');
    assert.equal(item.prices[0].price, 429_900);
    assert.equal(item.prices[0].currency, 'CNY');
    assert.equal(item.condition, '95new');
    assert.equal(
      item.prices.some((price) => price.priceType === 'sold'),
      false
    );
    assert.deepEqual(item.images, ['https://img.alicdn.com/a.jpg']);
  });

  it('字段缺失时不臆造价格，只记录到 warning', () => {
    const item = rawCardToCollectedItem(
      {
        sourceUrl: 'https://www.goofish.com/item?id=1002',
        title: undefined,
        priceYuan: undefined,
        missingFields: ['标题', '价格'],
      },
      '相机'
    );
    assert.equal(item.prices.length, 0);
    assert.equal(item.condition, 'unknown');
    assert.ok(item.warnings?.some((warning) => warning.includes('标题')));
  });

  it('同一链接生成的 externalId 稳定，可用于去重', () => {
    const first = rawCardToCollectedItem(
      {
        sourceUrl: 'https://www.goofish.com/item?id=1003',
        title: 'Sony A7M4',
        priceYuan: 12800,
        missingFields: [],
      },
      'Sony A7M4'
    );
    const second = rawCardToCollectedItem(
      {
        sourceUrl: 'https://www.goofish.com/item?id=1003',
        title: 'Sony A7M4 机身',
        priceYuan: 12600,
        missingFields: [],
      },
      'Sony A7M4'
    );
    assert.equal(first.externalId, second.externalId);
  });

  it('浏览器采集结果可以入库，重复采集只更新观测而不重复建商品', () => {
    const db = freshDb();
    try {
      const card = {
        sourceUrl: 'https://www.goofish.com/item?id=2001',
        title: 'Canon R6 机身',
        priceYuan: 9800,
        missingFields: [],
      };

      const before = countPriceRecords(db);
      const first = ingestCollectedItem({
        db,
        sourceId: 'xianyu-browser',
        item: rawCardToCollectedItem(card, 'Canon R6'),
        category: '相机机身',
      });
      assert.equal(first.createdProduct, true);
      assert.equal(first.newPriceRecords, 1);

      const second = ingestCollectedItem({
        db,
        sourceId: 'xianyu-browser',
        item: rawCardToCollectedItem(card, 'Canon R6'),
        category: '相机机身',
      });
      assert.equal(second.createdProduct, false);
      assert.equal(second.updatedPriceRecords, 1);
      assert.equal(countPriceRecords(db), before + 1);

      // 价格变化时追加新的观测记录，保留历史。
      const third = ingestCollectedItem({
        db,
        sourceId: 'xianyu-browser',
        item: rawCardToCollectedItem({ ...card, priceYuan: 9400 }, 'Canon R6'),
        category: '相机机身',
      });
      assert.equal(third.newPriceRecords, 1);
      assert.equal(countPriceRecords(db), before + 2);
    } finally {
      db.close();
    }
  });
});

describe('站点拒绝页识别', () => {
  it('识别闲鱼「非法访问 / 请使用正常浏览器访问」拒绝页', () => {
    // 文案取自 2026-10-15 自动化浏览器访问真实搜索页时的实测返回。
    const text = '非法访问\n为了保障您的体验，请使用正常浏览器访问闲鱼~\n关闭\n反馈问题';
    const hit = detectAccessDeniedText(text);
    assert.ok(hit, '应当判定为站点拒绝页');
    assert.match(hit, /非法访问/);
  });

  it('正常商品结果文本不会被误判为拒绝页', () => {
    assert.equal(
      detectAccessDeniedText('iPhone 15 256GB 国行 95新 ¥4299 3小时前 北京'),
      null
    );
    assert.equal(detectAccessDeniedText(''), null);
  });

  it('等待渲染的判定：命中卡片即找到，命中拦截即停止，否则继续等', () => {
    assert.equal(decideWaitOutcome({ cardCount: 3, accessDenied: false, risk: false }), 'found');
    assert.equal(decideWaitOutcome({ cardCount: 0, accessDenied: true, risk: false }), 'stop');
    assert.equal(decideWaitOutcome({ cardCount: 0, accessDenied: false, risk: true }), 'stop');
    assert.equal(decideWaitOutcome({ cardCount: 0, accessDenied: false, risk: false }), 'wait');
  });
});
