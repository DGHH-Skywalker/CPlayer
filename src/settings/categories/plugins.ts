import { defineAsyncComponent } from "vue";
import type { SettingCategory } from "@/types/settings-schema";
import IconLucidePuzzle from "~icons/lucide/puzzle";

/** 自定义设置只在对应区域挂载时解析 */
const PluginImport = defineAsyncComponent(
  () => import("@/components/settings/custom/PluginImport.vue"),
);
const PluginList = defineAsyncComponent(
  () => import("@/components/settings/custom/PluginList.vue"),
);

const pluginsCategory: SettingCategory = {
  id: "plugins",
  icon: IconLucidePuzzle,
  sections: [
    {
      id: "pluginManage",
      tag: { text: "Beta" },
      items: [
        {
          key: "pluginImport",
          type: "custom",
          component: PluginImport,
          fullWidth: true,
          descriptionKey: "settings.plugins.hint",
          keywords: ["settings.plugins.importLocal", "settings.plugins.importFromUrl"],
        },
      ],
    },
    {
      id: "pluginsList",
      items: [
        {
          key: "pluginList",
          type: "custom",
          component: PluginList,
          fullWidth: true,
          keywords: ["settings.plugins.uninstall", "settings.plugins.install"],
        },
      ],
    },
  ],
};

export default pluginsCategory;
