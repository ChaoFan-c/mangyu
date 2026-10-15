import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Info, Menu, Monitor, RefreshCw, X } from 'lucide-react';
import { LogoMark } from '@/shared/components/Logo';
import { SearchBar } from '@/features/search/components/SearchBar';
import { Sidebar } from '@/features/layout/components/Sidebar';
import { useHealth } from '@/shared/hooks/queries';
import { cnx } from '@/shared/utils/cnx';

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  // 首页把搜索框放在欢迎区域，顶栏不再重复出现同一个入口。
  const showHeaderSearch = pathname !== '/';

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        跳到主要内容
      </a>

      <div className="lg:flex">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-ink-900/40 animate-fade-in lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
            <div className="flex h-16 items-center gap-3 px-4 lg:px-7">
              <button
                type="button"
                onClick={() => setSidebarOpen((open) => !open)}
                className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-gray-100 hover:text-ink-900 lg:hidden"
                aria-label={sidebarOpen ? '关闭导航' : '打开导航'}
                aria-expanded={sidebarOpen}
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              <NavLink to="/" className="flex items-center gap-2 lg:hidden" aria-label="忙鱼首页">
                <LogoMark size={30} />
                <span className="text-base font-semibold tracking-tight text-ink-900">忙鱼</span>
              </NavLink>

              {showHeaderSearch && (
                <div className="min-w-0 flex-1 lg:max-w-lg xl:max-w-xl">
                  <SearchBar />
                </div>
              )}

              <div className="ml-auto hidden items-center gap-2 sm:flex">
                <ServiceStatus />
                <Link to="/collect" className="btn btn-secondary btn-sm">
                  <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
                  本机采集
                </Link>
              </div>
            </div>
          </header>

          <div className="flex items-start gap-2 border-b border-brand-200/70 bg-brand-50/80 px-4 py-2 text-2xs leading-relaxed text-brand-900 lg:px-7">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <p>
              内置演示商品为<strong className="mx-0.5">模拟测试数据</strong>
              ；通过「本机采集」「数据录入」导入的条目来自你提交的公开页面，挂牌价不代表成交价。
            </p>
          </div>

          <main id="main-content" className="min-w-0 flex-1 px-4 py-5 lg:px-7 lg:py-6">
            <div className="mx-auto w-full max-w-[1220px]">
              <Outlet />
            </div>
          </main>

          <footer className="border-t border-gray-200 px-4 py-4 text-2xs text-ink-400 lg:px-7">
            <div className="mx-auto flex w-full max-w-[1220px] flex-wrap items-center justify-between gap-2">
              <span>忙鱼 · 二手商品行情分析与利润测算工具</span>
              <span>结论均为基于当前数据的估算，不构成交易建议</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

/**
 * 数据服务状态：让「后端没启动」和「没有数据」在界面上一眼可辨。
 */
function ServiceStatus() {
  const health = useHealth();
  const state = health.isSuccess ? 'ok' : health.isPending ? 'pending' : 'down';

  const label =
    state === 'ok' ? '数据服务正常' : state === 'pending' ? '正在连接数据服务' : '数据服务未连接';

  return (
    <span
      className={cnx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium',
        state === 'ok' && 'border-gray-200 bg-white text-ink-500',
        state === 'pending' && 'border-gray-200 bg-white text-ink-400',
        state === 'down' && 'border-red-200 bg-red-50 text-red-600'
      )}
      title={health.isError ? (health.error as Error).message : label}
    >
      <span
        aria-hidden="true"
        className={cnx(
          'h-1.5 w-1.5 rounded-full',
          state === 'ok' && 'bg-green-600',
          state === 'pending' && 'bg-ink-300',
          state === 'down' && 'bg-red-500'
        )}
      />
      {label}
      {state === 'down' && (
        <button
          type="button"
          onClick={() => void health.refetch()}
          className="ml-0.5 inline-flex items-center gap-1 rounded text-red-600 underline-offset-2 hover:underline"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          重试
        </button>
      )}
    </span>
  );
}
