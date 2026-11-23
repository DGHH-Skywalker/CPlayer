import { defineAsyncComponent } from "vue";
import type { SettingCategory } from "@/types/settings-schema";
import IconLucideKeyboard from "~icons/lucide/keyboard";

/** 自定义设置只在对应区域挂载时解析 */
const HotkeyConfig = defineAsyncComponent(
  () => import("@/components/settings/custom/HotkeyConfig.vue"),
);

const hotkeysCategory: SettingCategory = {
  id: "hotkeys",
  icon: IconLucideKeyboard,
  sections: [
    {
      id: "hotkeys",
      items: [
        {
          key: "hotkeys",
          type: "custom",
          component: HotkeyConfig,
          fullWidth: true,
        },
      ],
    },
  ],
};

export default hotkeysCategory;
