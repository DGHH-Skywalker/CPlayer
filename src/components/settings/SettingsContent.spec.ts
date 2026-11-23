import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineAsyncComponent, defineComponent, h, nextTick } from "vue";
import { createI18n } from "vue-i18n";
import type { SettingCategory } from "@/types/settings-schema";
import SettingsContent from "./SettingsContent.vue";

const fixtures = vi.hoisted(() => ({ schema: [] as SettingCategory[], initial: "general" }));
vi.mock("@/settings/schema", () => ({ settingsSchema: fixtures.schema }));
vi.mock("@/stores/settings", () => ({ useSettingsStore: () => ({ syncSystem: async () => {} }) }));
vi.mock("@/settings/pluginCenter", () => ({
  syncPluginCenter: async () => {},
  consumePluginCenterKey: async () => false,
}));
vi.mock("@/settings/useSettingsDialog", () => ({
  useSettingsDialog: () => ({
    initialCategory: { value: fixtures.initial },
    initialHighlight: { value: undefined },
    initialParentKeys: { value: [] },
    rememberCategory: () => {},
  }),
}));
vi.mock("@/utils/url", () => ({ openExternal: vi.fn() }));
vi.mock("@/utils/config", () => ({
  REPO_URL: "",
  REPO_NAME: "Cplayer",
  APP_VERSION: "1.4.0",
  IS_APPX: false,
}));
let wrapper: VueWrapper;
let resolveHeavy: (component: ReturnType<typeof defineComponent>) => void;
let scrolled: ReturnType<typeof vi.fn>;

/** 挂载分类选择与搜索入口，异步分类由测试控制加载时间 */
const renderSettings = (): void => {
  const i18n = createI18n({
    legacy: false,
    locale: "zh-CN",
    missingWarn: false,
    fallbackWarn: false,
    messages: { "zh-CN": { common: { loading: "加载中" } } },
  });
  wrapper = mount(SettingsContent, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
      stubs: {
        SettingsSearch: {
          name: "SettingsSearch",
          emits: ["select"],
          template: "<div data-search />",
        },
        SettingsMenu: {
          name: "SettingsMenu",
          props: ["categories", "activeId"],
          emits: ["select"],
          template: "<div data-menu />",
        },
        SButton: { template: "<button><slot /></button>" },
        STag: true,
        SLoading: true,
        SettingsSection: true,
      },
    },
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  scrolled = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrolled,
  });
  vi.stubGlobal("api", { plugins: { centerReset: vi.fn() } });
  const heavy = defineAsyncComponent(
    () =>
      new Promise((resolve) => {
        resolveHeavy = resolve;
      }),
  );
  fixtures.schema.splice(
    0,
    fixtures.schema.length,
    {
      id: "general",
      icon: {},
      sections: [],
      component: defineComponent(() => () => h("div", "常规")),
    },
    { id: "heavy", icon: {}, sections: [], component: heavy },
  );
  renderSettings();
});

afterEach(() => {
  wrapper.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("异步分类的设置定位", () => {
  it("慢分类显示加载状态，并等实际挂载后高亮搜索项", async () => {
    await flushPromises();
    wrapper.getComponent({ name: "SettingsSearch" }).vm.$emit("select", "heavy", "slowItem");
    await nextTick();
    expect(wrapper.text()).toContain("加载中");
    await vi.advanceTimersByTimeAsync(500);
    expect(scrolled).not.toHaveBeenCalled();
    resolveHeavy(defineComponent(() => () => h("div", { id: "setting-slowItem" }, "已加载")));
    await flushPromises();
    expect(wrapper.text()).toContain("已加载");
    expect(scrolled).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(wrapper.find("#setting-slowItem").attributes("highlight-key")).toBe("slowItem");
  });

  it("加载期间切走分类会作废旧搜索定位", async () => {
    await flushPromises();
    wrapper.getComponent({ name: "SettingsSearch" }).vm.$emit("select", "heavy", "oldItem");
    await nextTick();
    wrapper.getComponent({ name: "SettingsMenu" }).vm.$emit("select", "general");
    await nextTick();
    resolveHeavy(defineComponent(() => () => h("div", { id: "setting-oldItem" }, "旧分类")));
    await flushPromises();
    expect(wrapper.text()).toContain("常规");
    expect(wrapper.text()).not.toContain("旧分类");
    expect(scrolled).not.toHaveBeenCalled();
  });
});
