# Cplayer · CarbonVPlayer

Windows-first desktop music requests, school break scheduling and Bilibili MV playback.

[简体中文](README.zh-CN.md) · [Latest release](https://github.com/DGHH-Skywalker/CPlayer/releases/latest) · [Issues](https://github.com/DGHH-Skywalker/CPlayer/issues)

## Download

Use the Windows x64 **setup** installer or single-file **portable** EXE from [GitHub Releases](https://github.com/DGHH-Skywalker/CPlayer/releases/latest). Verify the download with `SHA256SUMS.txt` from the same release. Mainland mirror links are listed in each release; they are third-party download proxies.

## Features

- Normal music playback, local library, streaming servers, lyrics and playlists
- Optional campus mode with a search home, FIFO requests, duplicate detection and drag sorting
- Weekly break schedules in Asia/Shanghai, date exceptions and automatic hard stop with queue clearing at class time
- Isolated Bilibili browser, MV theater, fixed local Core, audio coordination and browser-data controls
- Experimental **哔哩Song**: add the current MV page to the queue, block website continuation and advance to the next queue item
- Independent builds and manual release downloads; official automatic updating is disabled

## Start using it

Open **Settings → 校园点歌** to configure campus mode, actual school times and the browser. No school timetable is preset. Enable **哔哩Song（实验性）** under the Bilibili/MV section, open a video and select **加入队列** on the floating button at the lower right.

See [school scheduling](docs/school-scheduler.md), [Bilibili integration](docs/bilibili-integration.md), [哔哩Song](docs/bilibili-song.md) and [test evidence](docs/testing.md). Physical audio, sleep/resume and real-account checks require an interactive test machine; automated checks do not establish those results.

## Development and releases

Use Node 24.22.1, pnpm 12.15.0 and the Rust toolchain required by the native modules. Dependencies are locked. See [release maintenance](docs/releasing.md).

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build:win --x64 --publish never
```

GitHub Actions runs the checks, builds native modules and Windows packages, launches the portable app and publishes versioned releases with source archives, provenance and SHA-256 checksums. A separate Windows workflow checks anonymous video playback with Core enabled, no-login disabled and Core disabled.

## License and attribution

AGPL-3.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE.md). Original contributions retain their authors' copyrights. The bundled Core retains its [MIT license](vendor/bilikit/LICENSE) and [brand asset terms](vendor/bilikit/BRAND-ASSETS.md). Music, videos and platform accounts remain subject to their providers' rules.
