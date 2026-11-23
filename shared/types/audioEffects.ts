/** 宿主实时动态处理的可移植参数 */
export interface DynamicsEffect {
  kind: "dynamics";
  mode: "basic" | "dynamic";
  strength: number;
  ceilingDb: number;
}
export interface AudioEffectsState {
  enabled: boolean;
  config: DynamicsEffect;
  native: "pending" | "active" | "fallback";
  browser: "idle" | "active" | "fallback" | "error";
  reductionDb: number;
}
export const NOISE_LIMITER_ID = "carbonv.noise-limiter";
export const DEFAULT_DYNAMICS: DynamicsEffect = {
  kind: "dynamics",
  mode: "dynamic",
  strength: 50,
  ceilingDb: -12,
};
/**
 * 校验插件提交的参数，非法参数不得覆盖当前有效配置
 * @param input - 插件音效声明
 * @returns 有限且落在宿主范围内的参数
 */
export const validateDynamics = (input: unknown): DynamicsEffect => {
  if (!input || typeof input !== "object") throw new Error("无效音效参数");
  const c = input as DynamicsEffect;
  if (
    c.kind !== "dynamics" ||
    !["basic", "dynamic"].includes(c.mode) ||
    !Number.isFinite(c.strength) ||
    c.strength < 0 ||
    c.strength > 100 ||
    !Number.isFinite(c.ceilingDb) ||
    c.ceilingDb < -30 ||
    c.ceilingDb > -3
  )
    throw new Error("无效音效参数");
  return { kind: "dynamics", mode: c.mode, strength: c.strength, ceilingDb: c.ceilingDb };
};
