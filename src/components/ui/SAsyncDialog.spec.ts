import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, ref, watch, type Component } from "vue";
import { createI18n } from "vue-i18n";
import SAsyncDialog from "./SAsyncDialog.vue";

const wrappers: VueWrapper[] = [];
/** 挂载带可关闭加载占位的按需弹窗 */
const createDialog = (
  loader: () => Promise<{ default: Component }>,
  open = false,
  attrs: Record<string, unknown> = {},
) => {
  const wrapper = mount(SAsyncDialog, {
    props: { loader, open },
    attrs: { mode: "local", ...attrs },
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: "zh-CN",
          messages: { "zh-CN": { common: { loading: "加载中", retry: "重试" } } },
        }),
      ],
      stubs: {
        SDialog: {
          props: ["open"],
          emits: ["update:open"],
          template:
            '<div v-if="open" role="dialog"><button @click="$emit(\'update:open\', false)">关闭</button><slot /></div>',
        },
        SButton: { template: "<button><slot /></button>" },
        SLoading: true,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
};

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("按点击加载弹窗", () => {
  it("关闭时不解析组件，首次打开有反馈，期间的关闭状态不会被迟到加载覆盖", async () => {
    let finish!: (module: { default: ReturnType<typeof defineComponent> }) => void;
    const loader = vi.fn(
      () =>
        new Promise<{ default: ReturnType<typeof defineComponent> }>((resolve) => {
          finish = resolve;
        }),
    );
    const wrapper = createDialog(loader);
    expect(loader).not.toHaveBeenCalled();
    await wrapper.setProps({ open: true });
    expect(wrapper.text()).toContain("加载中");
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
    await wrapper.setProps({ open: false });
    const received: boolean[] = [];
    finish({
      default: defineComponent({
        props: { open: Boolean, mode: String },
        setup(props) {
          watch(
            () => props.open,
            (value) => received.push(value),
            { immediate: true },
          );
          return () => h("span", { "data-real-dialog": "", hidden: !props.open }, props.mode);
        },
      }),
    });
    await flushPromises();
    expect(received).toEqual([false]);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    await wrapper.setProps({ open: true });
    expect(loader).toHaveBeenCalledOnce();
    expect(received).toEqual([false, true]);
    expect(wrapper.get("[data-real-dialog]").text()).toBe("local");
  });

  it("加载失败显示错误且可重试，加载成功后保留实例并转发动作", async () => {
    const created = vi.fn();
    let setups = 0;
    const child = defineComponent({
      props: { open: Boolean },
      emits: ["created"],
      setup(_props, { emit }) {
        setups++;
        const count = ref(0);
        return () =>
          h(
            "button",
            {
              "data-create": "",
              onClick: () => {
                count.value++;
                emit("created", count.value);
              },
            },
            String(count.value),
          );
      },
    });
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("组件读取失败"))
      .mockResolvedValue({ default: child });
    const wrapper = createDialog(loader, true, { onCreated: created });
    await flushPromises();
    expect(wrapper.text()).toContain("组件读取失败");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "重试")!
      .trigger("click");
    await flushPromises();
    await wrapper.get("[data-create]").trigger("click");
    expect(created).toHaveBeenLastCalledWith(1);
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await wrapper.get("[data-create]").trigger("click");
    expect(created).toHaveBeenLastCalledWith(2);
    expect(setups).toBe(1);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
