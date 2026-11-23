import { defineAsyncComponent } from "vue";
import type { SettingCategory } from "@/types/settings-schema";
import IconLucideSettings from "~icons/lucide/settings";

/** 自定义设置只在对应区域挂载时解析 */
const PlatformAccount = defineAsyncComponent(
  () => import("@/components/settings/custom/PlatformAccount.vue"),
);
const SkipKeywordsConfig = defineAsyncComponent(
  () => import("@/components/settings/custom/SkipKeywordsConfig.vue"),
);

const otherCategory: SettingCategory = {
  id: "other",
  icon: IconLucideSettings,
  sections: [
    {
      id: "platformLogin",
      tag: { text: "Beta" },
      items: [
        {
          key: "qmAccount",
          type: "custom",
          component: PlatformAccount,
          componentProps: { platform: "qqmusic" },
          fullWidth: true,
          descriptionKey: "settings.platformLogin.desc",
          keywords: [
            "settings.platformLogin.title",
            "settings.platformLogin.desc",
            "settings.platformLogin.loginWeb",
            "settings.platformLogin.manualCookie",
          ],
        },
        {
          key: "kgAccount",
          type: "custom",
          component: PlatformAccount,
          componentProps: { platform: "kugou" },
          fullWidth: true,
          descriptionKey: "settings.platformLogin.desc",
          keywords: [
            "settings.platformLogin.title",
            "settings.platformLogin.desc",
            "settings.platformLogin.loginQr",
            "settings.platformLogin.manualCookie",
          ],
        },
      ],
    },
    {
      id: "platformConfig",
      tag: { text: "Beta" },
      items: [
        {
          key: "kugouLoginVersion",
          type: "select",
          binding: { store: "settings", path: "system.system.kugouLoginVersion" },
          options: [
            { value: "standard", labelKey: "settings.kugouLoginVersion.standard" },
            { value: "concept", labelKey: "settings.kugouLoginVersion.concept" },
          ],
          defaultValue: "standard",
          confirm: {
            titleKey: "settings.confirm.kugouLoginVersionTitle",
            contentKey: "settings.confirm.kugouLoginVersionContent",
            type: "warning",
          },
        },
      ],
    },
    {
      id: "preset",
      items: [
        {
          key: "skipKeywordsSongs",
          type: "custom",
          component: SkipKeywordsConfig,
        },
        {
          key: "hideVipTag",
          type: "switch",
          binding: { store: "settings", path: "preset.hideVipTag" },
          defaultValue: false,
        },
        {
          key: "hideQualityTag",
          type: "switch",
          binding: { store: "settings", path: "preset.hideQualityTag" },
          defaultValue: false,
        },
        {
          key: "showSubtitle",
          type: "switch",
          binding: { store: "settings", path: "preset.showSubtitle" },
          defaultValue: true,
        },
      ],
    },
  ],
};

export default otherCategory;
