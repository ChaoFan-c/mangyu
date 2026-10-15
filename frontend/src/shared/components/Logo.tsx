import { cnx } from '@/shared/utils/cnx';

/**
 * 忙鱼品牌标记：原创几何鱼形（深色图形 + 品牌黄底），小尺寸下依然可辨。
 * 不使用任何平台商标素材。
 */
export function LogoMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cnx('flex-shrink-0', className)}
      role="img"
      aria-label="忙鱼"
    >
      <rect width="32" height="32" rx="9" fill="#FFE34D" />
      <path d="M11.6 16 6.1 12.1v7.8L11.6 16Z" fill="#202124" />
      <path
        d="M11.4 16c0-3.4 3.3-6.1 7.3-6.1s7.3 2.7 7.3 6.1-3.3 6.1-7.3 6.1-7.3-2.7-7.3-6.1Z"
        fill="#202124"
      />
      <circle cx="21.7" cy="13.6" r="1.3" fill="#FFE34D" />
    </svg>
  );
}

/** 品牌锁定组合：标记 + 名称，可选副标题。 */
export function Logo({
  size = 32,
  showTagline = false,
  className,
}: {
  size?: number;
  showTagline?: boolean;
  className?: string;
}) {
  return (
    <span className={cnx('flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[17px] font-semibold tracking-tight text-ink-900">忙鱼</span>
        {showTagline && (
          <span className="text-2xs text-ink-500">让每一笔闲置交易更有数</span>
        )}
      </span>
    </span>
  );
}
