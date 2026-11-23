import { defineAsyncComponent } from "vue";
import type { SettingCategory } from "@/types/settings-schema";
import IconLucideLibrary from "~icons/lucide/library";

/** 自定义设置只在对应区域挂载时解析 */
const StreamingServerList = defineAsyncComponent(
  () => import("@/components/settings/custom/StreamingServerList.vue"),
);

const mediaSourceCategory: SettingCategory = {
  id: "mediaSource",
  icon: IconLucideLibrary,
  sections: [
    {
      id: "streaming",
      items: [
        {
          key: "streamingEnabled",
          type: "switch",
          binding: { store: "settings", path: "system.streaming.enabled" },
          defaultValue: true,
        },
      ],
    },
    {
      id: "mediaServerManagement",
      items: [
        {
          key: "streamingServerList",
          type: "custom",
          component: StreamingServerList,
          fullWidth: true,
          keywords: ["streaming.server.add", "streaming.server.test", "streaming.server.connect"],
        },
      ],
    },
  ],
};

export default mediaSourceCategory;
