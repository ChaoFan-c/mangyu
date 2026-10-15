import { createSeededRandom, hashSeed } from './random.ts';
import type {
  EvidenceStatus,
  MockPriceRecord,
  RiskLevel,
  SellerProfile,
} from './types.ts';

export type { EvidenceStatus, RiskLevel };

export interface RiskEvidence {
  id: string;
  dimension: string;
  status: EvidenceStatus;
  description: string;
  source: string;
  /** 该条证据对结论的实际影响说明。 */
  impact: string;
}

export interface RiskAssessmentOutput {
  risk_level: RiskLevel;
  score: number;
  /** 已获得有效证据的维度占比，0-1。分数低时不得给出确定性结论。 */
  confidence: number;
  evidence: RiskEvidence[];
  unverified_risks: string[];
  recommended_actions: string[];
  calculation_basis: string;
}

export interface RiskAssessmentInput {
  category: string;
  price: number;
  priceRecords?: MockPriceRecord[];
  sellerInfo?: SellerProfile;
  images?: string[];
  description?: string;
  /**
   * 用户自行填写的行情价（分）。
   * 只有它才能用作「参考市场价」；未设置时价格偏离维度一律标为无法确认，
   * 不再用模拟成交价冒充市场行情。
   */
  marketPrice?: number;
}

/** 各品类的核心风险维度。这些是「需要核实什么」，不是「已经核实了」。 */
const CATEGORY_RISK_DIMENSIONS: Record<string, string[]> = {
  相机机身: [
    '快门数（机械快门寿命）',
    '传感器脏点 / 坏点',
    '跌摔与冲击痕迹',
    '进水 / 受潮痕迹',
    '固件版本是否异常（灰市固件）',
    '镜头卡口磨损程度',
  ],
  镜头: [
    '镜片霉斑 / 内部雾气',
    '镜片刮痕与镀膜损伤',
    '对焦电机异响 / 卡顿',
    '光圈叶片油污',
    '是否拼装 / 翻新',
    '防尘防滴胶圈老化',
  ],
  显卡: [
    '是否长期满载（矿卡）',
    '维修 / 返修记录',
    'BIOS 是否被非官方刷写',
    '核心与显存温度表现',
    '显存颗粒是否被替换 / 降级',
    '电源接口是否氧化烧蚀',
  ],
  无人机: [
    '激活与账号绑定状态是否可解绑',
    '飞行记录与撞机历史',
    '云台 / 相机模组校准',
    '电池循环次数与鼓包',
    '遥控器与配件是否齐全',
    '机臂 / 螺旋桨损伤',
  ],
  手机: [
    'ID 锁 / 账号锁 / MDM 锁',
    '屏幕是否拆修或非原装',
    '电池健康度与循环次数',
    '后盖 / 中框是否更换',
    '主板维修 / 进水腐蚀',
    'Face ID / 基带功能是否正常',
  ],
  平板: [
    'ID 锁 / 账号锁 / MDM 锁',
    '屏幕是否拆修或非原装',
    '电池健康度与循环次数',
    '键盘 / 手写笔配套情况',
    '主板维修 / 进水腐蚀',
    '扬声器 / 麦克风功能',
  ],
  笔记本: [
    '屏幕 / 主板维修记录',
    '电池循环次数与健康度',
    '散热模组是否改装',
    '内存 / 硬盘是否扩容替换',
    '键盘 / 触控板功能',
    '外观磨损与喷漆翻新',
  ],
};

const GENERIC_DIMENSIONS = ['序列号与包装一致性', '功能完整性', '外观与描述一致性'];

/**
 * 风险评估的核心原则：
 * 1. 没有证据就标 unknown，绝不因为「卖家评分高」「图片好看」「价格低」推断为正品。
 * 2. 每一条结论都必须能追溯到具体证据和来源。
 * 3. 证据不足时风险等级为 insufficient，并说明还缺什么。
 */
export function assessRisk(input: RiskAssessmentInput): RiskAssessmentOutput {
  const { category, price, sellerInfo, images, description, marketPrice } = input;
  const dimensions = CATEGORY_RISK_DIMENSIONS[category] ?? GENERIC_DIMENSIONS;
  const seed = hashSeed(category, Math.round(price / 100));
  const rand = createSeededRandom(seed);

  const evidence: RiskEvidence[] = [];
  const unverified: string[] = [];

  // --- 品类维度：演示数据里只有「模拟验货记录」这一种来源，且必须标明是模拟的 ---
  dimensions.forEach((dimension, index) => {
    const roll = rand();
    let status: EvidenceStatus;
    if (roll < 0.45) status = 'pass';
    else if (roll < 0.7) status = 'warning';
    else if (roll < 0.82) status = 'fail';
    else status = 'unknown';

    const source = '模拟验货记录（演示数据，非真实检测）';
    evidence.push({
      id: `cat-${index}`,
      dimension,
      status,
      description:
        status === 'unknown'
          ? `暂无 ${dimension} 的可核实信息，需要卖家补充证明或线下验货`
          : `${dimension}：模拟核验结果为「${statusLabel(status)}」`,
      source,
      impact: impactLabel(status),
    });

    if (status === 'unknown') unverified.push(`${dimension} 缺乏可核实证据`);
  });

  // --- 价格偏离度：只对「用户自己填写的行情价」做比较 ---
  const priceDeviation = evaluatePriceDeviation(price, marketPrice);
  evidence.push({
    id: 'price-deviation',
    dimension: '价格偏离行情价',
    status: priceDeviation.status,
    description: priceDeviation.description,
    source: priceDeviation.source,
    impact: impactLabel(priceDeviation.status),
  });
  if (priceDeviation.status === 'unknown') unverified.push('未设置行情价，无法判断价格是否异常');

  // --- 信息完整度：图片与描述是否提供 ---
  const imageCount = images?.length ?? 0;
  const hasDescription = !!description && description.trim().length >= 30;
  const completeness = evaluateCompleteness(imageCount, hasDescription);
  evidence.push(...completeness);
  if (imageCount === 0) unverified.push('未提供实拍图，无法核对成色与配件');
  if (!hasDescription) unverified.push('缺少详细描述，成色与配件信息不完整');

  // --- 卖家信誉：只作为参考信号，不能单独作为真伪结论 ---
  const sellerEvidence = evaluateSeller(sellerInfo);
  evidence.push(sellerEvidence.evidence);
  if (sellerEvidence.status === 'unknown') unverified.push('缺少卖家交易记录，无法评估交易可靠性');

  // --- 平台保障：默认未知，除非明确提供 ---
  evidence.push({
    id: 'platform-protection',
    dimension: '平台担保与售后',
    status: 'unknown',
    description: '尚未确认该商品是否支持平台担保交易、验货服务与七天无理由退货',
    source: '待核实',
    impact: '不确定的售后条件会放大实际损失风险',
  });
  unverified.push('未确认是否支持平台担保、验货与售后');

  const known = evidence.filter((item) => item.status !== 'unknown');
  const confidence = Math.round((known.length / evidence.length) * 100) / 100;
  const score = computeScore(evidence);
  const riskLevel = deriveRiskLevel(score, confidence, evidence);

  return {
    risk_level: riskLevel,
    score,
    confidence,
    evidence,
    unverified_risks: dedupe(unverified),
    recommended_actions: buildActions(category, evidence),
    calculation_basis: buildBasis(category, evidence, known.length, score, confidence, riskLevel),
  };
}

function evaluatePriceDeviation(price: number, marketPrice?: number) {
  if (marketPrice === undefined || marketPrice <= 0) {
    return {
      status: 'unknown' as EvidenceStatus,
      description: '未设置行情价，无法判断当前要价是否偏离参考区间（行情价需由你手动填写）',
      source: '未设置行情价',
    };
  }
  const deviation = Math.abs(price - marketPrice) / marketPrice;
  const percent = (deviation * 100).toFixed(1);
  const status: EvidenceStatus =
    deviation < 0.1 ? 'pass' : deviation < 0.25 ? 'warning' : 'fail';
  return {
    status,
    description: `当前要价与你的行情价相差 ${percent}%（行情价 ${(marketPrice / 100).toFixed(0)} 元）`,
    source: '用户手动填写的行情价',
  };
}

function evaluateCompleteness(imageCount: number, hasDescription: boolean): RiskEvidence[] {
  return [
    {
      id: 'images',
      dimension: '实拍图与细节图',
      status: imageCount >= 3 ? 'pass' : imageCount > 0 ? 'warning' : 'unknown',
      description:
        imageCount >= 3
          ? `提供了 ${imageCount} 张实拍图，但仍需核对序列号与接口特写`
          : imageCount > 0
            ? `仅 ${imageCount} 张图片，不足以判断成色与配件`
            : '未提供实拍图，任何基于图片的判断都不成立',
      source: imageCount > 0 ? '卖家上传图片（模拟）' : '暂无',
      impact: imageCount > 0 ? '图片可作为线索，但不能证明真伪' : '缺少图片会显著增加描述不符风险',
    },
    {
      id: 'description',
      dimension: '描述完整度',
      status: hasDescription ? 'pass' : 'unknown',
      description: hasDescription
        ? '提供了较详细的文字描述'
        : '描述信息不足 30 字，无法确认成色、配件与使用历史',
      source: hasDescription ? '卖家描述（模拟）' : '暂无',
      impact: hasDescription ? '描述完整但仍需与实物核对' : '信息缺失会掩盖隐性故障',
    },
  ];
}

/** 单个信誉信号按 0-3 计分；未展示的信号不参与，也不按 0 分计入。 */
function scoreZhima(level: string): { score: number; text: string } {
  if (/极好/.test(level)) return { score: 3, text: `芝麻信用「${level}」` };
  if (/优秀/.test(level)) return { score: 2, text: `芝麻信用「${level}」` };
  if (/良好/.test(level)) return { score: 1, text: `芝麻信用「${level}」` };
  return { score: 0, text: `芝麻信用「${level}」（低于良好）` };
}

function scoreGoodRate(percent: number): { score: number; text: string } {
  const text = `好评率 ${percent}%`;
  if (percent >= 99) return { score: 3, text };
  if (percent >= 97) return { score: 2, text };
  if (percent >= 95) return { score: 1, text };
  return { score: 0, text: `${text}（低于 95%）` };
}

function scoreSoldCount(count: number): { score: number; text: string } {
  const text = `已售 ${count} 件`;
  if (count >= 50) return { score: 3, text };
  if (count >= 10) return { score: 2, text };
  if (count >= 1) return { score: 1, text };
  return { score: 0, text: `${text}（没有成交记录）` };
}

/**
 * 卖家信誉维度。
 *
 * 规则（可解释、可复算）：
 * - 只用页面上实际展示的信号：芝麻信用等级、好评率、已售/成交件数，以及与它们重复的评分、交易数二选一。
 * - 每个信号独立计 0-3 分；某个信号页面没展示就不参与计算，绝不按 0 分计入。
 * - 判定用「每个信号的平均分」（0-3）：≥2.5 通过、≥1 需关注、低于 1 存在风险。
 *   用平均分而不是得分率，是为了避免只拿到少数信号时被过度惩罚。
 * - 一个信号只算一次；同一信息（如成交件数与历史交易数）只取其中一个，避免重复计分。
 * - 完全拿不到任何信号时标为「无法确认」，不等于卖家信誉差。
 */
function evaluateSeller(seller?: SellerProfile): { evidence: RiskEvidence; status: EvidenceStatus } {
  const parts: Array<{ score: number; text: string; max: number }> = [];

  if (seller?.zhimaLevel) {
    parts.push({ ...scoreZhima(seller.zhimaLevel), max: 3 });
  }
  if (typeof seller?.goodRatePercent === 'number' && Number.isFinite(seller.goodRatePercent)) {
    parts.push({ ...scoreGoodRate(seller.goodRatePercent), max: 3 });
  }
  // 成交件数与历史交易数是同一类信息，只取其一，避免重复计分。
  const dealCount =
    typeof seller?.soldCount === 'number'
      ? seller.soldCount
      : typeof seller?.transactions === 'number'
        ? seller.transactions
        : undefined;
  if (dealCount !== undefined && Number.isFinite(dealCount)) {
    parts.push({ ...scoreSoldCount(dealCount), max: 3 });
  } else if (typeof seller?.rating === 'number' && Number.isFinite(seller.rating)) {
    // 只有评分可用时，把它换算到同一 0-3 区间（4.7 以上记 3 分）。
    const rating = seller.rating;
    const score = rating >= 4.7 ? 3 : rating >= 4.3 ? 1 : 0;
    parts.push({ score, text: `卖家评分 ${rating}`, max: 3 });
  }

  if (parts.length === 0) {
    return {
      status: 'unknown',
      evidence: {
        id: 'seller',
        dimension: '卖家信誉与交易记录',
        status: 'unknown',
        description: '页面上没有展示芝麻信用、好评率或成交记录，无法评估卖家信誉',
        source: '页面未展示卖家信誉信息',
        impact: '信誉数据缺失只说明无法核实，不代表卖家信誉差；需要卖家补充或走平台担保',
      },
    };
  }

  const score = parts.reduce((sum, part) => sum + part.score, 0);
  const max = parts.reduce((sum, part) => sum + part.max, 0);
  const average = parts.length > 0 ? score / parts.length : 0;
  const status: EvidenceStatus = average >= 2.5 ? 'pass' : average >= 1 ? 'warning' : 'fail';
  const missing: string[] = [];
  if (!seller?.zhimaLevel) missing.push('芝麻信用');
  if (typeof seller?.goodRatePercent !== 'number') missing.push('好评率');
  if (dealCount === undefined && typeof seller?.rating !== 'number') missing.push('成交记录');

  return {
    status,
    evidence: {
      id: 'seller',
      dimension: '卖家信誉与交易记录',
      status,
      description: [
        `页面展示的信誉信号：${parts.map((part) => part.text).join('、')}`,
        `按规则折算 ${score}/${max} 分（每个信号平均 ${average.toFixed(1)} 分，≥2.5 通过、≥1 需关注）。`,
        missing.length > 0 ? `未展示、未参与计分的信号：${missing.join('、')}。` : '',
      ]
        .filter(Boolean)
        .join(''),
      source: seller?.source ?? '闲鱼商品页卖家信息',
      impact:
        '信誉只用于评估交易可靠性，不能作为商品真伪的证据；缺失信号按「无法确认」处理，不按差评计。',
    },
  };
}

function computeScore(evidence: RiskEvidence[]): number {
  const weights: Record<EvidenceStatus, number> = {
    pass: 100,
    warning: 60,
    fail: 20,
    unknown: 50,
  };
  const total = evidence.reduce((sum, item) => sum + weights[item.status], 0);
  return Math.round(total / evidence.length);
}

function deriveRiskLevel(score: number, confidence: number, evidence: RiskEvidence[]): RiskLevel {
  const failures = evidence.filter((item) => item.status === 'fail').length;
  // 证据覆盖不足时，任何结论都不可靠，一律标为「信息不足」。
  if (confidence < 0.5) return 'insufficient';
  // 出现两项以上明确风险，或总分明显偏低，判为高风险。
  if (failures >= 2 || score < 55) return 'high';
  if (score >= 80) return 'low';
  return 'medium';
}

function buildActions(category: string, evidence: RiskEvidence[]): string[] {
  const actions = [
    '要求卖家提供序列号、机身/接口特写与开机画面视频，并核对与包装是否一致',
    '优先选择支持平台担保交易与七天无理由退货的商品，避免私下转账',
    '保留完整聊天记录、发货视频与验货视频，作为后续维权依据',
  ];
  const categoryActions: Record<string, string> = {
    相机机身: '要求提供快门数读取截图（如 ShutterCount），并现场试拍长曝光检查传感器坏点',
    镜头: '用强光手电照射镜片检查霉斑与雾气，现场测试对焦与光圈叶片动作',
    显卡: '现场跑压力测试查看核心/显存温度与功耗曲线，检查 BIOS 版本与显存颗粒型号',
    无人机: '起飞前查询激活与绑定状态是否可解绑，查看飞行里程与电池循环次数',
    手机: '当面查询激活锁与保修状态，检测电池健康度、屏幕原彩与面容识别',
    平板: '当面查询激活锁与保修状态，检查屏幕原彩显示与手写笔压感',
    笔记本: '现场检查电池循环次数、屏幕坏点与接口功能，核对硬盘通电时间',
  };
  if (categoryActions[category]) actions.unshift(categoryActions[category]);
  if (evidence.some((item) => item.status === 'unknown')) {
    actions.push('对标记为「无法确认」的项目，要求卖家补证或安排第三方验货，否则不要下单');
  }
  return actions;
}

function buildBasis(
  category: string,
  evidence: RiskEvidence[],
  knownCount: number,
  score: number,
  confidence: number,
  level: RiskLevel
): string {
  return [
    `品类「${category}」共 ${evidence.length} 个风险维度，其中 ${knownCount} 项有可核实证据（证据覆盖率 ${Math.round(confidence * 100)}%）。`,
    `评分口径：通过=100、需关注=60、存在风险=20、无法确认=50，按维度等权平均，得 ${score} 分。`,
    `风险等级判定：证据覆盖率低于 50% 时一律标为「信息不足」；存在明确风险项则直接判为「高风险」。`,
    `本次结论为「${levelLabel(level)}」。该结论不代表商品为真品或赝品，只反映当前掌握证据的充分程度。`,
  ].join('');
}

function statusLabel(status: EvidenceStatus): string {
  return { pass: '通过', warning: '需关注', fail: '存在风险', unknown: '无法确认' }[status];
}

function impactLabel(status: EvidenceStatus): string {
  return {
    pass: '降低风险，但仍需线下核对',
    warning: '需要卖家补充证明或现场复检',
    fail: '直接抬高交易风险，需重点议价或放弃',
    unknown: '证据缺失，结论中按「无法确认」处理',
  }[status];
}

function levelLabel(level: RiskLevel): string {
  return { low: '低风险', medium: '中风险', high: '高风险', insufficient: '信息不足' }[level];
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

export function getRiskLevelColor(level: RiskLevel | string): string {
  switch (level) {
    case 'low':
      return '#10B981';
    case 'medium':
      return '#F59E0B';
    case 'high':
      return '#EF4444';
    default:
      return '#9CA3AF';
  }
}

export function getRiskLevelLabel(level: RiskLevel | string): string {
  switch (level) {
    case 'low':
      return '低风险';
    case 'medium':
      return '中风险';
    case 'high':
      return '高风险';
    case 'insufficient':
      return '信息不足';
    default:
      return '未知';
  }
}

export function getEvidenceStatusColor(status: EvidenceStatus | string): string {
  switch (status) {
    case 'pass':
      return '#10B981';
    case 'warning':
      return '#F59E0B';
    case 'fail':
      return '#EF4444';
    default:
      return '#9CA3AF';
  }
}

export function getEvidenceStatusLabel(status: EvidenceStatus | string): string {
  switch (status) {
    case 'pass':
      return '通过';
    case 'warning':
      return '需关注';
    case 'fail':
      return '存在风险';
    default:
      return '无法确认';
  }
}

export const riskLevelBadgeClass: Record<RiskLevel, string> = {
  low: 'bg-green-50 text-green-700 ring-green-200',
  medium: 'bg-warn-50 text-warn-700 ring-warn-200',
  high: 'bg-red-50 text-red-700 ring-red-200',
  insufficient: 'bg-gray-100 text-ink-600 ring-gray-200',
};
