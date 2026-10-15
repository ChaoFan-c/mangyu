import type { DatabaseSync } from 'node:sqlite';
import {
  createProduct,
  findProductBySourceRef,
  updateCollectedProduct,
} from '../repositories/products.ts';
import {
  createPriceRecord,
  findObservedPriceRecord,
  updateObservedPriceRecord,
} from '../repositories/priceRecords.ts';
import type { CollectedItem, CollectedPrice, IngestResult } from './types.ts';

export interface IngestCollectedItemInput {
  db: DatabaseSync;
  sourceId: string;
  item: CollectedItem;
  category?: string;
  condition?: string;
}

function cnyPrices(item: CollectedItem): CollectedPrice[] {
  return item.prices.filter(
    (price) =>
      price.currency.toUpperCase() === 'CNY' &&
      Number.isInteger(price.price) &&
      price.price > 0
  );
}

function primaryPrice(prices: CollectedPrice[]): CollectedPrice {
  const order = ['listing', 'manual', 'reference', 'sold', 'simulated'];
  return [...prices].sort((left, right) => {
    const typeDiff = order.indexOf(left.priceType) - order.indexOf(right.priceType);
    if (typeDiff !== 0) return typeDiff;
    return left.price - right.price;
  })[0];
}

function appendWarnings(notes: string | undefined, warnings: string[] | undefined): string | undefined {
  const items = [notes, ...(warnings ?? [])].filter(
    (value): value is string => Boolean(value && value.trim())
  );
  return items.length ? items.join('；') : undefined;
}

export function ingestCollectedItem(input: IngestCollectedItemInput): IngestResult {
  const { db, sourceId, item } = input;
  const prices = cnyPrices(item);
  if (prices.length === 0) {
    throw new Error('没有可入库的人民币（CNY）价格，未创建或更新商品');
  }

  const sourceRef = (item.sourceRef ?? item.externalId).trim();
  if (!sourceRef) throw new Error('采集项缺少来源侧唯一标识');

  const existing = findProductBySourceRef(db, sourceId, sourceRef);
  const category = input.category ?? item.category ?? existing?.category;
  if (!category) throw new Error('采集项缺少品类，请先补充品类');
  const condition = input.condition ?? item.condition ?? existing?.condition ?? 'unknown';
  const main = primaryPrice(prices);

  db.exec('BEGIN IMMEDIATE');
  try {
    let productId: number;
    let createdProduct = false;
    if (existing) {
      productId = existing.id;
      updateCollectedProduct(db, {
        id: productId,
        name: item.name,
        category,
        brand: item.brand,
        model: item.model,
        condition,
        price: main.price,
        priceType: main.priceType,
        description: item.description,
        seller: item.seller,
      });
    } else {
      productId = createProduct(db, {
        name: item.name,
        category,
        brand: item.brand,
        model: item.model,
        condition,
        price: main.price,
        priceType: main.priceType,
        description: item.description,
        seller: item.seller,
        origin: 'import',
        sourceId,
        sourceRef,
      });
      createdProduct = true;
    }

    let newPriceRecords = 0;
    let updatedPriceRecords = 0;
    for (const price of prices) {
      const priceCondition = price.condition ?? condition;
      const externalId = price.externalId ?? item.externalId;
      const observed = findObservedPriceRecord(db, {
        sourceId,
        externalId,
        priceType: price.priceType,
        condition: priceCondition,
        price: price.price,
      });
      const notes = appendWarnings(price.notes, item.warnings);
      if (observed) {
        updateObservedPriceRecord(db, observed, {
          platform: price.platform,
          location: price.location,
          shippingFee: price.shippingFee ?? 0,
          platformFeeRate: price.platformFeeRate ?? 0.01,
          collectedAt: price.collectedAt,
          sourceUrl: price.sourceUrl ?? item.sourceUrl,
          confidence: price.confidence,
          notes,
          dataSource: item.dataSource,
        });
        updatedPriceRecords += 1;
      } else {
        createPriceRecord(db, {
          productId,
          platform: price.platform,
          price: price.price,
          priceType: price.priceType,
          condition: priceCondition,
          location: price.location,
          shippingFee: price.shippingFee ?? 0,
          platformFeeRate: price.platformFeeRate ?? 0.01,
          sourceUrl: price.sourceUrl ?? item.sourceUrl,
          confidence: price.confidence,
          notes,
          dataSource: item.dataSource,
          sourceId,
          externalId,
          collectedAt: price.collectedAt,
        });
        newPriceRecords += 1;
      }
    }

    db.exec('COMMIT');
    return {
      productId,
      createdProduct,
      newPriceRecords,
      updatedPriceRecords,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
