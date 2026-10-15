/**
 * 演示数据必须稳定：同一件商品每次渲染都要得到同样的价格与证据，
 * 否则用户会看到数字乱跳，也无法核对结论。这里用确定性伪随机替代 Math.random()。
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 从多个片段组合出稳定的整数种子。 */
export function hashSeed(...parts: Array<string | number>): number {
  return hashString(parts.join('|'));
}
