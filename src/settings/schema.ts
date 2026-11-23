import { defineAsyncComponent } from "vue";
import { pluginCenterUnlocked } from "./pluginCenter";
import IconLucideSchool from "~icons/lucide/school";
import type { SettingCategory } from "@/types/settings-schema";
import generalCategory from "./categories/general";
import appearanceCategory from "./categories/appearance";
import playerCategory from "./categories/player";
import lyricCategory from "./categories/lyric";
import externalLyricCategory from "./categories/externalLyric";
import hotkeysCategory from "./categories/hotkeys";
import servicesCategory from "./categories/services";
import aiIntegrationCategory from "./categories/aiIntegration";
import mediaSourceCategory from "./categories/streaming";
import downloadCategory from "./categories/download";
import localCacheCategory from "./categories/localCache";
import pluginsCategory from "./categories/plugins";
import otherCategory from "./categories/other";
import IconLucideInfo from "~icons/lucide/info";

/** 自定义设置只在对应区域挂载时解析 */
const PluginCenter = defineAsyncComponent(
  () => import("@/components/settings/custom/PluginCenter.vue"),
);
const SchoolControlCenter = defineAsyncComponent(
  () => import("@/components/settings/custom/SchoolControlCenter.vue"),
);
const AboutSettings = defineAsyncComponent(
  () => import("@/components/settings/custom/AboutSettings.vue"),
);

export const settingsSchema: SettingCategory[] = [
  { id: "school", icon: IconLucideSchool, component: SchoolControlCenter, sections: [] },
  generalCategory,
  appearanceCategory,
  playerCategory,
  lyricCategory,
  externalLyricCategory,
  hotkeysCategory,
  servicesCategory,
  aiIntegrationCategory,
  mediaSourceCategory,
  downloadCategory,
  localCacheCategory,
  {
    ...pluginsCategory,
    component: PluginCenter,
    visible: () => pluginCenterUnlocked.value,
    sections: [],
  },
  otherCategory,
  { id: "about", icon: IconLucideInfo, component: AboutSettings, sections: [] },
];
