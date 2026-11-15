/** 仅用于当前队列项的页面控制，不含 Node 或应用管理权限 */
export interface BilibiliSongPage {
  token: string;
  url: string;
  autoPlay: boolean;
}

/**
 * 在站点首个脚本前锁定单视频播放，捕获结束、循环设置和播放器重建
 * @param song - 当前网页队列项，普通浏览时为空
 * @returns 主世界脚本
 */
export const biliSongBootstrap = (song: BilibiliSongPage | null): string => String.raw`(() => {
  if (window !== top || location.protocol !== 'https:' || location.hostname !== 'www.bilibili.com') return;
  const song = ${JSON.stringify(song)};
  if (!song) return;
  const expected = new URL(song.url);
  const path = url => { const parts = url.pathname.split('/').filter(Boolean); if (parts[0] === 'en') parts.shift(); return parts.join('/'); };
  if (path(location) !== path(expected) || (new URLSearchParams(location.search).get('p') || '1') !== (expected.searchParams.get('p') || '1')) return;
  let finished = false, pausedByUser = !song.autoPlay;
  let activeVideo = null, last = null, lastTime = 0;
  const originalPlay = HTMLMediaElement.prototype.play;
  const loop = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'loop');
  const emit = (state, video) => {
    const position = Number.isFinite(video?.currentTime) ? video.currentTime : last?.position || 0;
    const duration = Number.isFinite(video?.duration) ? video.duration : last?.duration || 0;
    try { carbonvMedia(JSON.stringify({ song: { token: song.token, state, position: position * 1000, duration: duration * 1000 } })); } catch {}
  };
  const pauseAll = mute => {
    const media = new Set(document.querySelectorAll('video,audio'));
    if (activeVideo) media.add(activeVideo);
    media.forEach(v => { if (mute) v.muted = true; v.pause(); });
  };
  const nearEnd = () => last && last.duration > 0 && last.position > 0 && last.duration - last.position <= 0.25;
  const finish = video => {
    if (finished) return;
    finished = true;
    pausedByUser = true;
    pauseAll(true);
    emit('ended', video || activeVideo);
  };
  const changedAtEnd = video => nearEnd() && (video !== activeVideo || (last.source && video.currentSrc && video.currentSrc !== last.source));
  const remember = video => {
    activeVideo = video;
    if (Number.isFinite(video.duration) && video.duration > 0) last = { position: video.currentTime, duration: video.duration, source: video.currentSrc };
  };
  const unlockLoop = video => { if (video.hasAttribute('loop')) video.removeAttribute('loop'); };
  if (loop?.set) Object.defineProperty(HTMLMediaElement.prototype, 'loop', {
    ...loop, set(value) { loop.set.call(this, this instanceof HTMLVideoElement ? false : value); }
  });
  HTMLMediaElement.prototype.play = function(...args) {
    if (this instanceof HTMLVideoElement && changedAtEnd(this)) finish(activeVideo);
    if (finished || pausedByUser) return Promise.reject(new DOMException('哔哩Song 已暂停或结束', 'AbortError'));
    return originalPlay.apply(this, args);
  };
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function(data, unused, url) {
      if (url) {
        const target = new URL(url, location.href);
        if (finished || path(target) !== path(expected) || (target.searchParams.get('p') || '1') !== (expected.searchParams.get('p') || '1')) return;
      }
      return original.apply(this, arguments);
    };
  }
  // window 捕获先于站点的 document、元素监听器，不能仅靠 document 的 ended
  window.addEventListener('ended', event => {
    if (!(event.target instanceof HTMLVideoElement)) return;
    event.stopImmediatePropagation();
    finish(event.target);
  }, true);
  window.addEventListener('play', event => {
    if (!(event.target instanceof HTMLMediaElement)) return;
    if (event.target instanceof HTMLVideoElement && changedAtEnd(event.target)) finish(activeVideo);
    if (finished || pausedByUser) { event.stopImmediatePropagation(); event.target.pause(); }
  }, true);
  window.__carbonvSongControl = (command, position, token) => {
    if (token !== song.token) return;
    const video = activeVideo?.isConnected ? activeVideo : document.querySelector('video');
    if (command === 'stop') { finished = true; pausedByUser = true; pauseAll(true); observer.disconnect(); return; }
    if (finished) return;
    if (command === 'pause') { pausedByUser = true; pauseAll(false); emit('paused', video); }
    if (command === 'play') { pausedByUser = false; if (video) originalPlay.call(video).catch(() => emit('paused', video)); }
    if (command === 'seek' && video && Number.isFinite(position)) { last = null; video.currentTime = Math.max(0, position / 1000); }
  };
  for (const name of ['playing', 'pause', 'loadedmetadata', 'timeupdate', 'emptied', 'error']) window.addEventListener(name, event => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement) || finished) return;
    unlockLoop(video);
    if ((name === 'emptied' && video === activeVideo && nearEnd()) || video.ended) { event.stopImmediatePropagation(); finish(video); return; }
    if (name === 'playing') {
      if (changedAtEnd(video)) { event.stopImmediatePropagation(); finish(activeVideo); return; }
      remember(video); emit('playing', video);
    }
    if (name === 'pause' && video.isConnected && (!activeVideo || video === activeVideo)) emit('paused', video);
    if (name === 'error' && video.error) emit('error', video);
    if (name === 'loadedmetadata') {
      if (!pausedByUser) { emit('loading', video); originalPlay.call(video).catch(() => { if (video.paused) emit('paused', video); }); }
      else emit('paused', video);
    }
    if (name === 'timeupdate') {
      remember(video);
      if (performance.now() - lastTime > 250) { lastTime = performance.now(); emit(video.paused ? 'paused' : 'playing', video); }
    }
  }, true);
  const inspect = node => {
    if (node instanceof HTMLVideoElement) unlockLoop(node);
    else if (node instanceof Element) node.querySelectorAll('video').forEach(unlockLoop);
  };
  const observer = new MutationObserver(records => {
    if (finished) { observer.disconnect(); return; }
    if (activeVideo && !activeVideo.isConnected && nearEnd()) { finish(activeVideo); return; }
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof HTMLVideoElement) unlockLoop(record.target);
      for (const node of record.addedNodes) inspect(node);
      for (const node of record.removedNodes) {
        const removed = node instanceof HTMLVideoElement ? [node] : node instanceof Element ? [...node.querySelectorAll('video')] : [];
        for (const video of removed) { video.pause(); if (video === activeVideo) { activeVideo = null; last = null; } }
      }
    }
  });
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['loop'] });
  window.addEventListener('pagehide', () => { finished = true; pauseAll(true); observer.disconnect(); }, {once:true});
})();`;
