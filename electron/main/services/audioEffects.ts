import { EventEmitter } from "node:events";
import type { DynamicsEffect, AudioEffectsState } from "@shared/types/audioEffects";
import { DEFAULT_DYNAMICS, validateDynamics } from "@shared/types/audioEffects";
import { coreLog } from "@main/utils/logger";
const effects = new Map<string, DynamicsEffect>();
let nativeSink: ((enabled: boolean, config: DynamicsEffect) => void) | undefined;
let nativeMeter: (() => number) | undefined;
let native: AudioEffectsState["native"] = "pending";
let browser: AudioEffectsState["browser"] = "idle";
let reductionDb = 0;
export const audioEffectEvents = new EventEmitter();
/** 组合已授权的衰减贡献，任何插件都不能抬高其他插件的输出上限 */
export const effectiveDynamics = (): { enabled: boolean; config: DynamicsEffect } => {
  const values = [...effects.values()];
  return {
    enabled: values.length > 0,
    config: values.length
      ? {
          kind: "dynamics",
          mode: "dynamic",
          strength: Math.max(...values.map((v) => v.strength)),
          ceilingDb: Math.min(...values.map((v) => v.ceilingDb)),
        }
      : { ...DEFAULT_DYNAMICS },
  };
};
/** 同步原生参数并通知已存在的浏览器，无需重载网页 */
const changed = (): void => {
  const c = effectiveDynamics();
  try {
    nativeSink?.(c.enabled, c.config);
    if (nativeSink) native = "active";
  } catch (error) {
    native = "fallback";
    coreLog.error("原生音效参数同步失败", error);
  }
  audioEffectEvents.emit("changed", c);
};
/**
 * 绑定原生模块，播放器懒初始化前也会保留所需参数
 * @param sink - 原生模块的配置入口
 * @param meter - 无锁衰减诊断
 */
export const bindNativeDynamics = (sink: typeof nativeSink, meter?: () => number): void => {
  nativeMeter = meter;
  nativeSink = sink;
  changed();
};
/**
 * 注册或更新插件自己的实时音效
 * @param owner - 已经过权限校验的插件 ID
 * @param input - 动态处理参数
 */
export const registerDynamics = (owner: string, input: unknown): void => {
  const config = validateDynamics(input);
  if (!effects.has(owner) && effects.size >= 16) throw new Error("音效数量已达上限");
  effects.set(owner, config);
  changed();
};
/**
 * 显式禁用、撤权和卸载时撤销贡献
 * @param owner - 插件 ID
 */
export const removeDynamics = (owner: string): void => {
  if (effects.delete(owner)) changed();
};
/**
 * 插件失效时保留动态压制与输出上限，不能突然恢复原声
 * @param owner - 失效插件
 */
export const degradeDynamics = (owner: string): void => {
  const config = effects.get(owner);
  if (config) {
    effects.set(owner, { ...config, mode: "dynamic", strength: Math.max(50, config.strength) });
    changed();
  }
};
/**
 * 接收有限浏览器诊断，网页不能通过它修改配置
 * @param input - 非特权状态
 */
export const reportBrowserEffect = (input: unknown): void => {
  if (!input || typeof input !== "object") return;
  const data = input as { state: string; reductionDb: number };
  if (["idle", "active", "fallback", "error"].includes(data.state))
    browser = data.state as typeof browser;
  if (Number.isFinite(data.reductionDb)) reductionDb = Math.min(60, Math.max(0, data.reductionDb));
};
/** 返回不含音频样本的低频诊断 */
export const audioEffectsState = (): AudioEffectsState => ({
  ...effectiveDynamics(),
  native,
  browser,
  reductionDb: Math.max(reductionDb, nativeMeter?.() ?? 0),
});

/** 音效启用但原生配置不可用时阻止播放，不允许降为无保护原声 */
export const assertNativeDynamics = (): void => {
  if (effectiveDynamics().enabled && native !== "active")
    throw new Error("NoiseLimiter 原生保护不可用");
};
