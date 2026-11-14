/** 仅用于当前队列项的页面控制，不含 Node 或应用管理权限 */
export interface BilibiliSongPage {
  token: string;
  url: string;
  autoPlay: boolean;
}

/**
 * 在站点脚本前安装媒体结束闸门，阻止站点续播与循环
 * @param song - 当前网页队列项，普通浏览时为空
 * @returns 主世界脚本
 */
export const biliSongBootstrap = (song: BilibiliSongPage | null): string => String.raw`(() => {
  if (window !== top || location.protocol !== 'https:' || location.hostname !== 'www.bilibili.com') return;
  const song = ${JSON.stringify(song)};
  if (!song) return;
  const expected = new URL(song.url);
  if (location.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, '') || (new URLSearchParams(location.search).get('p') || '1') !== (expected.searchParams.get('p') || '1')) return;
  let finished = false, started = false, pausedByUser = !song.autoPlay;
  let lastTime = 0;
  const emit = (state, video) => {
    try { carbonvMedia(JSON.stringify({ song: { token: song.token, state, position: Number.isFinite(video?.currentTime) ? video.currentTime * 1000 : 0, duration: Number.isFinite(video?.duration) ? video.duration * 1000 : 0 } })); } catch {}
  };
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function(...args) {
    if (finished || pausedByUser) return Promise.reject(new DOMException('哔哩Song 已暂停或结束', 'AbortError'));
    return originalPlay.apply(this, args);
  };
  const pauseAll = () => document.querySelectorAll('video,audio').forEach(v => v.pause());
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function(data, unused, url) {
      if (url) {
        const target = new URL(url, location.href);
        if (finished || target.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, '') || (target.searchParams.get('p') || '1') !== (expected.searchParams.get('p') || '1')) return;
      }
      return original.apply(this, arguments);
    };
  }
  document.addEventListener('play', event => {
    if ((finished || pausedByUser) && event.target instanceof HTMLMediaElement) {
      event.stopImmediatePropagation(); event.target.pause();
    }
  }, true);
  window.__carbonvSongControl = (command, position, token) => {
    if (token !== song.token) return;
    const video = document.querySelector('video');
    if (command === 'stop') { finished = true; pauseAll(); return; }
    if (finished) return;
    if (command === 'pause') { pausedByUser = true; pauseAll(); emit('paused', video); }
    if (command === 'play') { pausedByUser = false; if (video) originalPlay.call(video).catch(() => emit('paused', video)); }
    if (command === 'seek' && video && Number.isFinite(position)) video.currentTime = Math.max(0, position / 1000);
  };
  document.addEventListener('ended', event => {
    if (!(event.target instanceof HTMLVideoElement) || finished) return;
    finished = true;
    event.stopImmediatePropagation();
    pauseAll();
    emit('ended', event.target);
  }, true);
  for (const name of ['playing', 'pause', 'loadedmetadata', 'timeupdate', 'error']) document.addEventListener(name, event => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement) || finished) return;
    video.loop = false;
    if (name === 'playing') { started = true; emit('playing', video); }
    if (name === 'pause') emit('paused', video);
    if (name === 'error' && video.error) emit('error', video);
    if (name === 'loadedmetadata') {
      video.loop = false;
      if (song.autoPlay && !pausedByUser && !started) originalPlay.call(video).catch(() => emit('paused', video));
      else emit('paused', video);
    }
    if (name === 'timeupdate' && performance.now() - lastTime > 250) { lastTime = performance.now(); emit(video.paused ? 'paused' : 'playing', video); }
  }, true);
})();`;
