import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase } from '../src/db/index.ts';
import { seedDatabase } from '../src/db/seed.ts';
import {
  deleteMarketPrice,
  listMarketPrices,
  matchMarketPrice,
  normalizeMarketKey,
  upsertMarketPrice,
} from '../src/repositories/marketPrices.ts';
import { createProduct, listProducts } from '../src/repositories/products.ts';
import { computeOpportunities } from '../src/services/opportunities.ts';
import { assessRisk } from '@daoye/shared';
import { CATEGORY_GROUPS, categoryIdForStorage, categoryNamesForFilter } from '@daoye/shared';
import { requireCategoryName } from '../src/validation.ts';

function freshDb() {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  return db;
}

describe('行情价（用户手动维护）', () => {
  it('同一 (scope, 键) 重复保存是更新而不是新增', () => {
    const db = freshDb();
    try {
      const first = upsertMarketPrice(db, {
        scope: 'model',
        label: 'iPhone 15 256GB',
        price: 429_900,
      });
      const second = upsertMarketPrice(db, {
        scope: 'model',
        label: 'iphone 15 256gb',
        price: 419_900,
      });
      assert.equal(first.id, second.id);
      assert.equal(listMarketPrices(db).length, 1);
      assert.equal(second.price, 419_900);
    } finally {
      db.close();
    }
  });

  it('匹配时先精确命中型号，再按商品名包含的关键词取最长一条', () => {
    const db = freshDb();
    try {
      upsertMarketPrice(db, { scope: 'model', label: 'A7M4', price: 1_200_000 });
      upsertMarketPrice(db, { scope: 'keyword', label: 'Sony', price: 900_000 });
      upsertMarketPrice(db, { scope: 'keyword', label: 'Sony A7M4', price: 1_250_000 });
      const prices = listMarketPrices(db);

      const byModel = matchMarketPrice(prices, { name: 'Sony A7M4 机身', model: 'A7M4' });
      assert.equal(byModel?.price, 1_200_000);

      const byKeyword = matchMarketPrice(prices, { name: 'Sony A7M4 套装' });
      assert.equal(byKeyword?.price, 1_250_000);

      assert.equal(matchMarketPrice(prices, { name: 'Canon R6' }), undefined);
    } finally {
      db.close();
    }
  });

  it('归一化键忽略大小写与多余空格，删除后不再命中', () => {
    assert.equal(normalizeMarketKey('  iPhone   15  '), 'iphone 15');
    const db = freshDb();
    try {
      const saved = upsertMarketPrice(db, { scope: 'keyword', label: 'iPhone 15', price: 100_000 });
      assert.equal(deleteMarketPrice(db, saved.id), true);
      assert.equal(deleteMarketPrice(db, saved.id), false);
      assert.equal(listMarketPrices(db).length, 0);
    } finally {
      db.close();
    }
  });

  it('设置行情价后才有利润；未设置时利润为 null 且不编造结论', () => {
    const db = freshDb();
    try {
      const productId = createProduct(db, {
        name: 'Sony A7M4 机身',
        category: '相机机身',
        model: 'A7M4',
        condition: '95new',
        price: 1_100_000,
        priceType: 'listing',
        origin: 'manual',
      });

      const before = computeOpportunities(db).find((item) => item.product_id === productId);
      assert.ok(before, '商品应当出现在机会评分里');
      assert.equal(before.market_price_set, false);
      assert.equal(before.net_profit, null);
      assert.equal(before.roi, null);
      assert.equal(before.sell_price_source, '未设置行情价');

      upsertMarketPrice(db, { scope: 'model', label: 'A7M4', price: 1_320_000 });
      const after = computeOpportunities(db).find((item) => item.product_id === productId);
      assert.ok(after);
      assert.equal(after.market_price_set, true);
      assert.match(after.sell_price_source, /用户填写的行情价/);
      assert.equal(typeof after.net_profit, 'number');
    } finally {
      db.close();
    }
  });
});

describe('入库品类（10 大类 + 保留子分类）', () => {
  it('旧库升级：补齐 parent_id 并写入 10 个大分类，不依赖空库灌数据', () => {
    // 真实场景：已有数据库不会再执行「首次启动灌演示数据」，分类目录必须随迁移写入。
    // 临时库放在项目 work/ 目录（测试从 backend/ 运行，因此上跳一级）。
    const file = join(process.cwd(), '..', 'work', 'tmp-taxonomy-old.sqlite');
    try {
      for (const suffix of ['', '-wal', '-shm']) {
        const path = `${file}${suffix}`;
        if (existsSync(path)) rmSync(path, { force: true });
      }
      const legacy = new DatabaseSync(file);
      legacy.exec(`
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE,
          icon TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0
        );
      `);
      const insert = legacy.prepare(
        'INSERT INTO categories (id, name, slug, icon, sort_order) VALUES (?, ?, ?, ?, ?)'
      );
      ['相机机身', '镜头', '显卡', '无人机', '手机', '平板', '笔记本'].forEach((name, index) =>
        insert.run(index + 1, name, `legacy${index + 1}`, 'x', index)
      );
      legacy.close();

      const db = createDatabase(file);
      const columns = db.prepare('PRAGMA table_info(categories)').all() as Array<{ name: string }>;
      assert.ok(
        columns.some((column) => column.name === 'parent_id'),
        '迁移应补上 parent_id 列'
      );
      const groups = db
        .prepare('SELECT id FROM categories WHERE parent_id IS NULL ORDER BY id')
        .all() as Array<{ id: number }>;
      assert.equal(groups.length, 10, '应写入 10 个大分类');
      const children = db
        .prepare('SELECT COUNT(*) AS n FROM categories WHERE parent_id IS NOT NULL')
        .get() as { n: number };
      assert.equal(children.n, 7, '原有 7 个细分品类应保留并挂到父分类');
      const groupId = categoryIdForStorage(CATEGORY_GROUPS[0].name);
      assert.equal(typeof groupId, 'number');
      assert.ok(
        db.prepare('SELECT 1 AS ok FROM categories WHERE id = ?').get(groupId as number),
        '大分类应可直接用于入库'
      );
      db.close();
    } finally {
      for (const suffix of ['', '-wal', '-shm']) {
        const path = `${file}${suffix}`;
        if (existsSync(path)) rmSync(path, { force: true });
      }
    }
  });

  it('大分类可作为入库品类，细分类仍被接受', () => {
    const group = requireCategoryName({ category: CATEGORY_GROUPS[0].name });
    assert.equal(group, CATEGORY_GROUPS[0].name);
    assert.equal(requireCategoryName({ category: '镜头' }), '镜头');
    assert.throws(() => requireCategoryName({ category: '没有这个分类' }));
  });

  it('按大分类筛选能命中其子分类下的旧商品', () => {
    const db = freshDb();
    try {
      const groupId = categoryIdForStorage(CATEGORY_GROUPS[0].name);
      assert.equal(typeof groupId, 'number');
      const viaGroup = listProducts(db, { categoryId: groupId, limit: 500, offset: 0 });
      const viaChild = listProducts(db, {
        categoryId: categoryIdForStorage('显卡'),
        limit: 500,
        offset: 0,
      });
      assert.ok(viaChild.total > 0, '子分类下应当有商品');
      assert.ok(
        viaGroup.total >= viaChild.total,
        '大分类的结果应包含子分类商品，而不是更少'
      );
    } finally {
      db.close();
    }
  });

  it('大分类展开成子分类名，未知分类保留原值不兜底', () => {
    assert.ok(categoryNamesForFilter(CATEGORY_GROUPS[0].name).includes('显卡'));
    assert.deepEqual(categoryNamesForFilter('未知分类'), ['未知分类']);
  });
});

describe('卖家信誉与价格偏离的评分规则', () => {
  const base = { category: '手机', price: 400_000 };

  it('缺少信誉数据时标为无法确认，而不是信誉差', () => {
    const result = assessRisk(base);
    const seller = result.evidence.find((item) => item.id === 'seller');
    assert.equal(seller?.status, 'unknown');
    assert.equal(result.risk_level, 'insufficient');
  });

  it('信誉信号按规则分级，且缺失信号不按 0 分计入', () => {
    const good = assessRisk({
      ...base,
      sellerInfo: { zhimaLevel: '极好', goodRatePercent: 99.2, soldCount: 120 },
    });
    assert.equal(good.evidence.find((item) => item.id === 'seller')?.status, 'pass');

    const mid = assessRisk({
      ...base,
      sellerInfo: { zhimaLevel: '良好', goodRatePercent: 96 },
    });
    const midSeller = mid.evidence.find((item) => item.id === 'seller');
    assert.equal(midSeller?.status, 'warning');
    assert.match(String(midSeller?.description), /未展示、未参与计分的信号：成交记录/);
  });

  it('价格偏离只对用户行情价做判断，未设置时不臆断', () => {
    const without = assessRisk(base).evidence.find((item) => item.id === 'price-deviation');
    assert.equal(without?.status, 'unknown');
    assert.match(String(without?.source), /未设置行情价/);

    const close = assessRisk({ ...base, marketPrice: 410_000 }).evidence.find(
      (item) => item.id === 'price-deviation'
    );
    assert.equal(close?.status, 'pass');

    const far = assessRisk({ ...base, marketPrice: 300_000 }).evidence.find(
      (item) => item.id === 'price-deviation'
    );
    assert.equal(far?.status, 'fail');
  });
});
