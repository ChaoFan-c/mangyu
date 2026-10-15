import { NavLink } from 'react-router-dom';
import {
  Calculator,
  Heart,
  History,
  LayoutDashboard,
  Monitor,
  PackageSearch,
  TrendingUp,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/shared/components/Logo';
import { cnx } from '@/shared/utils/cnx';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ path: string; label: string; icon: LucideIcon; end?: boolean }>;
}> = [
  {
    label: '总览',
    items: [{ path: '/', label: '首页概览', icon: LayoutDashboard, end: true }],
  },
  {
    label: '选品',
    items: [
      { path: '/search', label: '商品搜索', icon: PackageSearch },
      { path: '/opportunities', label: '机会排行榜', icon: TrendingUp },
    ],
  },
  {
    label: '数据',
    items: [
      { path: '/collect', label: '本机采集', icon: Monitor },
      { path: '/import', label: '数据录入', icon: Upload },
    ],
  },
  {
    label: '决策',
    items: [
      { path: '/calculator', label: '利润计算器', icon: Calculator },
      { path: '/favorites', label: '我的收藏', icon: Heart },
      { path: '/history', label: '历史记录', icon: History },
    ],
  },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <aside
      className={cnx(
        'fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col border-r border-gray-200 bg-white',
        'transition-transform duration-200 ease-out',
        'lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-[248px] lg:flex-shrink-0 lg:translate-x-0',
        isOpen ? 'translate-x-0 shadow-pop' : '-translate-x-full'
      )}
      aria-label="主导航"
    >
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <NavLink to="/" onClick={onClose} className="min-w-0">
          <Logo size={32} showTagline />
        </NavLink>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-gray-100 hover:text-ink-700 lg:hidden"
          aria-label="关闭导航"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-2xs font-medium uppercase tracking-wide text-ink-400">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cnx('nav-item', isActive && 'nav-item-active')
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          aria-hidden="true"
                          className={cnx(
                            'absolute left-0 h-5 w-[3px] rounded-r-full transition-opacity',
                            isActive ? 'bg-brand-400' : 'opacity-0'
                          )}
                        />
                        <Icon
                          className={cnx(
                            'h-[18px] w-[18px] flex-shrink-0',
                            isActive ? 'text-ink-900' : 'text-ink-400'
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-gray-100 px-5 py-4">
        <p className="text-2xs leading-relaxed text-ink-400">
          忙鱼 v0.1.0
          <br />
          内置演示商品为模拟测试数据
        </p>
      </div>
    </aside>
  );
}
