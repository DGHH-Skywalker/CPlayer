import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, type Component } from "vue";

const loaded = vi.hoisted(() => ({ storage: vi.fn(), streaming: vi.fn() }));
vi.mock("@/components/settings/custom/StorageManager.vue", async () => {
  loaded.storage();
  const { defineComponent, h } = await import("vue");
  return { __esModule: true, default: defineComponent(() => () => h("div", "存储")) };
});
vi.mock("@/components/settings/custom/StreamingServerList.vue", async () => {
  loaded.streaming();
  const { defineComponent, h } = await import("vue");
  return { __esModule: true, default: defineComponent(() => () => h("div", "服务器")) };
});

const wrappers: VueWrapper[] = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

describe("设置元数据与组件解析分离", () => {
  it("读取设置搜索元数据不加载组件，挂载分类仅解析对应组件", async () => {
    const [{ default: general }, { default: streaming }] = await Promise.all([
      import("./general"),
      import("./streaming"),
    ]);
    expect(general.sections?.flatMap((section) => section.items).length).toBeGreaterThan(0);
    expect(loaded.storage).not.toHaveBeenCalled();
    expect(loaded.streaming).not.toHaveBeenCalled();
    const storage = general.sections
      ?.flatMap((section) => section.items)
      .find((item) => item.component)?.component;
    expect(storage).toBeDefined();
    wrappers.push(mount(defineComponent(() => () => h(storage as Component))));
    await flushPromises();
    expect(loaded.storage).toHaveBeenCalledOnce();
    expect(loaded.streaming).not.toHaveBeenCalled();
    const servers = streaming.sections
      ?.flatMap((section) => section.items)
      .find((item) => item.component)?.component;
    wrappers.push(mount(defineComponent(() => () => h(servers as Component))));
    await flushPromises();
    expect(loaded.streaming).toHaveBeenCalledOnce();
  });
});
