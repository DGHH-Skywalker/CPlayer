import { describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import type { SchoolSnapshot } from "@shared/types/school";
import { defaultSchoolConfig } from "@shared/school/schedule";
const cleanup = vi.hoisted(() => vi.fn());
vi.mock("./requestPlayback", () => ({ stopAndClearForClass: cleanup }));
import { schoolState } from "@/stores/school";
import { initSchoolBridge } from "./schoolScheduleBridge";

it("已确认的重复结束事件不清除下一课间的新队列", async () => {
  const ended: SchoolSnapshot = {
    config: { ...defaultSchoolConfig, enabled: true, scheduleEnabled: true },
    phase: "CLASS",
    generation: 10,
    activeId: null,
    activeName: null,
    endAt: null,
    nextStartAt: null,
    nextEndAt: null,
    pendingClear: "ended",
    lastCleared: null,
  };
  let receive!: (state: SchoolSnapshot) => void;
  cleanup.mockImplementation(async () => {
    schoolState.value = { ...ended, pendingClear: null, lastCleared: "ended" };
  });
  Object.assign(window, {
    api: {
      school: {
        get: async () => ended,
        onState: (callback: typeof receive) => {
          receive = callback;
          return () => {};
        },
      },
    },
  });
  await initSchoolBridge();
  expect(cleanup).toHaveBeenCalledOnce();
  receive({
    ...ended,
    phase: "BREAK",
    activeId: "next",
    endAt: Date.now() + 60000,
    pendingClear: null,
    lastCleared: "ended",
  });
  receive(ended);
  await flushPromises();
  expect(cleanup).toHaveBeenCalledOnce();
  expect(schoolState.value.phase).toBe("BREAK");
});

describe("调度快照代次", () => {
  it("旧代次快照不能覆盖当前锁定", async () => {
    schoolState.value = {
      ...schoolState.value,
      generation: 20,
      pendingClear: "new",
      phase: "CLASS",
    };
    let receive!: (state: SchoolSnapshot) => void;
    Object.assign(window, {
      api: {
        school: {
          get: async () => schoolState.value,
          onState: (callback: typeof receive) => {
            receive = callback;
            return () => {};
          },
        },
      },
    });
    cleanup.mockImplementation(async () => {});
    await initSchoolBridge();
    receive({ ...schoolState.value, generation: 1, phase: "BREAK", pendingClear: null });
    expect(schoolState.value.generation).toBe(20);
    expect(schoolState.value.phase).toBe("CLASS");
  });
});
