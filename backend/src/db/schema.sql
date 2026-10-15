-- 倒爷雷达 SQLite 表结构。
-- 约定：所有金额字段以「分」存储（INTEGER），时间字段以 ISO 字符串存储。
-- 价格类型必须来自固定枚举，禁止出现「看起来像成交价」的其它取值。

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE,
  slug       TEXT    NOT NULL UNIQUE,
  icon       TEXT    NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- 大分类（闲鱼官网 10 大类）与其子分类构成父子关系；子分类指向大分类。
  parent_id  INTEGER REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS brands (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL UNIQUE,
  slug        TEXT    NOT NULL UNIQUE,
  category_id INTEGER NOT NULL REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  brand_id    INTEGER REFERENCES brands(id),
  name        TEXT    NOT NULL,
  model       TEXT,
  condition   TEXT    NOT NULL DEFAULT '99new',
  -- 主参考价（分）
  price       INTEGER NOT NULL DEFAULT 0,
  price_type  TEXT    NOT NULL
              CHECK (price_type IN ('listing','sold','reference','manual','simulated')),
  images      TEXT    NOT NULL DEFAULT '[]',
  description TEXT,
  seller      TEXT,
  -- 数据来源：seed=内置演示目录，manual=用户手动录入，import=CSV 导入
  origin      TEXT    NOT NULL DEFAULT 'seed'
              CHECK (origin IN ('seed','manual','import')),
  -- 采集来源：source_id 是适配器 id，source_ref 是该来源里的外部引用（商品链接或外部 id）。
  -- 同一 (source_id, source_ref) 只对应一件商品，再次采集时追加价格记录。
  source_id   TEXT,
  source_ref  TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_origin ON products(origin);

CREATE TABLE IF NOT EXISTS price_records (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform         TEXT    NOT NULL,
  price            INTEGER NOT NULL,
  price_type       TEXT    NOT NULL
                   CHECK (price_type IN ('listing','sold','reference','manual','simulated')),
  condition        TEXT,
  location         TEXT,
  shipping_fee     INTEGER NOT NULL DEFAULT 0,
  platform_fee_rate REAL   NOT NULL DEFAULT 0.01,
  collected_at     TEXT    NOT NULL,
  source_url       TEXT,
  confidence       REAL    NOT NULL DEFAULT 0.5,
  listing_id       TEXT,
  seller_info      TEXT,
  notes            TEXT,
  -- 数据来源说明，必须能回答「这条价格是谁采集的、是否为真实行情」
  data_source      TEXT    NOT NULL DEFAULT '模拟测试数据',
  -- 采集来源标识：source_id 是适配器 id，external_id 是来源侧的商品 id
  source_id        TEXT,
  external_id      TEXT,
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_records_product ON price_records(product_id);
CREATE INDEX IF NOT EXISTS idx_price_records_type ON price_records(product_id, price_type);
CREATE INDEX IF NOT EXISTS idx_price_records_collected ON price_records(collected_at);

CREATE TABLE IF NOT EXISTS favorites (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name     TEXT    NOT NULL,
  category         TEXT    NOT NULL,
  brand            TEXT    NOT NULL DEFAULT '',
  condition        TEXT    NOT NULL DEFAULT '99new',
  target_buy_price INTEGER NOT NULL DEFAULT 0,
  target_sell_price INTEGER NOT NULL DEFAULT 0,
  actual_buy_price INTEGER,
  actual_sell_price INTEGER,
  notes            TEXT    NOT NULL DEFAULT '',
  status           TEXT    NOT NULL DEFAULT 'watching'
                   CHECK (status IN ('watching','bought','sold','skipped')),
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_favorites_status ON favorites(status);

CREATE TABLE IF NOT EXISTS search_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword      TEXT    NOT NULL,
  filters      TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  -- 「常用搜索」= 使用次数最多的关键词；pinned 表示用户手动置顶。
  use_count    INTEGER NOT NULL DEFAULT 1,
  pinned       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at DESC);

CREATE TABLE IF NOT EXISTS csv_imports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  filename     TEXT    NOT NULL,
  total_rows   INTEGER NOT NULL,
  success_rows INTEGER NOT NULL,
  failed_rows  INTEGER NOT NULL,
  errors       TEXT    NOT NULL DEFAULT '[]',
  status       TEXT    NOT NULL DEFAULT 'completed'
               CHECK (status IN ('pending','completed','failed')),
  created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS profit_calculations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
  label            TEXT,
  input_params     TEXT    NOT NULL,
  scenarios        TEXT    NOT NULL,
  cost_completeness REAL   NOT NULL DEFAULT 0,
  missing_fields   TEXT    NOT NULL DEFAULT '[]',
  warnings         TEXT    NOT NULL DEFAULT '[]',
  created_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profit_calc_product ON profit_calculations(product_id);

-- ---------- 商品数据采集模块 ----------
-- 行情价：用户自己判断并手动输入的参考市场价格。
-- 与采集到的挂牌价严格分开：采集程序不得写入、覆盖或推算这张表。
CREATE TABLE IF NOT EXISTS market_prices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scope      TEXT    NOT NULL CHECK (scope IN ('keyword', 'model')),
  scope_key  TEXT    NOT NULL,
  label      TEXT    NOT NULL,
  -- 金额单位：分；空值表示未设置，不得用 0 冒充未知。
  price      INTEGER NOT NULL CHECK (price >= 0),
  note       TEXT,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_prices_key
  ON market_prices(scope, scope_key);

-- 数据源状态：适配器本身定义在代码里，这里只保存「最后一次检查结果」，
-- 便于界面显示「上次检查时间」，而不用每次进页面都去打外部接口。
CREATE TABLE IF NOT EXISTS source_status (
  source_id       TEXT PRIMARY KEY,
  last_status     TEXT NOT NULL DEFAULT 'unknown'
                  CHECK (last_status IN ('ok','unavailable','error','unknown')),
  last_message    TEXT NOT NULL DEFAULT '',
  last_checked_at TEXT,
  updated_at      TEXT NOT NULL
);

-- 采集流水：每次搜索 / 取详情 / 用户提交链接都留一条，回答「这批数据是怎么进来的」。
CREATE TABLE IF NOT EXISTS collection_runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id         TEXT    NOT NULL,
  mode              TEXT    NOT NULL
                    CHECK (mode IN ('status','search','detail','history','link')),
  query             TEXT,
  status            TEXT    NOT NULL
                    CHECK (status IN ('ok','unavailable','error')),
  item_count        INTEGER NOT NULL DEFAULT 0,
  new_products      INTEGER NOT NULL DEFAULT 0,
  new_price_records INTEGER NOT NULL DEFAULT 0,
  message           TEXT,
  created_at        TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collection_runs_created ON collection_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_runs_source ON collection_runs(source_id, created_at DESC);

-- 注意：products.source_id / price_records.source_id 等列在旧库上是后补的，
-- 因此依赖这些列的索引不写在这里，而是放在 db/index.ts 的列迁移之后创建。
