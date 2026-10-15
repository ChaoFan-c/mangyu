import type { DatabaseSync } from 'node:sqlite';
import {
  BRANDS,
  CATEGORIES,
  CATEGORY_GROUPS,
  getMockPriceRecords,
  getSeedProducts,
  categoryIdByName,
  type MockPriceRecord,
  type ProductType,
} from '@daoye/shared';
import { nowIso } from './index.ts';
import { ensureCatalog } from './index.ts';

export interface SeedResult {
  categories: number;
  brands: number;
  products: number;
  priceRecords: number;
}

/**
 * 把内置演示目录写入数据库。
 * 幂等：使用 INSERT OR REPLACE，重复执行不会产生重复行。
 * 只清理 origin='seed' 的数据，用户手动录入与导入的数据不受影响。
 */
export function seedDatabase(db: DatabaseSync): SeedResult {
  const timestamp = nowIso();

  db.exec('BEGIN');
  try {
    // 分类目录与迁移共用同一份幂等实现，避免两处各写一套。
    ensureCatalog(db);

    const insertBrand = db.prepare(
      `INSERT OR REPLACE INTO brands (id, name, slug, category_id) VALUES (?, ?, ?, ?)`
    );
    for (const brand of BRANDS) {
      insertBrand.run(brand.id, brand.name, brand.slug, brand.category_id);
    }

    // 重新灌入演示数据前，先清掉旧的演示商品及其价格记录。
    db.exec(`DELETE FROM price_records WHERE product_id IN (SELECT id FROM products WHERE origin = 'seed')`);
    db.exec(`DELETE FROM products WHERE origin = 'seed'`);

    const insertProduct = db.prepare(
      `INSERT INTO products
         (id, category_id, brand_id, name, model, condition, price, price_type,
          images, description, seller, origin, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', 1, ?, ?)`
    );

    const seedProducts = getSeedProducts();
    for (const product of seedProducts) {
      const categoryId = categoryIdByName(product.category) ?? 1;
      const brandId = BRANDS.find((brand) => brand.name === product.brand)?.id ?? null;
      insertProduct.run(
        product.id,
        categoryId,
        brandId,
        product.name,
        product.model ?? null,
        product.condition,
        product.price,
        product.price_type,
        JSON.stringify(product.images ?? []),
        product.description ?? null,
        product.seller ? JSON.stringify(product.seller) : null,
        timestamp,
        timestamp
      );
    }

    const insertPrice = db.prepare(
      `INSERT INTO price_records
         (product_id, platform, price, price_type, condition, location, shipping_fee,
          platform_fee_rate, collected_at, source_url, confidence, listing_id,
          seller_info, notes, data_source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let priceRecordCount = 0;
    for (const product of seedProducts) {
      for (const record of getMockPriceRecords(product.id)) {
        insertPrice.run(
          record.product_id,
          record.platform,
          record.price,
          record.price_type,
          record.condition,
          record.location,
          record.shipping_fee,
          record.platform_fee_rate,
          record.collected_at,
          record.source_url,
          record.confidence,
          record.listing_id,
          JSON.stringify(record.seller_info),
          record.notes,
          record.data_source,
          timestamp,
          timestamp
        );
        priceRecordCount += 1;
      }
    }

    db.exec('COMMIT');
    return {
      categories: CATEGORY_GROUPS.length + CATEGORIES.length,
      brands: BRANDS.length,
      products: seedProducts.length,
      priceRecords: priceRecordCount,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** 把数据库行还原成前端使用的商品结构。 */
export function rowToProduct(row: Record<string, unknown>): ProductType {
  return {
    id: Number(row.id),
    name: String(row.name),
    model: row.model ? String(row.model) : undefined,
    category: String(row.category_name ?? ''),
    brand: String(row.brand_name ?? '未标注'),
    price: Number(row.price),
    price_type: String(row.price_type) as ProductType['price_type'],
    condition: String(row.condition),
    image: '',
    images: JSON.parse(String(row.images ?? '[]')) as string[],
    description: row.description ? String(row.description) : undefined,
    seller: row.seller
      ? (JSON.parse(String(row.seller)) as ProductType['seller'])
      : undefined,
    origin: String(row.origin ?? 'seed') as ProductType['origin'],
    source_id: row.source_id ? String(row.source_id) : undefined,
    source_ref: row.source_ref ? String(row.source_ref) : undefined,
  };
}

export function rowToPriceRecord(row: Record<string, unknown>): MockPriceRecord {
  return {
    id: Number(row.id),
    product_id: Number(row.product_id),
    platform: String(row.platform),
    price: Number(row.price),
    price_type: String(row.price_type) as MockPriceRecord['price_type'],
    condition: String(row.condition ?? ''),
    location: String(row.location ?? ''),
    shipping_fee: Number(row.shipping_fee ?? 0),
    platform_fee_rate: Number(row.platform_fee_rate ?? 0.01),
    collected_at: String(row.collected_at),
    source_url: String(row.source_url ?? ''),
    confidence: Number(row.confidence ?? 0.5),
    listing_id: String(row.listing_id ?? ''),
    seller_info: JSON.parse(String(row.seller_info ?? '{}')) as MockPriceRecord['seller_info'],
    notes: String(row.notes ?? ''),
    data_source: String(row.data_source ?? ''),
    source_id: row.source_id ? String(row.source_id) : undefined,
    external_id: row.external_id ? String(row.external_id) : undefined,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
