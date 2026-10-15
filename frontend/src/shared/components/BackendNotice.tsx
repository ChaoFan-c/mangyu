import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * 后端不可达时的统一提示。
 * 明确告诉使用者「数据服务没启动」，而不是显示成「没有数据」，
 * 避免把服务故障误读成业务结论。
 */
export function BackendNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-warn-200 bg-warn-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-warn-600"
            aria-hidden="true"
          />
          <div className="text-sm text-warn-800">
            <p className="font-medium">未连接到数据服务</p>
            <p className="mt-1 text-xs leading-relaxed">
              页面没有拿到任何商品数据，这不是「没有结果」，而是后端没有响应。请在项目根目录另开一个终端运行
              <code className="mx-1 rounded bg-white px-1.5 py-0.5 font-mono text-2xs ring-1 ring-warn-200">
                pnpm dev:api
              </code>
              （默认监听 127.0.0.1:3000），然后重试。
            </p>
          </div>
        </div>
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn btn-secondary btn-sm">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            重试
          </button>
        )}
      </div>
    </div>
  );
}
