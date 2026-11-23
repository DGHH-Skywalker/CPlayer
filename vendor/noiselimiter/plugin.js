/**
 * @id carbonv.noise-limiter
 * @name NoiseLimiter
 * @version 1.0.0
 * @author CarbonVPlayer
 * @apiLevel 6
 * @grant ui,dsp
 */
cplayer.register({
  settings: [
    {
      key: "mode",
      type: "select",
      label: "模式",
      default: "dynamic",
      options: [
        { label: "动态限制", value: "dynamic" },
        { label: "基础限制", value: "basic" },
      ],
    },
    {
      key: "dynamicStrength",
      when: { key: "mode", value: "dynamic" },
      type: "slider",
      label: "动态强度",
      default: 50,
      min: 0,
      max: 100,
    },
    {
      key: "basicStrength",
      when: { key: "mode", value: "basic" },
      type: "slider",
      label: "基础强度",
      default: 50,
      min: 0,
      max: 100,
    },
    { key: "ceilingDb", type: "slider", label: "输出上限 · dBFS", default: -12, min: -30, max: -3 },
  ],
});
/** 根据当前模式提交音效，不访问文件、网络或原生对象 */
function update() {
  const mode = cplayer.getSetting("mode") || "dynamic";
  cplayer.audio
    .registerEffect({
      kind: "dynamics",
      mode,
      strength: cplayer.getSetting(mode + "Strength") ?? 50,
      ceilingDb: cplayer.getSetting("ceilingDb") ?? -12,
    })
    .catch((error) => cplayer.log.error(String(error)));
}
for (const key of ["mode", "dynamicStrength", "basicStrength", "ceilingDb"])
  cplayer.onSettingChange(key, update);
update();
