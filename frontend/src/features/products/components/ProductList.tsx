import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, PackageSearch, Store } from 'lucide-react';
import { ProductType } from '@/features/products/types';
import {
  formatPrice,
  getPriceTypeBadgeClass,
  getPriceTypeLabel,
} from '@/shared/utils/format';
import { getRiskLevelLabel, riskLevelBadgeClass } from '@/shared/utils/risk';
import { cnx } from '@/shared/utils/cnx';

const CONDITION_LABELS: Record<string, string> = {
  new: '全新未拆',
  '99new': '99 新',
  '95new': '95 新',
  '90new': '90 新',
  good: '良好',
  fair: '一般',
  parts: '仅备件',
};

interface ProductListProps {
  products: ProductType[];
  onClick?: (id: number) => void;
}

export function ProductList({ products, onClick }: ProductListProps) {
  if (products.length === 0) {
    return (
      <div className="panel empty-state">
        <PackageSearch className="h-10 w-10 text-ink-300" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium text-ink-700">未找到相关商品</p>
        <p className="hint">试着调整关键词、品类或价格区间</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => {
        const riskLevel = product.risk_level ?? 'insufficient';
        const sellerText = product.seller?.goodRatePercent
          ? `好评率 ${product.seller.goodRatePercent}%`
          : product.seller?.soldCount !== undefined
            ? `已售 ${product.seller.soldCount} 件`
            : product.seller?.name;

        const body = (
          <>
            <ProductThumb product={product} />
            <div className="flex flex-1 flex-col p-4">
              <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink-900">
                {product.name}
              </h3>
              <p className="mt-1.5 truncate text-2xs text-ink-400">
                {[product.category, product.brand, product.condition
                  ? CONDITION_LABELS[product.condition] ?? product.condition
                  : '']
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              <div className="mt-auto pt-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums tracking-tight text-ink-900">
                    {formatPrice(product.price)}
                  </span>
                  <span className={cnx('badge', getPriceTypeBadgeClass(product.price_type))}>
                    {getPriceTypeLabel(product.price_type)}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
                  <span className={cnx('badge', riskLevelBadgeClass[riskLevel])}>
                    {getRiskLevelLabel(riskLevel)}
                  </span>
                  <span className="flex min-w-0 items-center gap-1 text-2xs text-ink-400">
                    {sellerText ? (
                      <>
                        <Store className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                        <span className="truncate">{sellerText}</span>
                      </>
                    ) : (
                      '卖家信息未展示'
                    )}
                  </span>
                </div>
              </div>
            </div>
          </>
        );

        const className =
          'panel group flex flex-col overflow-hidden transition duration-150 ease-out hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lift';

        if (onClick) {
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onClick(product.id)}
              className={cnx(className, 'text-left')}
            >
              {body}
            </button>
          );
        }

        return (
          <Link key={product.id} to={`/product/${product.id}`} className={className}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}

/** 图片统一 4:3 比例；没有图片地址或加载失败时给出明确的占位，不留空白。 */
function ProductThumb({ product }: { product: ProductType }) {
  const source = product.images?.[0] ?? product.image ?? '';
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(source) && !failed;

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
      {showImage ? (
        <img
          src={source}
          alt={product.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-300">
          <ImageOff className="h-6 w-6" aria-hidden="true" />
          <span className="text-2xs">暂无图片</span>
        </div>
      )}
      {product.source_id && (
        <span className="absolute left-2 top-2 rounded-full bg-ink-900/75 px-2 py-0.5 text-2xs font-medium text-white">
          已采集
        </span>
      )}
    </div>
  );
}
