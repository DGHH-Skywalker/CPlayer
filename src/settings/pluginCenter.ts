import { ref } from "vue";
/** 解锁状态由主进程持有，渲染重载后重新读取 */
export const pluginCenterUnlocked = ref(false);
/** 同步本次启动的入口状态 */
export const syncPluginCenter = async (): Promise<void> => {
  pluginCenterUnlocked.value = await window.api.plugins.centerState();
};
/**
 * 处理设置容器中的独立按键，编辑与自动重复不能解锁
 * @param event - 设置内键盘事件
 * @returns 是否刚完成解锁
 */
export const consumePluginCenterKey = async (event: KeyboardEvent): Promise<boolean> => {
  if (pluginCenterUnlocked.value) return false;
  const target = event.target;
  if (
    event.isComposing ||
    event.repeat ||
    (target instanceof Element &&
      target.closest(
        "input,textarea,select,button,a,[contenteditable='true'],[role='button'],[role='combobox'],[role='slider']",
      ))
  )
    return false;
  if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    await window.api.plugins.centerReset();
    return false;
  }
  event.preventDefault();
  const unlocked = await window.api.plugins.centerEnter();
  pluginCenterUnlocked.value = pluginCenterUnlocked.value || unlocked;
  return pluginCenterUnlocked.value;
};
