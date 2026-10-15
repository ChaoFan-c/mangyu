import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db/index.ts';
import { seedDatabase } from '../src/db/seed.ts';
import {
  countProducts,
  createProduct,
  getProductById,
  listProducts,
} from '../src/repositories/products.ts';
import { countPriceRecords, listPriceRecords } from '../src/repositories/priceRecords.ts';
import {
  createFavorite,
  deleteFavorite,
  listFavorites,
  updateFavorite,
} from '../src/repositories/favorites.ts';
import {
  clearSearchHistory,
  deleteSearchHistory,
  listFrequentSearches,
  listSearchHistory,
  recordSearch,
  setPinned,
} from '../src/repositories/searchHistory.ts';
import { listImports, recordImport } from '../src/repositories/imports.ts';
import { listRegions, listPriceRecordsByProduct } from '../src/repositories/priceRecords.ts';
import { migrate } from '../src/db/index.ts';

/**
 * 每个用例组用独立的内存库，避免相互污染。
 * node:sqlite 的技术是同步 API，测试不需要并发控制。
 */
function freshDb() {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  return db;
}

describe('数据库与仓储层', () => {
  let db: ReturnType<typeof freshDb>;

  before(() => {
    db = freshDb();
  });

  after(() => {
    db.close();
  });

  it('灌入演示数据后商品与价格记录数量正确', () => {
    assert.equal(countProducts(db, { limit: 1, offset: 0 }), 35);
    assert.equal(countPriceRecords(db), 279);
  });

  it('重复灌入演示数据不会产生重复行', () => {
    seedDatabase(db);
    assert.equal(countProducts(db, { limit: 1, offset: 0 }), 35);
    assert.equal(countPriceRecords(db), 279);
  });

  it('关键词语义搜索匹配名称、品牌与型号', () => {
    const byBrand = listProducts(db, { keyword: 'Canon', limit: 50, offset: 0 });
    assert.ok(byBrand.total > 0);
    assert.ok(byBrand.items.every((item) => item.name.includes('Canon') || item.brand === 'Canon'));

    const byModel = listProducts(db, { keyword: 'A7R5', limit: 50, offset: 0 });
    assert.ok(byModel.total > 0);
  });

  it('价格区间按「元」换算为「分」后比较', () => {
    const result = listProducts(db, {
      minPrice: 20000,
      maxPrice: 30000,
      limit: 50,
      offset: 0,
    });
    assert.ok(result.total > 0);
    for (const item of result.items) {
      assert.ok(item.price >= 2_000_000 && item.price <= 3_000_000);
    }
  });

  it('分页参数生效且 total 与筛选条件一致', () => {
    const page = listProducts(db, { limit: 10, offset: 0 });
    assert.equal(page.items.length, 10);
    assert.equal(page.total, 35);

    const second = listProducts(db, { limit: 10, offset: 10 });
    assert.equal(second.items.length, 10);
    assert.notEqual(second.items[0].id, page.items[0].id);
  });

  it('不存在的商品返回 undefined', () => {
    assert.equal(getProductById(db, 999999), undefined);
  });

  it('每个商品的价格记录都带类型、采集时间与来源说明', () => {
    const records = listPriceRecords(db, 1);
    assert.ok(records.length > 0);
    for (const record of records) {
      assert.ok(record.platform.length > 0);
      assert.ok(!Number.isNaN(new Date(record.collected_at).getTime()));
      assert.ok(record.data_source.length > 0);
    }
  });

  it('手动录入的商品价格类型固定为 manual', () => {
    const id = createProduct(db, {
      name: '测试手动录入商品',
      category: '镜头',
      condition: '95new',
      price: 500000,
      priceType: 'manual',
      origin: 'manual',
    });
    const created = getProductById(db, id);
    assert.equal(created?.price_type, 'manual');
    assert.equal(created?.category, '镜头');
  });

  it('按地区筛选会收窄结果，而不是匹配全部商品', () => {
    const all = listProducts(db, { limit: 500, offset: 0 }).total;
    const regions = listRegions(db);
    assert.ok(regions.length > 1);

    const counts = regions.map(
      (region) => listProducts(db, { region, limit: 500, offset: 0 }).total
    );
    assert.ok(counts.every((count) => count > 0), '每个地区都应至少命中一件商品');
    assert.ok(
      counts.some((count) => count < all),
      '至少有一个地区的结果少于全集，否则筛选没有区分度'
    );
  });

  it('地区筛选与其它条件可以叠加', () => {
    const region = listRegions(db)[0];
    const combined = listProducts(db, {
      region,
      categoryId: 1,
      limit: 500,
      offset: 0,
    });
    for (const item of combined.items) {
      assert.equal(item.category, '相机机身');
      const records = listPriceRecordsByProduct(db, [item.id]).get(item.id) ?? [];
      assert.ok(records.some((record) => record.location === region));
    }
  });

  it('迁移可以重复执行（列迁移幂等）', () => {
    // 该套件前面的用例已经新增过商品，所以这里比较「迁移前后数量不变」，
    // 而不是写死某个数字。
    const before = countProducts(db, { limit: 1, offset: 0 });
    assert.doesNotThrow(() => {
      migrate(db);
      migrate(db);
    });
    assert.equal(countProducts(db, { limit: 1, offset: 0 }), before);
  });
});

describe('收藏与交易跟踪', () => {
  let db: ReturnType<typeof freshDb>;

  before(() => {
    db = freshDb();
  });

  after(() => {
    db.close();
  });

  it('创建后可以读到，更新实际成交价与状态后仍可读到', () => {
    const created = createFavorite(db, {
      productId: 1,
      productName: 'Sony A7R5 机身',
      category: '相机机身',
      brand: 'Sony',
      condition: '99new',
      targetBuyPrice: 2100000,
      targetSellPrice: 2300000,
      status: 'watching',
    });
    assert.equal(listFavorites(db).length, 1);

    const updated = updateFavorite(db, created.id, {
      actualBuyPrice: 2050000,
      actualSellPrice: 2320000,
      status: 'sold',
    });
    assert.equal(updated?.actualBuyPrice, 2050000);
    assert.equal(updated?.actualSellPrice, 2320000);
    assert.equal(updated?.status, 'sold');
  });

  it('未填写实际成交价时不会凭空补 0', () => {
    const created = createFavorite(db, {
      productName: '未成交商品',
      category: '手机',
      condition: '99new',
      targetBuyPrice: 100000,
      targetSellPrice: 120000,
      status: 'watching',
    });
    assert.equal(created.actualBuyPrice, undefined);
    assert.equal(created.actualSellPrice, undefined);
  });

  it('删除后不再出现在列表中', () => {
    const created = createFavorite(db, {
      productName: '待删除商品',
      category: '平板',
      condition: '99new',
      targetBuyPrice: 1000,
      targetSellPrice: 2000,
      status: 'watching',
    });
    assert.equal(deleteFavorite(db, created.id), true);
    assert.ok(!listFavorites(db).some((item) => item.id === created.id));
  });

  it('更新不存在的收藏返回 undefined', () => {
    assert.equal(updateFavorite(db, 999999, { status: 'sold' }), undefined);
  });
});

describe('搜索历史', () => {
  it('同一关键词只保留一条，并累加使用次数', () => {
    const db = freshDb();
    try {
      recordSearch(db, 'RTX 4090', { keyword: 'RTX 4090' }, 3);
      recordSearch(db, 'RTX 4090', { keyword: 'RTX 4090' }, 5);
      const items = listSearchHistory(db);
      const matched = items.filter((item) => item.keyword === 'RTX 4090');
      assert.equal(matched.length, 1);
      assert.equal(matched[0].resultCount, 5);
      assert.equal(matched[0].useCount, 2);
    } finally {
      db.close();
    }
  });

  it('常用搜索按使用次数降序', () => {
    const db = freshDb();
    try {
      recordSearch(db, '偶尔搜', {}, 1);
      for (let i = 0; i < 3; i++) recordSearch(db, '经常搜', {}, 1);
      const frequent = listFrequentSearches(db);
      assert.equal(frequent[0].keyword, '经常搜');
      assert.equal(frequent[0].useCount, 3);
    } finally {
      db.close();
    }
  });

  it('置顶的搜索排在常用搜索最前，与使用次数无关', () => {
    const db = freshDb();
    try {
      for (let i = 0; i < 5; i++) recordSearch(db, '热门词', {}, 1);
      const rare = recordSearch(db, '冷门词', {}, 1);
      setPinned(db, rare.id, true);

      const frequent = listFrequentSearches(db);
      assert.equal(frequent[0].keyword, '冷门词');
      assert.equal(frequent[0].pinned, true);
    } finally {
      db.close();
    }
  });

  it('清空历史只清除非置顶项', () => {
    const db = freshDb();
    try {
      recordSearch(db, '保留', {}, 1);
      const keep = listSearchHistory(db)[0];
      setPinned(db, keep.id, true);
      recordSearch(db, '清掉', {}, 1);

      const removed = clearSearchHistory(db);
      assert.equal(removed, 1);
      const remaining = listSearchHistory(db);
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].keyword, '保留');
    } finally {
      db.close();
    }
  });

  it('可以删除单条搜索记录', () => {
    const db = freshDb();
    try {
      recordSearch(db, 'Sony', {}, 4);
      const target = listSearchHistory(db)[0];
      assert.equal(deleteSearchHistory(db, target.id), true);
      assert.equal(listSearchHistory(db).length, 0);
    } finally {
      db.close();
    }
  });
});

describe('导入记录', () => {
  it('记录成功与失败行数，并保留错误详情', () => {
    const db = freshDb();
    try {
      const record = recordImport(db, {
        filename: 'demo.csv',
        totalRows: 3,
        successRows: 2,
        failedRows: 1,
        errors: ['第 3 行：品类不能为空'],
      });
      assert.equal(record.successRows, 2);
      assert.equal(record.failedRows, 1);
      assert.deepEqual(record.errors, ['第 3 行：品类不能为空']);

      const all = listImports(db);
      assert.equal(all.length, 1);
    } finally {
      db.close();
    }
  });
});
