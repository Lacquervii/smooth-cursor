# dsh-smooth-cursor

**中文 | [English](README.en.md)**

一个为 [DSH](https://github.com/deepseek-ai/deepseek-harness)（DeepSeek Harness）Web 聊天输入框打造的**彗星光标**插件——把原生闪烁光标替换成一枚会随输入平滑滑动的发光彗星，支持自定义拖尾、强调色和粗细。这是一个独立、可安装的 DSH 插件。

![category](https://img.shields.io/badge/category-UI_Enhancement-orange)

## 特性

- **呼吸光标** — 平滑缓动，输入时滑向文字位置，而非闪烁。
- **彗星拖尾** — 移动光标时带有渐细渐隐的拖尾。
- **可配置** — 开关特效、开关拖尾、强调色（预设色板或自定义取色）、粗细（细 / 中 / 粗）。
- **适配 IME** — 测量尊重输入法组合状态，中文、日文输入依然准确。
- **浏览器本地持久化** — 设置存于 `localStorage`，无需重启宿主或来回请求。

## 版本要求

本插件依赖官方 `@deepseek-ai/dsh-client-ui-renderer` 包，该包从 **DSH `0.1.0-rc.8` 起**才提供。请确保你的 DSH 版本不低于 `0.1.0-rc.8`；早期版本（如 `0.1.0-rc.7`）不包含此包，插件将无法加载。

```bash
dsh --version   # 确认版本号 >= 0.1.0-rc.8
```

## 安装

### 作为 DSH 插件安装（推荐）

```bash
dsh plugin --profile web add dsh-smooth-cursor
```

或通过 GitHub：

```bash
dsh plugin --profile web add github:Lacquervii/smooth-cursor
```

然后重启 `dsh web`，在 **设置 → 通用 → 输入光标** 中找到设置项。

### 手动安装（本地开发）

克隆本仓库并作为插件 bundle 添加：

```bash
git clone https://github.com/Lacquervii/smooth-cursor.git
cd smooth-cursor
pnpm install --ignore-scripts
pnpm build
```

然后在你的 profile 的 `cordis.patch.yml` 中注册：

```yaml
- insert:
    - id: smooth-cursor
      name: dsh-smooth-cursor
```

## 使用

当输入框获得焦点时特效即生效。打开 **设置 → 通用 → 输入光标** 可以：

- 开关整个特效，或仅开关彗星拖尾。
- 从色板选择强调色，或使用自定义取色器。
- 选择光标的粗细。

## 开发

```bash
pnpm install --ignore-scripts
pnpm build     # tsc 类型 + tsdown 打包（node 端 + 客户端）
pnpm watch     # 增量重建
```

`lib/` 已提交到仓库，即使包管理器阻止了 `prepare` 构建步骤，也能从 git 安装后直接运行。

## 许可证

MIT
