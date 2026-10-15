import { createSeededRandom } from './random.ts';
import { BRANDS, CATEGORIES } from './catalog.ts';
import type { MockPriceRecord, PriceType, ProductType } from './types.ts';

const MOCK_PRODUCTS: Array<Omit<ProductType, 'origin'>> = [
  // 相机机身
  {
    id: 1,
    name: "Sony A7R5 机身",
    category: "相机机身",
    brand: "Sony",
    price: 2200000,
    price_type: "listing",
    condition: "99new",
    image: "",
    profit_score: 8.5,
    roi_score: 25.3,
    risk_level: "low",
    recommendation: "watch",
  },
  {
    id: 2,
    name: "Canon R6 Mark II 机身",
    category: "相机机身",
    brand: "Canon",
    price: 1450000,
    price_type: "listing",
    condition: "95new",
    image: "",
    profit_score: 7.2,
    roi_score: 18.5,
    risk_level: "medium",
    recommendation: "caution",
  },
  {
    id: 3,
    name: "Nikon Z9 机身",
    category: "相机机身",
    brand: "Nikon",
    price: 3100000,
    price_type: "sold",
    condition: "90new",
    image: "",
    profit_score: 6.8,
    roi_score: 15.2,
    risk_level: "low",
    recommendation: "watch",
  },
  {
    id: 4,
    name: "Fujifilm X-T5 机身",
    category: "相机机身",
    brand: "Fujifilm",
    price: 980000,
    price_type: "reference",
    condition: "99new",
    image: "",
    profit_score: 5.5,
    roi_score: 12.8,
    risk_level: "medium",
    recommendation: "caution",
  },
  {
    id: 5,
    name: "Sony A7C II 机身",
    category: "相机机身",
    brand: "Sony",
    price: 1180000,
    price_type: "simulated",
    condition: "95new",
    image: "",
    profit_score: 4.2,
    roi_score: 8.5,
    risk_level: "insufficient",
    recommendation: "avoid",
  },
  // 镜头
  {
    id: 6,
    name: "Sony FE 24-70mm F2.8 GM II",
    category: "镜头",
    brand: "Sony",
    price: 1450000,
    price_type: "listing",
    condition: "99new",
    image: "",
    profit_score: 8.0,
    roi_score: 22.1,
    risk_level: "low",
    recommendation: "watch",
  },
  {
    id: 7,
    name: "Canon RF 70-200mm F2.8L IS USM",
    category: "镜头",
    brand: "Canon",
    price: 1850000,
    price_type: "listing",
    condition: "95new",
    image: "",
    profit_score: 7.5,
    roi_score: 20.3,
    risk_level: "low",
    recommendation: "watch",
  },
  {
    id: 8,
    name: "Nikon Z 14-24mm F2.8 S",
    category: "镜头",
    brand: "Nikon",
    price: 1650000,
    price_type: "sold",
    condition: "90new",
    image: "",
    profit_score: 6.2,
    roi_score: 16.8,
    risk_level: "medium",
    recommendation: "caution",
  },
  {
    id: 9,
    name: "Sony FE 85mm F1.4 GM",
    category: "镜头",
    brand: "Sony",
    price: 1180000,
    price_type: "reference",
    condition: "99new",
    image: "",
    profit_score: 5.8,
    roi_score: 14.5,
    risk_level: "low",
    recommendation: "watch",
  },
  {
    id: 10,
    name: "Sigma 24-70mm F2.8 DG DN Art",
    category: "镜头",
    brand: "Sigma",
    price: 680000,
    price_type: "simulated",
    condition: "95new",
    image: "",
    profit_score: 3.5,
    roi_score: 6.2,
    risk_level: "insufficient",
    recommendation: "avoid",
  },
  // 显卡
  {
    id: 11,
    name: "NVIDIA RTX 4090 24GB",
    category: "显卡",
    brand: "NVIDIA",
    price: 1280000,
    price_type: "listing",
    condition: "99new",
    image: "",
    profit_score: 9.2,
    roi_score: 35.5,
    risk_level: "high",
    recommendation: "caution",
  },
  {
    id: 12,
    name: "NVIDIA RTX 4080 Super 16GB",
    category: "显卡",
    brand: "NVIDIA",
    price: 850000,
    price_type: "listing",
    condition: "95new",
    image: "",
    profit_score: 8.5,
    roi_score: 28.2,
    risk_level: "high",
    recommendation: "caution",
  },
  {
    id: 13,
    name: "AMD RX 7900 XTX 24GB",
    category: "显卡",
    brand: "AMD",
    price: 680000,
    price_type: "sold",
    condition: "90new",
    image: "",
    profit_score: 7.8,
    roi_score: 25.1,
    risk_level: "medium",
    recommendation: "watch",
  },
  {
    id: 14,
    name: "NVIDIA RTX 4070 Ti Super 16GB",
    category: "显卡",
    brand: "NVIDIA",
    price: 620000,
    price_type: "reference",
    condition: "99new",
    image: "",
    profit_score: 6.5,
    roi_score: 18.5,
    risk_level: "medium",
    recommendation: "caution",
  },
  {
    id: 15,
    name: "NVIDIA RTX 3090 24GB (二手)",
    category: "显卡",
    brand: "NVIDIA",
    price: 450000,
    price_type: "simulated",
    condition: "good",
    image: "",
    profit_score: 4.0,
    roi_score: 8.5,
    risk_level: "high",
    recommendation: "avoid",
  },
  // 无人机
  {
    id: 16,
    name: "DJI Mavic 3 Pro 套装",
    category: "无人机",
    brand: "DJI",
    price: 1380000,
    price_type: "listing",
    condition: "99new",
    image: "",
    profit_score: 8.8,
    roi_score: 30.2,
    risk_level: "low",
    recommendation: "watch",
  },
  {
    id: 17,
    name: "DJI Air 3 双摄无人机",
    category: "无人机",
    brand: "DJI",
    price: 650000,
    price_type: "listing",
    condition: "95new",
    image: "",
    profit_score: 7.2,
    roi_score: 22.5,
    risk_level: "low",
    recommendation: "watch",
  },
  {
    id: 18,
    name: "DJI Mini 4 Pro 套装",
    category: "无人机",
    brand: "DJI",
    price: 480000,
    price_type: "sold",
    condition: "99new",
    image: "",
    profit_score: 6.0,
    roi_score: 16.8,
    risk_level: "medium",
    recommendation: "caution",
  },
  {
    id: 19,
    name: "DJI Avata 2 穿越机",
    category: "无人机",
    brand: "DJI",
    price: 350000,
    price_type: "reference",
    condition: "95new",
    image: "",
    profit_score: 5.5,
    roi_score: 14.2,
    risk_level: "medium",
    recommendation: "caution",
  },
  {
    id: 20,
    name: "Autel EVO II Pro V3",
    category: "无人机",
    brand: "Autel",
    price: 780000,
    price_type: "simulated",
    condition: "90new",
    image: "",
    profit_score: 4.5,
    roi_score: 10.5,
    risk_level: "insufficient",
    recommendation: "avoid",
  },
  // 手机
  {
    id: 21,
    name: "iPhone 15 Pro Max 256GB",
    category: "手机",
    brand: "Apple",
    price: 720000,
    price_type: "listing",
    condition: "99new",
    image: "",
    profit_score: 7.5,
    roi_score: 20.5,
    risk_level: "medium",
    recommendation: "caution",
  },
  {
    id: 22,
    name: "Samsung Galaxy S24 Ultra 256GB",
    category: "手机",
    brand: "Samsung",
    price: 680000,
    price_type: "listing",
    condition: "95new",
    image: "",
    profit_score: 7.0,
    roi_score: 18.2,
    risk_level: "medium",
    recommendation: "caution",
  },
  {
    id: 23,
    name: "Xiaomi 14 Ultra 16GB+512GB",
    category: "手机",
    brand: "Xiaomi",
    price: 480000,
    price_type: "sold",
    condition: "99new",
    image: "",
    profit_score: 6.5,
    roi_score: 16.8,
    risk_level: "low",
    recommendation: "watch",
  },
  {
    id: 24,
    name: "iPhone 14 Pro 128GB",
    category: "手机",
    brand: "Apple",
    price: 450000,
    price_type: "reference",
    condition: "95new",
    image: "",
    profit_score: 5.8,
    roi_score: 14.5,
    risk_level: "medium",
    recommendation: "caution",
  },
  {
    id: 25,
    name: "OnePlus 12 16GB+512GB",
    category: "手机",
    brand: "OnePlus",
    price: 380000,
    price_type: "simulated",
    condition: "99new",
    image: "",
    profit_score: 4.2,
    roi_score: 9.5,
    risk_level: "insufficient",
    recommendation: "avoid",
  },
  // 平板
  {
    id: 26,
    name: "iPad Pro 13 M4 256GB",
    category: "平板",
    brand: "Apple",
    price: 980000,
    price_type: "listing",
    condition: "99new",
    image: "",
    profit_score: 8.2,
    roi_score: 24.5,
    risk_level: "low",
    recommendation: "watch",
  },
  {
    id: 27,
    name: "iPad Air 13 M2 256GB",
    category: "平板",
    brand: "Apple",
    price: 580000,
    price_type: "listing",
    condition: "95new",
    image: "",
    profit_score: 6.8,
    roi_score: 18.2,
    risk_level: "medium",
    recommendation: "caution",
  },
  {
    id: 28,
    name: "Samsung Galaxy Tab S10 Ultra 256GB",
    category: "平板",
    brand: "Samsung",
    price: 720000,
    price_type: "sold",
    condition: "99new",
    image: "",
    profit_score: 6.5,
    roi_score: 16.5,
    risk_level: "medium",
    recommendation: "caution",
  },
  {
    id: 29,
    name: "Xiaomi Pad 7 Pro 12GB+256GB",
    category: "平板",
    brand: "Xiaomi",
    price: 280000,
    price_type: "reference",
    condition: "99new",
    image: "",
    profit_score: 5.0,
    roi_score: 12.8,
    risk_level: "low",
    recommendation: "watch",
  },
  {
    id: 30,
    name: "iPad mini 7 128GB",
    category: "平板",
    brand: "Apple",
    price: 350000,
    price_type: "simulated",
    condition: "95new",
    image: "",
    profit_score: 4.5,
    roi_score: 10.2,
    risk_level: "insufficient",
    recommendation: "avoid",
  },
  // 笔记本
  {
    id: 31,
    name: "MacBook Pro 16 M3 Max 36GB+1TB",
    category: "笔记本",
    brand: "Apple",
    price: 2450000,
    price_type: "listing",
    condition: "99new",
    image: "",
    profit_score: 8.5,
    roi_score: 22.8,
    risk_level: "low",
    recommendation: "watch",
  },
  {
    id: 32,
    name: "ThinkPad X1 Carbon Gen 12 Ultra 7",
    category: "笔记本",
    brand: "ThinkPad",
    price: 1280000,
    price_type: "listing",
    condition: "95new",
    image: "",
    profit_score: 7.2,
    roi_score: 18.5,
    risk_level: "medium",
    recommendation: "caution",
  },
  {
    id: 33,
    name: "ROG 幻 16 Air Ryzen AI 9 HX 370",
    category: "笔记本",
    brand: "ROG",
    price: 1450000,
    price_type: "sold",
    condition: "99new",
    image: "",
    profit_score: 7.8,
    roi_score: 20.5,
    risk_level: "low",
    recommendation: "watch",
  },
  {
    id: 34,
    name: "MacBook Air 15 M3 16GB+512GB",
    category: "笔记本",
    brand: "Apple",
    price: 880000,
    price_type: "reference",
    condition: "99new",
    image: "",
    profit_score: 6.2,
    roi_score: 15.8,
    risk_level: "medium",
    recommendation: "caution",
  },
  {
    id: 35,
    name: "Dell XPS 14 Ultra 7 256GB",
    category: "笔记本",
    brand: "Dell",
    price: 950000,
    price_type: "simulated",
    condition: "95new",
    image: "",
    profit_score: 5.0,
    roi_score: 11.5,
    risk_level: "insufficient",
    recommendation: "avoid",
  },
];

/**
 * 模拟挂牌通常带有实拍图和文字描述，这里确定性地补上，
 * 让「信息完整度」与「图片一致性」两个风险维度有真实输入，
 * 而不是永远停留在「无法确认」。图片路径为占位符，不指向任何真实商品。
 */
function enrichListing(product: Omit<ProductType, 'origin'>): ProductType {
  const rand = createSeededRandom(product.id * 104729 + 7);
  const shotCount = 3 + Math.floor(rand() * 3);
  // 型号由商品名去掉品牌前缀得到，用于「同型号不同成色」的横向比较。
  const model = product.name.replace(new RegExp(`^${product.brand}\\s*`, "i"), "").trim();
  return {
    ...product,
    origin: 'seed',
    model: model || product.name,
    images: Array.from(
      { length: shotCount },
      (_, index) => `mock://listing/${product.id}/shot-${index + 1}.jpg`
    ),
    description:
      `【模拟测试数据】${product.name}，${product.brand} ${product.category}，` +
      `成色标注 ${product.condition}。卖家描述包含使用频率、配件清单与外观磨损说明，` +
      `但未提供序列号照片与维修记录，需要买家自行核验。本段文字为演示用构造内容。`,
    seller: {
      name: `模拟卖家${product.id}`,
      rating: Math.round((4.0 + rand() * 1.0) * 10) / 10,
      transactions: 10 + Math.floor(rand() * 600),
    },
  };
}

let productCache: ProductType[] | null = null;

/** 内置的演示商品目录（纯数据，不依赖浏览器环境）。 */
export function getSeedProducts(): ProductType[] {
  if (!productCache) {
    productCache = MOCK_PRODUCTS.map(enrichListing);
  }
  return productCache;
}

export function getSeedProductById(id: number): ProductType | undefined {
  return getSeedProducts().find((product) => product.id === id);
}

export function filterProducts(
  products: ProductType[],
  filters: Record<string, string>
): ProductType[] {
  return products.filter((p) => {
    const keyword = filters.keyword?.toLowerCase() || "";
    if (keyword && !p.name.toLowerCase().includes(keyword) && !p.brand.toLowerCase().includes(keyword)) {
      return false;
    }
    if (filters.categoryId && p.category !== CATEGORIES.find((c) => c.id === Number(filters.categoryId))?.name) {
      return false;
    }
    if (filters.brandId && p.brand !== BRANDS.find((b) => b.id === Number(filters.brandId))?.name) {
      return false;
    }
    if (filters.condition && p.condition !== filters.condition) {
      return false;
    }
    if (filters.minPrice && p.price < Number(filters.minPrice) * 100) {
      return false;
    }
    if (filters.maxPrice && p.price > Number(filters.maxPrice) * 100) {
      return false;
    }
    return true;
  }).sort((a, b) => {
    const sortBy = filters.sortBy || "profit";
    const sortOrder = filters.sortOrder || "desc";
    const multiplier = sortOrder === "asc" ? 1 : -1;
    switch (sortBy) {
      case "profit":
        return multiplier * ((b.profit_score ?? 0) - (a.profit_score ?? 0));
      case "roi":
        return multiplier * ((b.roi_score ?? 0) - (a.roi_score ?? 0));
      case "price":
        return multiplier * (b.price - a.price);
      case "date":
        return multiplier * (b.id - a.id);
      default:
        return 0;
    }
  });
}

const PRICE_PLATFORMS = ["闲鱼", "转转", "京东二手", "拍拍", "回收宝"];
const PRICE_CONDITIONS = ["99new", "95new", "90new", "good", "fair"];
const PRICE_LOCATIONS = ["北京", "上海", "深圳", "广州", "杭州", "成都"];

/**
 * 演示数据以固定时间点为基准，保证同一商品在任何时候打开都得到完全相同的记录，
 * 避免「采集时间」随刷新跳动，也方便测试与截图复现。
 */
const DEMO_REFERENCE_TIME = Date.UTC(2026, 9, 14, 12, 0, 0);

/**
 * 每种价格类型各有明确含义，不能互相冒充：
 * - listing   平台当前挂牌价（卖家要价，不是成交价）
 * - sold      已成交价（本次演示用确定性算法生成，属于模拟成交参考）
 * - reference 历史参考价（行情区间）
 * - manual    用户手动录入的价格
 * - simulated 纯模拟数据，仅用于占位
 */
const LISTING_FACTORS = [0.96, 1.03, 1.11, 1.06, 0.99];
const SOLD_FACTORS = [1.07, 1.15, 1.1, 1.19];

/**
 * 不同商品的成交价样本数不一样（现实中也如此：冷门型号可能只有一两条成交参考）。
 * 这直接影响「价格数据可信度」，进而影响是否值得关注，所以不能所有商品都长一样。
 */
function buildPricePlan(rand: () => number): Array<{ type: PriceType; factor: number }> {
  const listingCount = 2 + Math.floor(rand() * 3); // 2-4 条挂牌价
  const soldCount = 1 + Math.floor(rand() * 3); // 1-3 条成交价
  return [
    ...LISTING_FACTORS.slice(0, listingCount).map((factor) => ({
      type: "listing" as const,
      factor,
    })),
    ...SOLD_FACTORS.slice(0, soldCount).map((factor) => ({
      type: "sold" as const,
      factor,
    })),
    { type: "reference", factor: 1.05 },
    { type: "manual", factor: 1.02 },
    { type: "simulated", factor: 0.87 },
  ];
}

export function getMockPriceRecords(productId: number): MockPriceRecord[] {
  const product = getSeedProductById(productId);
  if (!product) return [];

  const rand = createSeededRandom(productId * 7919 + 13);
  const base = product.price;
  const plan = buildPricePlan(rand);

  /**
   * 一个卖家只在一个城市，所以一件商品只会出现在少数几个地区。
   * 如果所有商品都覆盖全部地区，「地区筛选」就没有任何区分度。
   */
  const regionOffset = Math.floor(rand() * PRICE_LOCATIONS.length);
  const regionCount = 1 + Math.floor(rand() * 2); // 1-2 个地区
  const productRegions = Array.from(
    { length: regionCount },
    (_, index) => PRICE_LOCATIONS[(regionOffset + index) % PRICE_LOCATIONS.length]
  );

  return plan.map((entry, i) => {
    const jitter = 0.98 + rand() * 0.05;
    const price = Math.round((base * entry.factor * jitter) / 100) * 100;
    const collectedAt = new Date(
      DEMO_REFERENCE_TIME - Math.round((1 + rand() * 45) * 86400000)
    );
    return {
      id: productId * 100 + i,
      product_id: productId,
      platform: PRICE_PLATFORMS[i % PRICE_PLATFORMS.length],
      price,
      price_type: entry.type,
      condition: PRICE_CONDITIONS[i % PRICE_CONDITIONS.length],
      location: productRegions[i % productRegions.length],
      shipping_fee: Math.round(rand() * 50) * 100,
      platform_fee_rate: 0.006 + rand() * 0.014,
      collected_at: collectedAt.toISOString(),
      source_url: `https://example.com/mock-item/${productId * 100 + i}`,
      confidence: 0.35 + rand() * 0.25,
      listing_id: `MOCK-${productId}-${i}`,
      seller_info: {
        name: `模拟卖家${i + 1}`,
        rating: Math.round((4.2 + rand() * 0.8) * 10) / 10,
        transactions: Math.floor(rand() * 500) + 20,
      },
      notes:
        entry.type === "simulated"
          ? "示例占位数据，仅用于演示，不代表真实行情"
          : "演示用模拟记录，采集时间与来源均为构造值",
      data_source: "模拟测试数据",
      created_at: collectedAt.toISOString(),
      updated_at: collectedAt.toISOString(),
    };
  });
}
