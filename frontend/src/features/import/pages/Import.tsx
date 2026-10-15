import { useState, useRef, useCallback } from "react";
import { ArrowLeft, Upload, FileText, Download, Trash2, AlertCircle, CheckCircle, XCircle, Loader2, Plus, Database, FileSpreadsheet, RotateCcw, ListChecks, Link2, Globe2, RefreshCw, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { parse } from "papaparse";
import { cnx } from "@/shared/utils/cnx";
import { formatPrice } from "@/shared/utils/format";
import { CATEGORIES, CATEGORY_GROUPS, isKnownCategoryName } from "@/shared/constants";
import { api, type LinkPreviewPayload } from "@/shared/api/endpoints";
import {
  useImports,
  useDataSources,
  useCheckDataSource,
  useCollectionRuns,
  queryKeys,
} from "@/shared/hooks/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ImportRecord {
  id: string;
  productName: string;
  category: string;
  brand: string;
  model: string;
  condition: string;
  buyPrice: number;
  sellPrice: number;
  buyShipping: number;
  sellShipping: number;
  platformFeeRate: number;
  inspectionFee: number;
  repairFee: number;
  accessoriesFee: number;
  otherFees: number;
  negotiationBuffer: number;
  returnLossBuffer: number;
  returnProbability: number;
  holdDays: number;
  status: "pending" | "success" | "error";
  error?: string;
  rawData: Record<string, string>;
}

const CSV_TEMPLATE_HEADERS = [
  "productName",
  "category",
  "brand",
  "model",
  "condition",
  "buyPrice",
  "sellPrice",
  "buyShipping",
  "sellShipping",
  "platformFeeRate",
  "inspectionFee",
  "repairFee",
  "accessoriesFee",
  "otherFees",
  "negotiationBuffer",
  "returnLossBuffer",
  "returnProbability",
  "holdDays",
];

const SAMPLE_DATA = [
  {
    productName: "Sony A7R5 机身",
    category: "相机机身",
    brand: "Sony",
    model: "A7R5",
    condition: "99new",
    buyPrice: 21000,
    sellPrice: 23000,
    buyShipping: 30,
    sellShipping: 30,
    platformFeeRate: 0.01,
    inspectionFee: 20,
    repairFee: 0,
    accessoriesFee: 10,
    otherFees: 5,
    negotiationBuffer: 50,
    returnLossBuffer: 50,
    returnProbability: 0.1,
    holdDays: 30,
  },
  {
    productName: "NVIDIA RTX 4080 Super 16GB",
    category: "显卡",
    brand: "NVIDIA",
    model: "RTX 4080 Super",
    condition: "95new",
    buyPrice: 8000,
    sellPrice: 9500,
    buyShipping: 20,
    sellShipping: 20,
    platformFeeRate: 0.01,
    inspectionFee: 15,
    repairFee: 0,
    accessoriesFee: 5,
    otherFees: 3,
    negotiationBuffer: 30,
    returnLossBuffer: 30,
    returnProbability: 0.15,
    holdDays: 20,
  },
];

const CONDITION_OPTIONS = ["new", "99new", "95new", "90new", "good", "fair", "parts"];

function sourceStatusMeta(status: string) {
  if (status === 'ok') return { label: '可用', className: 'bg-green-50 text-green-700 border-green-200' };
  if (status === 'error') return { label: '错误', className: 'bg-red-50 text-red-700 border-red-200' };
  if (status === 'unavailable') return { label: '不可用 / 未接入', className: 'bg-warn-50 text-warn-700 border-warn-200' };
  return { label: '未检查', className: 'bg-gray-50 text-gray-600 border-gray-200' };
}

export function ImportPage() {
  const client = useQueryClient();
  const importsQuery = useImports();
  const [dragActive, setDragActive] = useState(false);
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"import" | "link" | "sources" | "history" | "template">("import");
  const [processing, setProcessing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPreview, setLinkPreview] = useState<LinkPreviewPayload | null>(null);
  const [linkForm, setLinkForm] = useState({
    productName: '',
    category: '',
    brand: '',
    model: '',
    condition: '99new',
    priceYuan: '',
    shippingFeeYuan: '0',
    location: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataSourcesQuery = useDataSources();
  const collectionRunsQuery = useCollectionRuns(20);
  const checkDataSource = useCheckDataSource();

  const importRows = useMutation({
    mutationFn: (payload: {
      filename: string;
      rows: Array<Record<string, unknown>>;
      totalRows: number;
      clientErrors: string[];
    }) => api.importRows(payload.filename, payload.rows, payload),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.imports });
      // 导入会新增商品，商品与机会列表需要重新拉取。
      void client.invalidateQueries({ queryKey: ['products'] });
      void client.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });

  const previewLinkMutation = useMutation({
    mutationFn: (url: string) => api.previewLink(url),
    onSuccess: ({ preview }) => {
      setLinkPreview(preview);
      setLinkForm((current) => ({
        ...current,
        productName: preview.metadata?.title ?? current.productName,
        brand: preview.metadata?.brand ?? current.brand,
        model: preview.metadata?.model ?? current.model,
        condition:
          preview.metadata?.condition &&
          CONDITION_OPTIONS.includes(preview.metadata.condition)
            ? preview.metadata.condition
            : current.condition,
        priceYuan:
          preview.metadata?.price && preview.metadata.currency === 'CNY'
            ? String(preview.metadata.price / 100)
            : current.priceYuan,
      }));
      setNotice(
        preview.status === 'ok'
          ? { tone: 'success', text: preview.message }
          : { tone: 'error', text: preview.message }
      );
    },
    onError: (error) => {
      setLinkPreview(null);
      setNotice({ tone: 'error', text: `链接读取失败：${(error as Error).message}` });
    },
  });

  const importLinkMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.importLink(body),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ['products'] });
      void client.invalidateQueries({ queryKey: ['opportunities'] });
      void client.invalidateQueries({ queryKey: ['collection-runs'] });
      setNotice({
        tone: 'success',
        text:
          `链接商品已写入数据库，商品 ID ${result.product.id}。页面价格只作为挂牌价候选，不代表成交价。` +
          (result.warnings.length ? ` 注意：${result.warnings.join('；')}` : ''),
      });
    },
    onError: (error) => {
      setNotice({ tone: 'error', text: `保存失败：${(error as Error).message}` });
    },
  });

  const importHistory = importsQuery.data?.items ?? [];

  const validateRecord = (row: Record<string, string>): { valid: boolean; errors: string[]; data: Partial<ImportRecord> } => {
    const errors: string[] = [];
    const data: Partial<ImportRecord> = {};

    const getNum = (key: string, defaultVal: number = 0) => {
      const val = row[key];
      if (!val || val.trim() === "") return defaultVal;
      const num = Number(val);
      return isNaN(num) ? defaultVal : num;
    };

    // CSV 里所有金额都按「元」填写（与界面一致），入库时统一换算成「分」。
    const getYuan = (key: string, defaultVal = 0) => Math.round(getNum(key, defaultVal) * 100);

    data.productName = row.productName?.trim() || "";
    data.category = row.category?.trim() || "";
    data.brand = row.brand?.trim() || "";
    data.model = row.model?.trim() || "";
    data.condition = row.condition?.trim() || "99new";
    data.buyPrice = getYuan("buyPrice");
    data.sellPrice = getYuan("sellPrice");
    data.buyShipping = getYuan("buyShipping", 30);
    data.sellShipping = getYuan("sellShipping", 30);
    data.platformFeeRate = getNum("platformFeeRate", 0.01);
    data.inspectionFee = getYuan("inspectionFee", 20);
    data.repairFee = getYuan("repairFee", 0);
    data.accessoriesFee = getYuan("accessoriesFee", 10);
    data.otherFees = getYuan("otherFees", 5);
    data.negotiationBuffer = getYuan("negotiationBuffer", 50);
    data.returnLossBuffer = getYuan("returnLossBuffer", 50);
    data.returnProbability = getNum("returnProbability", 0.1);
    data.holdDays = getNum("holdDays", 30);

    if (!data.productName) errors.push("商品名称不能为空");
    if (!data.category) errors.push("品类不能为空");
    // 兼容两层分类：10 个大分类与旧的细分类都接受，避免历史 CSV 失效。
    if (!isKnownCategoryName(data.category)) errors.push(`品类 "${data.category}" 不在支持列表中`);
    if (!data.buyPrice || data.buyPrice <= 0) errors.push("买入价必须大于 0");
    if (!data.sellPrice || data.sellPrice <= 0) errors.push("卖出价必须大于 0");
    if (data.platformFeeRate < 0 || data.platformFeeRate > 1) errors.push("平台费率必须在 0-1 之间");
    if (data.returnProbability < 0 || data.returnProbability > 1) errors.push("退货概率必须在 0-1 之间");

    return { valid: errors.length === 0, errors, data };
  };

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      setNotice({ tone: 'error', text: '请上传 .csv 或 .txt 格式的文件。' });
      return;
    }

    setProcessing(true);
    parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (result) => {
        const newRecords: ImportRecord[] = result.data.map((row: any, index: number) => {
          const { valid, errors, data } = validateRecord(row);
          return {
            id: `import-${Date.now()}-${index}`,
            productName: data.productName || "",
            category: data.category || "",
            brand: data.brand || "",
            model: data.model || "",
            condition: data.condition || "99new",
            buyPrice: data.buyPrice || 0,
            sellPrice: data.sellPrice || 0,
            buyShipping: data.buyShipping || 3000,
            sellShipping: data.sellShipping || 3000,
            platformFeeRate: data.platformFeeRate || 0.01,
            inspectionFee: data.inspectionFee || 2000,
            repairFee: data.repairFee || 0,
            accessoriesFee: data.accessoriesFee || 1000,
            otherFees: data.otherFees || 500,
            negotiationBuffer: data.negotiationBuffer || 5000,
            returnLossBuffer: data.returnLossBuffer || 5000,
            returnProbability: data.returnProbability || 0.1,
            holdDays: data.holdDays || 30,
            status: valid ? "pending" : "error",
            error: errors.join("; "),
            rawData: row,
          };
        });
        setRecords(newRecords);
        setShowPreview(true);
        setProcessing(false);
      },
      error: (error) => {
        setNotice({ tone: 'error', text: `CSV 解析失败：${error.message}` });
        setProcessing(false);
      },
    });
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
      e.target.value = "";
    }
  };

  const handleImport = () => {
    const pendingRecords = records.filter((r) => r.status === "pending");
    if (pendingRecords.length === 0) {
      setNotice({ tone: 'error', text: '没有可导入的有效数据，请先修正错误行。' });
      return;
    }

    setProcessing(true);
    const filename = `import_${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "")}.csv`;

    // 金额已经是「分」，后端按同一口径入库。
    const rows = pendingRecords.map((record) => ({
      productName: record.productName,
      category: record.category,
      brand: record.brand,
      model: record.model,
      condition: record.condition,
      buyPrice: record.buyPrice,
      description: `来自 CSV 导入（${filename}），价格类型为「手动录入」。`,
    }));

    // 前端拦下的错误行也要报给后端，保证导入历史与用户看到的结果一致。
    const clientErrors = records
      .map((record, index) =>
        record.status === 'error' ? `第 ${index + 1} 行：${record.error ?? '校验未通过'}` : null
      )
      .filter((item): item is string => item !== null);

    importRows.mutate(
      { filename, rows, totalRows: records.length, clientErrors },
      {
        onSuccess: (result) => {
          setRecords([]);
          setShowPreview(false);
          setProcessing(false);
          setNotice({
            tone: result.failedRows > 0 ? 'error' : 'success',
            text:
              `导入完成：成功 ${result.successRows} 条，失败 ${result.failedRows} 条。` +
              (result.failedRows > 0
                ? ' 失败原因见「导入历史」。'
                : ' 新数据已写入本地数据库，可在「商品搜索」中检索到（价格类型标记为「手动录入」）。'),
          });
        },
        onError: (error) => {
          setProcessing(false);
          const message = (error as Error).message ?? '未知错误';
          setNotice({
            tone: 'error',
            text: message.includes('无法连接后端')
              ? '导入失败：未连接到数据服务，请先运行 pnpm dev:api。'
              : `导入失败：${message}`,
          });
        },
      }
    );
  };

  const handleClearRecords = () => {
    setRecords([]);
    setShowPreview(false);
  };

  const handleRemoveRecord = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleDownloadTemplate = () => {
    const csv = [CSV_TEMPLATE_HEADERS.join(","), ...SAMPLE_DATA.map((row) => CSV_TEMPLATE_HEADERS.map((h) => row[h as keyof typeof row]).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "忙鱼_CSV导入模板.csv";
    link.click();
  };

  const handleDownloadSample = () => {
    const csv = [CSV_TEMPLATE_HEADERS.join(","), ...SAMPLE_DATA.map((row) => CSV_TEMPLATE_HEADERS.map((h) => row[h as keyof typeof row]).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "忙鱼_示例数据.csv";
    link.click();
  };

  const handlePreviewLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      setNotice({ tone: 'error', text: '请先填写公开商品链接。' });
      return;
    }
    previewLinkMutation.mutate(url);
  };

  const handleImportLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      setNotice({ tone: 'error', text: '请先填写公开商品链接。' });
      return;
    }
    if (!linkForm.category) {
      setNotice({ tone: 'error', text: '请选择商品品类后再保存。' });
      return;
    }
    const rawPrice = linkForm.priceYuan.trim();
    const price = rawPrice ? Math.round(Number(rawPrice) * 100) : undefined;
    if (price !== undefined && (!Number.isFinite(price) || price <= 0)) {
      setNotice({ tone: 'error', text: '手动价格必须是大于 0 的金额。' });
      return;
    }
    const shippingFee = Math.round(Number(linkForm.shippingFeeYuan || '0') * 100);
    if (!Number.isFinite(shippingFee) || shippingFee < 0) {
      setNotice({ tone: 'error', text: '运费必须是不小于 0 的金额。' });
      return;
    }

    importLinkMutation.mutate({
      url,
      productName: linkForm.productName.trim() || undefined,
      category: linkForm.category,
      brand: linkForm.brand.trim() || undefined,
      model: linkForm.model.trim() || undefined,
      condition: linkForm.condition,
      price,
      shippingFee,
      location: linkForm.location.trim() || undefined,
    });
  };

  const resetLinkForm = () => {
    setLinkUrl('');
    setLinkPreview(null);
    setLinkForm({
      productName: '',
      category: '',
      brand: '',
      model: '',
      condition: '99new',
      priceYuan: '',
      shippingFeeYuan: '0',
      location: '',
    });
  };

  const pendingCount = records.filter((r) => r.status === "pending").length;
  const errorCount = records.filter((r) => r.status === "error").length;

  return (
    <div className="space-y-6">
      {notice && (
        <div
          role="status"
          className={cnx(
            'flex items-start justify-between gap-3 rounded-xl border p-3 text-sm',
            notice.tone === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          )}
        >
          <span className="flex items-start gap-2">
            {notice.tone === 'success' ? (
              <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            )}
            {notice.text}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded p-0.5 hover:bg-black/5"
            aria-label="关闭提示"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-4">
        <Link to="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <nav className="flex gap-1 text-sm text-gray-500 mb-1">
            <Link to="/" className="hover:text-gray-700">首页</Link>
            <span>/</span>
            <span className="text-gray-900">数据录入</span>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 flex items-center gap-2">
            <Upload className="w-6 h-6 text-brand-700" />
            数据录入与导入
          </h1>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100">
        <div className="border-b border-gray-100">
          <nav className="flex overflow-x-auto" aria-label="页面标签">
            {(
              [
                { key: "import", label: "CSV 导入", icon: Upload, count: records.length },
                { key: "link", label: "链接导入", icon: Link2 },
                {
                  key: "sources",
                  label: "数据源状态",
                  icon: Globe2,
                  count: collectionRunsQuery.data?.items.length,
                },
                { key: "history", label: "导入历史", icon: Database, count: importHistory.length },
                { key: "template", label: "模板下载", icon: FileText },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  aria-current={active ? 'page' : undefined}
                  className={cnx(
                    "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-colors",
                    active
                      ? "border-brand-400 text-ink-900"
                      : "border-transparent text-ink-500 hover:border-gray-300 hover:text-ink-900"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                  {"count" in tab && tab.count ? ` (${tab.count})` : ""}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "import" && (
            <div className="space-y-6">
              <div
                className={cnx(
                  "border-2 border-dashed rounded-xl p-8 text-center transition-colors",
                  dragActive ? "border-brand-400 bg-brand-50" : "border-gray-300 hover:border-brand-300"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="csv-upload"
                />
                <label htmlFor="csv-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-4">
                    <Upload
                      className={cnx("w-12 h-12", dragActive ? "text-brand-700" : "text-gray-400")}
                    />
                    <div>
                      <p className="text-lg font-medium text-gray-900">拖拽 CSV 文件到此处，或点击选择</p>
                      <p className="text-sm text-gray-500 mt-1">支持 .csv、.txt 格式，建议使用 UTF-8 编码</p>
                    </div>
                  </div>
                </label>
                {processing && <Loader2 className="w-8 h-8 animate-spin text-brand-800 mx-auto mt-4" />}
              </div>

              <div className="flex flex-wrap gap-3">
                <button onClick={handleDownloadTemplate} className="btn btn-secondary">
                  <FileText className="w-4 h-4" /> 下载模板
                </button>
                <button onClick={handleDownloadSample} className="btn btn-secondary">
                  <FileSpreadsheet className="w-4 h-4" /> 下载示例数据
                </button>
              </div>

              {showPreview && records.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">预览数据 ({records.length} 条，{pendingCount} 待导入，{errorCount} 错误)</h3>
                    <div className="flex items-center gap-2">
                      <button onClick={handleClearRecords} className="btn btn-secondary items-center gap-1">
                        <Trash2 className="w-3.5 h-3.5" /> 清空
                      </button>
                      <button onClick={handleImport} disabled={pendingCount === 0 || processing} className="btn btn-primary items-center gap-2">
                        <Database className="w-4 h-4" /> 确认导入
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">状态</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商品名称</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">品类</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">品牌/型号</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">成色</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">买入价</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">卖出价</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">费率/概率</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">持有天数</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {records.map((r) => (
                          <tr key={r.id} className={cnx(r.status === "error" ? "bg-red-50" : "hover:bg-gray-50")}>
                            <td className="px-3 py-2">
                              {r.status === "pending" && <CheckCircle className="w-5 h-5 text-green-500" />}
                              {r.status === "error" && <AlertCircle className="w-5 h-5 text-red-500" />}
                              {r.status === "success" && <CheckCircle className="w-5 h-5 text-green-600" />}
                            </td>
                            <td className="px-3 py-2 font-medium text-gray-900 truncate max-w-[200px]">{r.productName}</td>
                            <td className="px-3 py-2 text-gray-600">{r.category}</td>
                            <td className="px-3 py-2 text-gray-600">{r.brand} / {r.model}</td>
                            <td className="px-3 py-2 text-gray-600">{r.condition}</td>
                            <td className="px-3 py-2 text-gray-900">{formatPrice(r.buyPrice)}</td>
                            <td className="px-3 py-2 text-gray-900">{formatPrice(r.sellPrice)}</td>
                            <td className="px-3 py-2 text-gray-500">
                              费率: {(r.platformFeeRate * 100).toFixed(1)}%<br />
                              退货率: {(r.returnProbability * 100).toFixed(0)}%
                            </td>
                            <td className="px-3 py-2 text-gray-600">{r.holdDays}</td>
                            <td className="px-3 py-2">
                              {r.status === "error" && (
                                <button onClick={() => handleRemoveRecord(r.id)} className="text-red-600 hover:text-red-800" title={r.error}>
                                  <XCircle className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {errorCount > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <h4 className="font-medium text-red-800 mb-2 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" /> 发现 {errorCount} 条错误数据，将不会被导入
                      </h4>
                      <ul className="space-y-1 text-sm text-red-700 max-h-40 overflow-auto">
                        {records.filter((r) => r.status === "error").map((r, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span>• 第 {records.indexOf(r) + 1} 行:</span>
                            <span>{r.error}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "link" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-warn-200 bg-warn-50 p-4 text-sm text-warn-800">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">仅读取用户逐条提交的公开页面，不使用登录态</p>
                    <p className="mt-1 text-warn-700">
                      页面解析价只标记为挂牌价候选。读取失败时可手动补全，但不会把补全值当作成交价。
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-4">
                  <div>
                    <label htmlFor="link-url" className="mb-1 block text-sm font-medium text-gray-700">
                      公开商品链接
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="link-url"
                        type="url"
                        value={linkUrl}
                        onChange={(event) => setLinkUrl(event.target.value)}
                        placeholder="https://..."
                        className="field min-w-0 flex-1"
                      />
                      <button
                        type="button"
                        onClick={handlePreviewLink}
                        disabled={previewLinkMutation.isPending}
                        className="btn btn-primary"
                      >
                        {previewLinkMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Globe2 className="h-4 w-4" />
                        )}
                        读取
                      </button>
                    </div>
                  </div>

                  {linkPreview && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-gray-900">
                          {linkPreview.metadata?.title ?? '页面信息不完整，可手动补全'}
                        </p>
                        <span
                          className={cnx(
                            'rounded-full border px-2 py-0.5 text-xs',
                            linkPreview.status === 'ok'
                              ? 'border-green-200 bg-green-50 text-green-700'
                              : 'border-warn-200 bg-warn-50 text-warn-700'
                          )}
                        >
                          {linkPreview.status === 'ok' ? '已读取' : '需人工确认'}
                        </span>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <div>
                          <dt>页面报价</dt>
                          <dd className="mt-0.5 font-medium text-gray-900">
                            {linkPreview.metadata?.price
                              ? `${formatPrice(linkPreview.metadata.price)} ${linkPreview.metadata.currency ?? ''}`
                              : '未解析到'}
                          </dd>
                        </div>
                        <div>
                          <dt>价格类型</dt>
                          <dd className="mt-0.5 font-medium text-gray-900">
                            {linkPreview.metadata?.price ? '挂牌价候选' : '待手动填写'}
                          </dd>
                        </div>
                        <div>
                          <dt>品牌 / 型号</dt>
                          <dd className="mt-0.5 font-medium text-gray-900">
                            {[linkPreview.metadata?.brand, linkPreview.metadata?.model].filter(Boolean).join(' / ') || '未解析到'}
                          </dd>
                        </div>
                        <div>
                          <dt>读取时间</dt>
                          <dd className="mt-0.5 font-medium text-gray-900">
                            {new Date().toLocaleString('zh-CN')}
                          </dd>
                        </div>
                      </dl>
                      {linkPreview.metadata?.currency && linkPreview.metadata.currency !== 'CNY' && (
                        <p className="mt-3 text-xs text-warn-700">
                          页面报价币种不是人民币，保存前请手动填写人民币价格。
                        </p>
                      )}
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-gray-700">商品名称</label>
                      <input
                        value={linkForm.productName}
                        onChange={(event) => setLinkForm({ ...linkForm, productName: event.target.value })}
                        placeholder="页面未读取成功时必填"
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">品类</label>
                      <select
                        value={linkForm.category}
                        onChange={(event) => setLinkForm({ ...linkForm, category: event.target.value })}
                        className="field"
                      >
                        <option value="">请选择</option>
                        <optgroup label="闲鱼 10 大类">
                          {CATEGORY_GROUPS.map((group) => (
                            <option key={group.id} value={group.name}>{group.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="细分品类（旧数据）">
                          {CATEGORIES.map((category) => (
                            <option key={category.id} value={category.name}>{category.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">成色</label>
                      <select
                        value={linkForm.condition}
                        onChange={(event) => setLinkForm({ ...linkForm, condition: event.target.value })}
                        className="field"
                      >
                        {CONDITION_OPTIONS.map((condition) => (
                          <option key={condition} value={condition}>{condition}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">品牌</label>
                      <input
                        value={linkForm.brand}
                        onChange={(event) => setLinkForm({ ...linkForm, brand: event.target.value })}
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">型号</label>
                      <input
                        value={linkForm.model}
                        onChange={(event) => setLinkForm({ ...linkForm, model: event.target.value })}
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">人民币价格（元）</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={linkForm.priceYuan}
                        onChange={(event) => setLinkForm({ ...linkForm, priceYuan: event.target.value })}
                        placeholder="留空则使用页面报价"
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">买入运费（元）</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={linkForm.shippingFeeYuan}
                        onChange={(event) => setLinkForm({ ...linkForm, shippingFeeYuan: event.target.value })}
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">所在地</label>
                      <input
                        value={linkForm.location}
                        onChange={(event) => setLinkForm({ ...linkForm, location: event.target.value })}
                        className="field"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleImportLink}
                      disabled={importLinkMutation.isPending}
                      className="btn btn-primary inline-flex items-center gap-2 text-sm"
                    >
                      {importLinkMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Database className="h-4 w-4" />
                      )}
                      保存到商品库
                    </button>
                    <button
                      type="button"
                      onClick={resetLinkForm}
                      className="btn btn-secondary items-center gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      清空
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeTab === "sources" && (
            <div className="space-y-6">
              {dataSourcesQuery.isLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 正在读取数据源
                </div>
              ) : dataSourcesQuery.isError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  数据源状态读取失败：{(dataSourcesQuery.error as Error).message}
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-3">
                  {dataSourcesQuery.data?.items.map((source) => {
                    const status = sourceStatusMeta(source.status);
                    return (
                      <div key={source.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-medium text-gray-900">{source.name}</h3>
                            <p className="mt-1 text-xs text-gray-500">{source.mode}</p>
                          </div>
                          <span className={cnx('rounded-full border px-2 py-0.5 text-xs', status.className)}>
                            {status.label}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-gray-600">{source.message}</p>
                        <p className="mt-3 text-xs leading-relaxed text-gray-500">{source.legalNote}</p>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {source.capabilities.map((capability) => (
                            <span key={capability} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                              {capability}
                            </span>
                          ))}
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            {source.checkedAt ? new Date(source.checkedAt).toLocaleString('zh-CN') : '尚未检查'}
                          </span>
                          <button
                            type="button"
                            onClick={() => checkDataSource.mutate(source.id)}
                            disabled={!source.enabled || checkDataSource.isPending}
                            className="btn btn-secondary items-center gap-1"
                          >
                            <RefreshCw className={cnx('h-3.5 w-3.5', checkDataSource.isPending && 'animate-spin')} />
                            检查
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="overflow-x-auto">
                <div className="mb-3 flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-gray-500" />
                  <h3 className="font-medium text-gray-900">最近采集流水</h3>
                </div>
                {collectionRunsQuery.data?.items.length ? (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">来源</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">状态</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">查询</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">新增</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {collectionRunsQuery.data.items.map((run) => (
                        <tr key={run.id}>
                          <td className="px-3 py-2 text-gray-700">{run.sourceId}</td>
                          <td className="px-3 py-2 text-gray-700">{sourceStatusMeta(run.status).label}</td>
                          <td className="px-3 py-2 text-gray-500">{run.query || '-'}</td>
                          <td className="px-3 py-2 text-gray-700">{run.newProducts} 商品 / {run.newPriceRecords} 价格</td>
                          <td className="px-3 py-2 text-gray-500">{new Date(run.createdAt).toLocaleString('zh-CN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                    暂无采集流水
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-4">
              {importHistory.length === 0 ? (
                <div className="text-center py-12">
                  <Database className="w-16 h-16 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">暂无导入历史</p>
                  <p className="text-sm text-gray-400 mt-1">完成首次 CSV 导入后将显示在此</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">文件名</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">总行数</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">成功</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">失败</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">导入时间</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">错误详情</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importHistory.map((h) => (
                        <tr key={h.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{h.filename}</td>
                          <td className="px-4 py-3 text-gray-600">{h.totalRows}</td>
                          <td className="px-4 py-3 text-green-600 font-medium">{h.successRows}</td>
                          <td className="px-4 py-3 text-red-600 font-medium">{h.failedRows}</td>
                          <td className="px-4 py-3 text-gray-500">{new Date(h.createdAt).toLocaleString("zh-CN")}</td>
                          <td className="px-4 py-3">
                            {h.errors.length > 0 ? (
                              <details className="text-sm">
                                <summary className="cursor-pointer text-red-600 hover:text-red-800">
                                  查看 {h.errors.length} 个错误
                                </summary>
                                <ul className="mt-1 max-w-md space-y-0.5 text-xs text-red-700">
                                  {h.errors.map((message, index) => (
                                    <li key={index}>• {message}</li>
                                  ))}
                                </ul>
                              </details>
                            ) : (
                              <span className="text-green-600">无错误</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "template" && (
            <div className="space-y-6">
              <div className="bg-brand-50 border border-brand-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-brand-800 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5" /> CSV 导入模板说明
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                  {CSV_TEMPLATE_HEADERS.map((h) => (
                    <div key={h} className="bg-white p-3 rounded-lg border border-gray-100">
                      <code className="font-mono text-brand-800">{h}</code>
                      <p className="text-gray-600 mt-1">
                        {h === "productName" && "商品显示名称（必填）"}
                        {h === "category" && "品类：相机机身/镜头/显卡/无人机/手机/平板/笔记本（必填）"}
                        {h === "brand" && "品牌名称"}
                        {h === "model" && "具体型号"}
                        {h === "condition" && "成色：new/99new/95new/90new/good/fair/parts"}
                        {h === "buyPrice" && "买入价，单位「元」，必填，如 21000"}
                        {h === "sellPrice" && "预计卖出价，单位「元」，必填，如 23000"}
                        {h === "buyShipping" && "买入运费，单位「元」，默认 30"}
                        {h === "sellShipping" && "卖出运费，单位「元」，默认 30"}
                        {h === "platformFeeRate" && "平台手续费率（0-1，默认 0.01）"}
                        {h === "inspectionFee" && "验货费用，单位「元」，默认 20"}
                        {h === "repairFee" && "维修费用，单位「元」，默认 0"}
                        {h === "accessoriesFee" && "配件/包装成本，单位「元」，默认 10"}
                        {h === "otherFees" && "其他成本，单位「元」，默认 5"}
                        {h === "negotiationBuffer" && "预计议价空间，单位「元」，默认 50"}
                        {h === "returnLossBuffer" && "退货损失准备金，单位「元」，默认 50"}
                        {h === "returnProbability" && "退货概率（0-1，默认 0.1）"}
                        {h === "holdDays" && "预计持有天数（默认 30）"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" /> 必填字段检查清单
                </h3>
                <ul className="space-y-2 text-sm text-green-700">
                  <li>✅ productName - 商品名称</li>
                  <li>✅ category - 必须是 7 大品类之一</li>
                  <li>✅ buyPrice - 买入价，单位：分</li>
                  <li>✅ sellPrice - 预计卖出价，单位：分</li>
                  <li>🔶 platformFeeRate - 建议填写，默认 1%</li>
                  <li>🔶 returnProbability - 建议填写，默认 10%</li>
                  <li>⚠️ 所有金额字段单位为「元」，支持小数，如 21000 或 20999.5</li>
                  <li>⚠️ CSV 必须包含表头行，编码建议 UTF-8</li>
                  <li>⚠️ 导入前会自动验证，错误行不会被导入</li>
                </ul>
              </div>

              <div className="flex gap-4">
                <button onClick={handleDownloadTemplate} className="btn btn-primary">
                  <Download className="w-5 h-5" /> 下载空白模板
                </button>
                <button onClick={handleDownloadSample} className="btn btn-secondary items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" /> 下载带示例数据的模板
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">使用指南</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
          <div className="panel p-4">
            <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> CSV 批量导入</h4>
            <ul className="space-y-1">
              <li>• 准备 CSV 文件，包含表头行</li>
              <li>• 金额字段单位为「元」，入库时自动换算为「分」</li>
              <li>• 必填：商品名称、品类、买入价、卖出价</li>
              <li>• 可选字段缺失将使用默认值</li>
              <li>• 导入前自动验证，错误行标红提示</li>
            </ul>
          </div>
          <div className="panel p-4">
            <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2"><Plus className="w-5 h-5" /> 手动单条录入</h4>
            <ul className="space-y-1">
              <li>• 在「我的收藏」页面点击「手动添加」</li>
              <li>• 适合零散记录、临时记录</li>
              <li>• 可直接关联到利润计算器</li>
              <li>• 支持记录实际买卖价和利润</li>
            </ul>
          </div>
          <div className="panel p-4">
            <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2"><ListChecks className="w-5 h-5" /> 字段说明</h4>
            <ul className="space-y-1">
              <li>• 买入/卖出运费：物流成本</li>
              <li>• 平台费率：闲鱼约 1%，转转约 0.6%</li>
              <li>• 验货费：闲鱼验货约 20-50 元</li>
              <li>• 议价空间：预留的还价余地</li>
              <li>• 退货准备金：退货时的运费+折损</li>
            </ul>
          </div>
          <div className="panel p-4">
            <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2"><RotateCcw className="w-5 h-5" /> 数据流转</h4>
            <ul className="space-y-1">
              <li>• 导入 → 预览验证 → 确认入库</li>
              <li>• 入库后可在收藏/计算器中使用</li>
              <li>• 导入历史可追溯，包含成功/失败行数</li>
              <li>• 本地存储，定期导出 CSV 备份</li>
              <li>• 后端上线后自动同步云端</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
