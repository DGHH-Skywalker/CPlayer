import type {
  PluginSettingItem,
  PluginRegistration,
  PlaybackEventKind,
} from "@shared/types/plugin";
/**
 * 插件贡献进入界面前限制大小并拒绝异常类型，防止无界配置污染宿主
 * @param input - worker 上报的声明
 * @returns 有限的纯数据贡献
 */
export const sanitizeRegistration = (input: PluginRegistration): PluginRegistration => ({
  events: Array.isArray(input.events)
    ? ([
        ...new Set(
          input.events.filter((v) =>
            ["trackChange", "lyricChange", "lineChange", "playStateChange"].includes(v),
          ),
        ),
      ].slice(0, 4) as PlaybackEventKind[])
    : [],
  controls: input.controls === true,
  settings: Array.isArray(input.settings)
    ? input.settings
        .slice(0, 64)
        .filter(
          (v): v is PluginSettingItem =>
            !!v &&
            typeof v.key === "string" &&
            /^[a-zA-Z][\w-]{0,63}$/.test(v.key) &&
            typeof v.label === "string" &&
            ["switch", "number", "slider", "text", "select"].includes(v.type) &&
            ["string", "number", "boolean"].includes(typeof v.default),
        )
        .map((v) => ({
          key: v.key,
          type: v.type,
          label: v.label.slice(0, 120),
          default:
            typeof v.default === "string"
              ? v.default.slice(0, 1000)
              : typeof v.default === "number" && !Number.isFinite(v.default)
                ? 0
                : v.default,
          min: Number.isFinite(v.min) ? v.min : undefined,
          max: Number.isFinite(v.max) ? v.max : undefined,
          when:
            v.when && typeof v.when.key === "string" && typeof v.when.value === "string"
              ? { key: v.when.key.slice(0, 64), value: v.when.value.slice(0, 100) }
              : undefined,
          options: Array.isArray(v.options)
            ? v.options
                .slice(0, 64)
                .filter((o) => o && typeof o.label === "string" && typeof o.value === "string")
                .map((o) => ({ label: o.label.slice(0, 120), value: o.value.slice(0, 100) }))
            : undefined,
        }))
    : [],
  menus: Array.isArray(input.menus)
    ? input.menus
        .slice(0, 32)
        .filter((v) => v && typeof v.id === "string" && typeof v.label === "string")
        .map((v) => ({
          id: v.id.slice(0, 100),
          label: v.label.slice(0, 120),
          sources: Array.isArray(v.sources)
            ? v.sources.filter((s) => typeof s === "string").slice(0, 16)
            : undefined,
        }))
    : [],
});
