import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultBilibiliConfig, defaultSchoolConfig } from "@shared/defaults/school";
import type { BilibiliConfig, SchoolConfig } from "@shared/types/school";
import {
  createSchoolScheduleDocument,
  parseSchoolScheduleDocument,
  validateSchoolConfig,
} from "@shared/utils/schoolSchedule";

interface CampusConfigFile {
  version: 1;
  school: SchoolConfig;
  bilibili: BilibiliConfig;
}

const defaults = (): CampusConfigFile => ({
  version: 1,
  school: structuredClone(defaultSchoolConfig),
  bilibili: structuredClone(defaultBilibiliConfig),
});

const validateBilibili = (config: BilibiliConfig): void => {
  const keys: Array<keyof BilibiliConfig> = [
    "enabled",
    "coreEnabled",
    "noLoginEnabled",
    "mvMuted",
    "pauseMusicOnMv",
    "allowSimultaneousPlayback",
  ];
  if (!config || keys.some((key) => typeof config[key] !== "boolean")) {
    throw new Error("B 站配置格式无效");
  }
  if (config.allowSimultaneousPlayback && config.pauseMusicOnMv) {
    throw new Error("同时播放与 MV 自动暂停音乐不能同时开启");
  }
};

/** 主进程统一持有校园与 B 站配置，所有替换操作串行执行。 */
export class CampusConfigStore {
  private value = defaults();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<CampusConfigFile>;
      const school = { ...defaultSchoolConfig, ...parsed.school };
      const bilibili = { ...defaultBilibiliConfig, ...parsed.bilibili };
      validateSchoolConfig(school);
      validateBilibili(bilibili);
      this.value = { version: 1, school, bilibili };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.persist();
    }
  }

  getSchool(): SchoolConfig {
    return structuredClone(this.value.school);
  }

  getBilibili(): BilibiliConfig {
    return structuredClone(this.value.bilibili);
  }

  async setSchool(config: SchoolConfig): Promise<SchoolConfig> {
    validateSchoolConfig(config);
    this.value.school = structuredClone(config);
    await this.persist();
    return this.getSchool();
  }

  async setBilibili(config: BilibiliConfig): Promise<BilibiliConfig> {
    validateBilibili(config);
    this.value.bilibili = structuredClone(config);
    await this.persist();
    return this.getBilibili();
  }

  exportSchool(): string {
    return JSON.stringify(createSchoolScheduleDocument(this.value.school), null, 2);
  }

  async importSchool(source: string): Promise<SchoolConfig> {
    const config = parseSchoolScheduleDocument(source);
    return this.setSchool({ ...config, enabled: this.value.school.enabled });
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.value, null, 2);
    const operation = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, snapshot, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, this.filePath);
    });
    this.writeChain = operation.catch(() => {});
    await operation;
  }
}
