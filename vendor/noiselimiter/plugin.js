/**
 * @id carbonv.noise-limiter
 * @name NoiseLimiter
 * @version 1.1.0
 * @author CarbonVPlayer
 * @apiLevel 6
 * @grant ui,dsp
 */
cplayer.register({
  settings: [
    {
      key: "dynamicStrength",
      type: "slider",
      label: "动态强度",
      default: 50,
      min: 0,
      max: 100,
    },
    { key: "ceilingDb", type: "slider", label: "输出上限 · dBFS", default: -12, min: -30, max: -3 },
  ],
});
/** 提交唯一动态压制曲线，不读取已移除的模式设置 */
function update() {
  cplayer.audio
    .registerEffect({
      kind: "dynamics",
      mode: "dynamic",
      strength: cplayer.getSetting("dynamicStrength") ?? 50,
      ceilingDb: cplayer.getSetting("ceilingDb") ?? -12,
    })
    .catch((error) => cplayer.log.error(String(error)));
}
for (const key of ["dynamicStrength", "ceilingDb"]) cplayer.onSettingChange(key, update);
update();
