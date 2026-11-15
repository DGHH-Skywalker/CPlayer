import { WebContentsView, type BrowserWindow, type Rectangle } from "electron";

/** 本地脚本禁用的原生悬浮按钮，远程网页不能通过 DOM 或 IPC 触发它 */
export class BilibiliSongButton {
  readonly view: WebContentsView;
  private allowed = false;
  private pressed = false;
  private ready = false;
  private layoutKey = "";
  private disabled: boolean | null = null;

  /**
   * 创建位于远程网页之上的独立本地视图，不加载 preload 或远程脚本
   * @param parent - 主窗口
   * @param activate - 主进程验证当前页面后执行的入队意图
   */
  constructor(
    private parent: BrowserWindow,
    activate: () => void,
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        partition: "carbonv-bilibili-controls",
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    this.view.setBackgroundColor("#00000000");
    this.view.setVisible(false);
    parent.contentView.addChildView(this.view);
    const wc = this.view.webContents;
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("will-navigate", (event) => event.preventDefault());
    wc.on("before-mouse-event", (_event, mouse) => {
      if (mouse.type === "mouseDown" && mouse.button === "left") this.pressed = this.allowed;
      if (mouse.type === "mouseUp") {
        const clicked = this.pressed && mouse.button === "left" && this.allowed;
        this.pressed = false;
        const bounds = this.view.getBounds();
        if (
          clicked &&
          mouse.x >= 0 &&
          mouse.x < bounds.width &&
          mouse.y >= 0 &&
          mouse.y < bounds.height
        )
          activate();
      }
    });
    wc.on("before-input-event", (_event, input) => {
      if (this.allowed && input.type === "keyUp" && ["Enter", " "].includes(input.key)) activate();
    });
    const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>html,body{margin:0;width:100%;height:100%;background:transparent}button{width:100%;height:100%;border:1px solid #ffffff55;border-radius:22px;background:#315fca;color:white;font:600 14px system-ui;cursor:pointer}button:disabled{background:#64748b;cursor:default}button:focus-visible{outline:3px solid #a5c6ff;outline-offset:-4px}</style><button disabled title="打开视频后加入播放列表">哔哩Song · 加入队列</button>`;
    void wc
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      .then(() => {
        this.ready = true;
        this.updateDisabled();
      })
      .catch(() => {});
  }

  /**
   * 同步右下角位置、可见性和课间权限，原生层级始终高于远程页面
   * @param surface - 网页原生视图边界
   * @param visible - 页面及实验开关是否允许显示
   * @param allowed - 当前页面与校园闸门是否允许入队
   */
  update(surface: Rectangle, visible: boolean, allowed: boolean): void {
    const zoom = this.parent.webContents.getZoomFactor();
    const gap = Math.round(16 * zoom);
    const height = Math.round(44 * zoom);
    const width = Math.min(Math.round(176 * zoom), Math.max(0, surface.width - gap * 2));
    const show = visible && width >= 120 * zoom && surface.height >= height + gap * 2;
    const key = JSON.stringify([surface, show, allowed, zoom]);
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    this.allowed = show && allowed;
    if (!show) this.pressed = false;
    this.view.setBounds({
      x: surface.x + surface.width - width - gap,
      y: surface.y + surface.height - height - gap,
      width,
      height,
    });
    this.view.webContents.setZoomFactor(zoom);
    this.view.setVisible(show);
    if (show) this.parent.contentView.addChildView(this.view);
    this.updateDisabled();
  }

  /** 本地按钮只接收主进程写入的禁用状态，不具有任何应用 API */
  private updateDisabled(): void {
    if (this.ready && !this.view.webContents.isDestroyed() && this.disabled !== !this.allowed) {
      this.disabled = !this.allowed;
      void this.view.webContents
        .executeJavaScript(`document.querySelector('button').disabled = ${this.disabled}`)
        .catch(() => {});
    }
  }

  /** 随浏览器销毁原生控件及其监听器 */
  dispose(): void {
    if (!this.parent.isDestroyed()) this.parent.contentView.removeChildView(this.view);
    if (!this.view.webContents.isDestroyed())
      this.view.webContents.close({ waitForBeforeUnload: false });
  }
}
