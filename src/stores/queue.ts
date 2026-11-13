import { toRaw } from "vue";
import localforage from "localforage";
import { assignLocalCovers, loadLocalFiles, stripLocalCoverData } from "@/api/local";
import { streamingSongUrl } from "@/api/streaming";
import { getSongDetail } from "@/api/song";
import { resolveDailyDateTrack } from "@/core/player/online";
import { usePlayer } from "@/core/player";
import { useMediaStore } from "@/stores/media";
import { useStatusStore } from "@/stores/status";
import { normalizeLocalTrack } from "@/utils/localTrack";
import type {
  PlaybackContext,
  PlaybackSource,
  PlayMode,
  Track,
  TrackOrigin,
} from "@/types/player";
import { buildTrackKey } from "@/utils/trackKey";

const db = localforage.createInstance({ name: "splayer", storeName: "queue" });

const queueEntries = shallowRef<Track[]>([]);
const originalQueue = shallowRef<Track[] | null>(null);
const activeContext = ref<PlaybackContext>({ type: "liked", source: null });
const playMode = ref<PlayMode>("sequential");
const activeOrigin = ref<TrackOrigin>({ type: "unknown" });
let writeGeneration = 0;
let writeChain: Promise<void> = Promise.resolve();

/** 串行写入快照；新写入总是排在旧写入之后，避免旧清空任务覆盖新状态。 */
const save = (): Promise<void> => {
  const generation = ++writeGeneration;
  const queueSnapshot = toRaw(queueEntries.value);
  const originalSnapshot = toRaw(originalQueue.value);
  const operation = writeChain.then(async () => {
    if (generation !== writeGeneration) return;
    await Promise.all([
      db.setItem("playList", queueSnapshot),
      db.setItem("originalPlayList", originalSnapshot),
    ]);
  });
  writeChain = operation.catch(() => {});
  return operation;
};

const reportSave = (): void => {
  void save().catch(console.error);
};

/** 恢复队列并重新解析需要在线播放的 URL。 */
export const restoreQueue = async (): Promise<void> => {
  await writeChain;
  const [savedQueue, savedOriginal, savedContext, savedMode, savedOrigin] = await Promise.all([
    db.getItem<Track[]>("playList"),
    db.getItem<Track[] | null>("originalPlayList"),
    db.getItem<PlaybackContext>("context"),
    db.getItem<PlayMode>("mode"),
    db.getItem<TrackOrigin>("origin"),
  ]);
  const player = usePlayer();
  if (savedQueue?.length) {
    const needsUrl = savedQueue.some(
      (track) =>
        track.source === "local" ||
        (track.source === "stream" && !track.fileName) ||
        (!track.url && track.source === "netease") ||
        track.source === "daily-date",
    );
    if (needsUrl) {
      // 恢复失败的条目保留在队列，播放时会再次按需解析。
      const mediaStore = useMediaStore();
      const resolved = await Promise.all(
        savedQueue.map(async (track) => {
          const normalized = track.source === "local" ? normalizeLocalTrack(track) : track;
          if (normalized.source === "local") {
            const localFile = mediaStore.localFiles.find(
              (file) => file.id === normalized.id || file.path === normalized.filePath,
            );
            const fileName = localFile?.fileName ?? normalized.fileName;
            if (!fileName) return normalized;
            return { ...normalized, url: `local://${fileName}` };
          }
          if (normalized.source === "stream" && !normalized.fileName) {
            if (!normalized.meta?.fileId) return normalized;
            try {
              const url = await streamingSongUrl(normalized.meta.fileId);
              return { ...normalized, url };
            } catch {
              return normalized;
            }
          }
          if (!normalized.url && normalized.source === "netease") {
            return player.resolveTrack(normalized);
          }
          if (normalized.source === "daily-date") {
            try {
              return await resolveDailyDateTrack(normalized);
            } catch {
              return normalized;
            }
          }
          return normalized;
        }),
      );
      await assignLocalCovers(stripLocalCoverData(resolved));
      queueEntries.value = resolved;
    } else {
      queueEntries.value = savedQueue;
    }
  }
  originalQueue.value = savedOriginal;
  if (savedContext) activeContext.value = savedContext;
  if (savedMode) playMode.value = savedMode;
  if (savedOrigin) activeOrigin.value = savedOrigin;
};

const saveContext = (): void => {
  db.setItem("context", toRaw(activeContext.value)).catch(console.error);
};

const saveMode = (): void => {
  db.setItem("mode", playMode.value).catch(console.error);
};

const saveOrigin = (): void => {
  db.setItem("origin", toRaw(activeOrigin.value)).catch(console.error);
};

export const setPlayMode = (mode: PlayMode): void => {
  playMode.value = mode;
  saveMode();
};

export const setActiveOrigin = (origin: TrackOrigin): void => {
  activeOrigin.value = origin;
  saveOrigin();
};

export const useQueueStore = () => ({
  queueEntries: readonly(queueEntries),
  originalQueue: readonly(originalQueue),
  queueLength: computed(() => queueEntries.value.length),
  activeContext: readonly(activeContext),
  playMode: readonly(playMode),
  activeOrigin: readonly(activeOrigin),
  queueCovers: computed(() =>
    queueEntries.value
      .slice(0, 4)
      .map((t) => t.cover)
      .filter((c): c is string => !!c),
  ),
});

export const setQueue = (items: readonly Track[], context?: PlaybackContext): void => {
  queueEntries.value = [...items];
  originalQueue.value = null;
  if (context) setContext(context);
  reportSave();
};

export const setContext = (context: PlaybackContext): void => {
  activeContext.value = context;
  saveContext();
};

export const insertToQueue = (
  item: Track,
  index: number,
  context?: PlaybackContext,
): void => {
  const entries = [...queueEntries.value];
  entries.splice(index, 0, item);
  queueEntries.value = entries;
  if (context) setContext(context);
  reportSave();
};

export const insertManyToQueue = (
  items: Track[],
  index: number,
  context?: PlaybackContext,
): void => {
  const entries = [...queueEntries.value];
  entries.splice(index, 0, ...items);
  queueEntries.value = entries;
  if (context) setContext(context);
  reportSave();
};

export const moveInQueue = (fromIndex: number, toIndex: number): void => {
  if (fromIndex === toIndex) return;
  const entries = [...queueEntries.value];
  const [item] = entries.splice(fromIndex, 1);
  if (!item) return;
  entries.splice(toIndex, 0, item);
  queueEntries.value = entries;
  reportSave();
};

/** 清空并等待两个队列键落盘，随后读回验证。 */
export const clearQueue = async (): Promise<void> => {
  queueEntries.value = [];
  originalQueue.value = null;
  await save();
  const [storedQueue, storedOriginal] = await Promise.all([
    db.getItem<Track[]>("playList"),
    db.getItem<Track[] | null>("originalPlayList"),
  ]);
  if ((storedQueue?.length ?? 0) !== 0 || (storedOriginal?.length ?? 0) !== 0) {
    throw new Error("队列清空后的存储验证失败");
  }
};

export const shuffleQueue = (keepIndex: number): void => {
  const entries = [...queueEntries.value];
  if (keepIndex < 0 || keepIndex >= entries.length) return;
  if (!originalQueue.value) originalQueue.value = [...entries];
  const current = entries[keepIndex];
  const rest = entries.filter((_, i) => i !== keepIndex);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  queueEntries.value = [current!, ...rest];
  reportSave();
};

/** 恢复原始顺序，返回当前歌曲索引。 */
export const unshuffleQueue = (currentTrackId: string): number => {
  if (!originalQueue.value) return -1;
  const entries = [...originalQueue.value];
  queueEntries.value = entries;
  originalQueue.value = null;
  reportSave();
  const index = entries.findIndex((track) => track.id === currentTrackId);
  if (index >= 0) return index;
  return entries.findIndex((track) => buildTrackKey(track) === currentTrackId);
};

export const findTrackIndex = (trackId: string): number => {
  return queueEntries.value.findIndex((track) => track.id === trackId);
};

export const clearQueuePersistenceForTests = async (): Promise<void> => {
  await writeChain;
  await db.clear();
};
