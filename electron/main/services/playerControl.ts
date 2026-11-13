import type { Track } from "@shared/types/track";
import { sendToMain } from "../ipc";
import { getPlayer } from "../core/player";
import { neteaseScrobble } from "./neteaseScrobble";
import { lastfm } from "./lastfm";
import {
  canStartPlayback,
  isSchoolModeEnabled,
} from "./schoolPlaybackGate";
import { stopAllPlayback } from "./playbackShutdown";

export const playerControl = {
  getState: () => getPlayer().getPlaybackState(),
  getLastPlaybackError: () => getPlayer().getLastPlaybackError(),
  play: (): void => {
    if (!canStartPlayback()) return;
    void getPlayer().play().catch(() => {});
  },
  pause: (): void => getPlayer().pause(),
  resume: (): void => {
    if (!canStartPlayback()) return;
    void getPlayer().resume().catch(() => {});
  },
  stop: (): void => {
    void stopAllPlayback().catch(() => {});
  },
  seek: (seconds: number): void => getPlayer().seek(seconds),
  setVolume: (volume: number): void => getPlayer().setVolume(volume),
  setSpeed: (speed: number): void => getPlayer().setSpeed(speed),
  next: (): void => {
    if (!canStartPlayback()) return;
    sendToMain("player:event", { type: "next" });
  },
  prev: (): void => {
    if (!canStartPlayback()) return;
    sendToMain("player:event", { type: "prev" });
  },
  playTrack: (track: Track): void => {
    if (!canStartPlayback()) return;
    sendToMain("player:event", { type: "playTrack", data: { track } });
  },
  addToQueue: (tracks: Track[], position: "next" | "end"): void => {
    if (!canStartPlayback()) return;
    sendToMain("player:event", {
      type: "addToQueue",
      data: { tracks, position: isSchoolModeEnabled() ? "end" : position },
    });
  },
  onPlay: (): void => {
    if (!canStartPlayback()) return;
    neteaseScrobble.onPlay();
    lastfm.onPlay();
  },
  onPause: (): void => {
    neteaseScrobble.onPause();
    lastfm.onPause();
  },
  onStopped: (): void => {
    neteaseScrobble.onStopped();
    lastfm.onStopped();
  },
};
