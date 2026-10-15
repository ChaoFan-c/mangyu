import type { BrandRef, CategoryRef } from './types.ts';

/**
 * 闲鱼官网的 10 个大分类：本项目用它作为「入库品类」。
 * 具体商品仍然落在下面更细的 7 个数码品类上，两者是父子关系。
 */
export interface CategoryGroupRef {
  id: number;
  name: string;
  slug: string;
  icon: string;
}

export const CATEGORY_GROUPS: CategoryGroupRef[] = [
  { id: 101, name: '手机 / 数码 / 电脑', slug: 'digital', icon: 'smartphone' },
  { id: 102, name: '服饰 / 箱包 / 运动', slug: 'clothing', icon: 'shirt' },
  { id: 103, name: '技能 / 卡券 / 潮玩', slug: 'skill', icon: 'ticket' },
  { id: 104, name: '母婴 / 美妆 / 个护', slug: 'baby', icon: 'baby' },
  { id: 105, name: '家具 / 家电 / 家装', slug: 'home', icon: 'sofa' },
  { id: 106, name: '文玩 / 珠宝 / 礼品', slug: 'collectible', icon: 'gem' },
  { id: 107, name: '食品 / 宠物 / 花卉', slug: 'food', icon: 'apple' },
  { id: 108, name: '图书 / 游戏 / 音像', slug: 'book', icon: 'book' },
  { id: 109, name: '汽车 / 电动车 / 租房', slug: 'car', icon: 'car' },
  { id: 110, name: '五金 / 设备 / 农牧', slug: 'tool', icon: 'wrench' },
];

/** 保留的细分数码品类，作为上面大分类的子分类（旧数据继续用这些名字）。 */
export const CATEGORIES: CategoryRef[] = [
  { id: 1, name: '相机机身', slug: 'camera_body', icon: 'camera', group: '手机 / 数码 / 电脑' },
  { id: 2, name: '镜头', slug: 'lens', icon: 'image', group: '手机 / 数码 / 电脑' },
  { id: 3, name: '显卡', slug: 'gpu', icon: 'cpu', group: '手机 / 数码 / 电脑' },
  { id: 4, name: '无人机', slug: 'drone', icon: 'helicopter', group: '手机 / 数码 / 电脑' },
  { id: 5, name: '手机', slug: 'phone', icon: 'smartphone', group: '手机 / 数码 / 电脑' },
  { id: 6, name: '平板', slug: 'tablet', icon: 'tablet', group: '手机 / 数码 / 电脑' },
  { id: 7, name: '笔记本', slug: 'laptop', icon: 'laptop', group: '手机 / 数码 / 电脑' },
];

export const UNMAPPED_CATEGORY_LABEL = '待确认';

export const BRANDS: BrandRef[] = [
  { id: 1, name: 'Sony', slug: 'sony', category_id: 1 },
  { id: 2, name: 'Canon', slug: 'canon', category_id: 1 },
  { id: 3, name: 'Nikon', slug: 'nikon', category_id: 1 },
  { id: 4, name: 'Fujifilm', slug: 'fujifilm', category_id: 1 },
  { id: 5, name: 'DJI', slug: 'dji', category_id: 4 },
  { id: 6, name: 'Autel', slug: 'autel', category_id: 4 },
  { id: 7, name: 'Apple', slug: 'apple', category_id: 5 },
  { id: 8, name: 'Samsung', slug: 'samsung', category_id: 5 },
  { id: 9, name: 'Xiaomi', slug: 'xiaomi', category_id: 5 },
  { id: 10, name: 'OnePlus', slug: 'oneplus', category_id: 5 },
  { id: 11, name: 'vivo', slug: 'vivo', category_id: 5 },
  { id: 12, name: 'OPPO', slug: 'oppo', category_id: 5 },
  { id: 13, name: 'NVIDIA', slug: 'nvidia', category_id: 3 },
  { id: 14, name: 'AMD', slug: 'amd', category_id: 3 },
  { id: 15, name: 'Intel', slug: 'intel', category_id: 3 },
  { id: 16, name: 'Lenovo', slug: 'lenovo', category_id: 7 },
  { id: 17, name: 'ASUS', slug: 'asus', category_id: 7 },
  { id: 18, name: 'ROG', slug: 'rog', category_id: 7 },
  { id: 19, name: 'ThinkPad', slug: 'thinkpad', category_id: 7 },
  { id: 20, name: 'Microsoft', slug: 'microsoft', category_id: 7 },
  { id: 21, name: 'Google', slug: 'google', category_id: 7 },
  { id: 22, name: 'Sigma', slug: 'sigma', category_id: 2 },
  { id: 23, name: 'Tamron', slug: 'tamron', category_id: 2 },
  { id: 24, name: 'Zeiss', slug: 'zeiss', category_id: 2 },
];

export function categoryNameById(id: number): string | undefined {
  return CATEGORIES.find((category) => category.id === id)?.name;
}

export function categoryIdByName(name: string): number | undefined {
  return CATEGORIES.find((category) => category.name === name)?.id;
}

/** 解析分类名到 categories 表主键：10 个大分类与保留的细分类都支持。 */
export function categoryIdForStorage(name: string): number | undefined {
  const group = CATEGORY_GROUPS.find((item) => item.name === name);
  if (group) return group.id;
  return CATEGORIES.find((category) => category.name === name)?.id;
}

export function isCategoryGroupName(name: string): boolean {
  return CATEGORY_GROUPS.some((group) => group.name === name);
}

export function isChildCategoryName(name: string): boolean {
  return CATEGORIES.some((category) => category.name === name);
}

/** 入库品类同时接受 10 个大分类与保留的细分品类。 */
export function isKnownCategoryName(name: string): boolean {
  return isCategoryGroupName(name) || isChildCategoryName(name);
}

/**
 * 找出某个分类名所属的大分类。
 * 无法确定映射关系时返回 undefined，调用方应保留原始值并标记「待确认」，
 * 不得把未知分类兜底成某个大类。
 */
export function categoryGroupNameOf(name: string): string | undefined {
  if (isCategoryGroupName(name)) return name;
  return CATEGORIES.find((category) => category.name === name)?.group;
}

export function childCategoryNamesOfGroup(groupName: string): string[] {
  return CATEGORIES.filter((category) => category.group === groupName).map(
    (category) => category.name
  );
}

/** 大分类 id 与其子分类 id 的合集，用于「按大分类筛选也能命中子分类商品」。 */
export function categoryIdsForFilter(categoryName: string): number[] {
  const group = CATEGORY_GROUPS.find((item) => item.name === categoryName);
  if (group) return [group.id, ...categoryIdsInGroup(categoryName)];
  const child = CATEGORIES.find((item) => item.name === categoryName);
  return child ? [child.id] : [];
}

function categoryIdsInGroup(groupName: string): number[] {
  return CATEGORIES.filter((category) => category.group === groupName).map(
    (category) => category.id
  );
}

/** 把（可能是大分类的）分类名展开成实际商品会用到的细分类名。 */
export function categoryNamesForFilter(categoryName: string): string[] {
  const children = childCategoryNamesOfGroup(categoryName);
  return children.length > 0 ? children : [categoryName];
}

export function brandNameById(id: number): string | undefined {
  return BRANDS.find((brand) => brand.id === id)?.name;
}
