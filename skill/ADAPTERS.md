# 接入生图能力（给 AI 助手看的说明）

穿搭工作台本身不带生图模型。它会把每套搭配写成提示词，效果图由用户已有的生图能力生成。本文件告诉你（用户正在使用的 AI 助手）怎样检查用户电脑上有什么能力、怎样接入、接不上时怎么办。

所有命令都在 `skill/` 目录（本文件所在目录）下执行。

## 0. 三条规矩

1. **不花钱地检查，花钱前先问。** 第 1 节的检查不会生成图片。真实生成一张来验证会消耗用户的用量或费用，先说明并取得用户同意，只试一次。
2. **不碰用户的照片和凭据。** 不要把用户的穿搭照发给任何服务或放进提示词；不要把 API 密钥写进本目录的任何文件；不要改用户的账号、登录或付费设置。
3. **只改接入相关的文件。** 只能新增或修改 `generator.json` 和 `adapters/` 里的文件。不要改 `web/` 和 `server/`，不要放宽沙盒或权限，不要让服务监听 `127.0.0.1` 以外的地址。

## 1. 检查（不生成图片）

```sh
node server/check.mjs
```

输出 JSON，关键字段：

| 字段 | 含义 |
|---|---|
| `node.ok` | Node.js 版本是否满足（需要 20.11 或更新） |
| `portState` | `free` 端口空闲；`workbench` 穿搭工作台已在运行；`other` 被其他程序占用 |
| `selected` | 当前接入的适配器；`none` 表示未接入；`invalid` 表示 `generator.json` 写错了，原因在 `selectionProblem` |
| `adapters.<名称>.status` | 每个现成适配器的状态，见下表 |

| 状态 | 含义 |
|---|---|
| `ready` | 可以用 |
| `missing` | 找不到这个工具 |
| `login` | 工具在，但需要登录 |
| `api-key` | （Codex）正在用 API 密钥登录，会按量计费；穿搭工作台不会用它自动生成 |
| `quota` | 额度不足 |
| `waiting-agent` | （AI 助手代生成）当前没有 AI 助手在领取任务——这对 `agent` 是正常的初始状态 |
| `invalid` | `status()` 出错。适配器文件不合契约时没有 `status`，而是 `valid` 为 `false`，原因在 `problems` |

**判断能力时只看检查结果和你自己真实拥有的工具，不要凭工具名称、模型自我介绍或「已登录」推断能生图。**

## 2. 选择路线

| 情况 | 路线 |
|---|---|
| `codex` 状态是 `ready` | 第 3 节：接入 Codex |
| 你自己在对话里有生图工具，并且能把生成的图片存成本机文件 | 第 4 节：AI 助手代生成 |
| 用户电脑上有其他能在命令行里生图的工具，且你确认它能把图片写到指定文件 | 第 5 节：写一个适配器 |
| 以上都没有 | 不接入。告诉用户：「没有找到可以接入的生图工具。配色、搭配和收藏照常可用，效果图按网页上的三步生成。」 |

## 3. 接入 Codex

1. 写入 `generator.json`：

   ```json
   {"adapter":"codex"}
   ```

2. 如果穿搭工作台正在运行，先 `node server/stop.mjs`，再 `node server/start.mjs`。
3. 告诉用户：「可以用 Codex 自动生成效果图。先生成 1 张试试的话，会消耗一次用量。告诉我要不要试。」用户同意后运行：

   ```sh
   node server/check.mjs --try
   ```

   `try.ok` 为 `true` 即接入成功，图片在 `try.file`（可以让用户看一眼）。
4. 之后用户上传穿搭照时会自动生成 3 张，消耗用户的 Codex 额度。用户可以在网页的 SETTINGS 关闭自动生成。Codex 使用 ChatGPT 账号登录时才会自动生成；检测到 API 密钥登录会暂停。

## 4. AI 助手代生成

网页无法直接调用你在对话里的工具，所以由你在对话里「领任务、生成、交回」。前提：你能用自己的工具生成图片，并把图片保存成本机文件。你只在对话里有人跟你说话时才会工作，所以流程是：**用户在网页上点生成 → 回到对话告诉你 → 你把排队的任务处理完**。

1. 写入 `generator.json`：

   ```json
   {"adapter":"agent"}
   ```

2. 重启穿搭工作台（`node server/stop.mjs`，再 `node server/start.mjs`），对用户说：「穿搭工作台已打开。在网页上点「用 AI 助手生成」后，回到这里告诉我，我来生成效果图。」
3. 用户告诉你点好了以后，运行：

   ```sh
   node server/agent.mjs next --wait 60
   ```

   - 输出带 `job` 和 `prompt`：用你的生图工具**严格按 `prompt` 的文字**生成一张竖版图片，保存成本机 PNG、JPEG 或 WebP 文件，然后运行 `node server/agent.mjs done <job> <图片文件路径>`；生成失败时运行 `node server/agent.mjs fail <job>`。然后再运行一次 `next`，直到没有任务。
   - 输出 `{"job":null}`：队列里没有任务了，告诉用户已经处理完。
   - `--wait` 是等待秒数，最大 110。你的命令工具有超时限制时，用比它短的等待时间。
4. 一个任务 10 分钟内没有交回（不管有没有领取），网页会判为超时；用户可以再点一次。任务被领走之前，网页上的卡片显示「排队中」，并提示「等待 AI 助手。回到对话，让它生成效果图。」；领走后显示「生成中」。
5. 每张图会消耗你所用服务的用量，费用以该服务的规则为准，不要向用户承诺「免费」。

## 5. 接入其他命令行生图工具

1. 复制 `adapters/template-cli.mjs` 为 `adapters/<名称>.mjs`（名称只用小写字母、数字、连字符），把 `id` 改成同一个名称。
2. 按工具的真实用法改写 `status()` 和 `generate()`，字段见第 6 节。`status()` 只能做不花钱的检查（例如查版本、查登录状态）。
3. 运行 `node server/check.mjs`，确认 `adapters.<名称>.valid` 为 `true`、`status` 为 `ready`。
4. 写入 `{"adapter":"<名称>"}` 到 `generator.json`，重启服务，按第 3 节第 3 步取得用户同意后运行 `node server/check.mjs --try`。

不要在适配器里写入密钥。子进程只拿到系统基础变量（路径、主目录、语言、代理、证书）和你在 `environment` 数组里写的变量名；`OPENAI_API_KEY`、`CODEX_API_KEY` 即使写了也一律不传。如果你声明了某个服务的密钥变量，就会按该服务的规则计费，先告诉用户。

## 6. 适配器契约

`adapters/<名称>.mjs` 默认导出一个对象：

| 字段 | 要求 |
|---|---|
| `id` | 与文件名相同，小写字母、数字、连字符，最长 32 |
| `label` | 网页上显示的供应方名称，1–20 个字符 |
| `cost` | `subscription`（消耗订阅额度）、`metered`（按量计费）、`free`、`unknown`；只用来选择费用提示，不要写价格 |
| `background` | `true`：服务能在后台独立调用；`false`：需要 AI 助手在线 |
| `cancel` | `stop`：取消后不会再产生用量（有依据才填）；`discard`：取消只丢弃结果，已开始的生成可能仍计入用量，网页会这样提示 |
| `cacheKey` | 会影响生成结果的配置（工具、模型、关键参数），换了就要改；1–200 个字符 |
| `environment` | 可选，工具需要的环境变量名数组 |
| `concurrency` | 可选，同时生成的数量，1–4 |
| `timeoutMs` | 可选，单张超时毫秒数，10000–900000；超时后服务会放弃这次生成并释放名额，即使 `generate()` 没有返回 |
| `status({directory, runtime})` | 返回第 1 节表中的状态字符串。不得生成图片 |
| `generate({id, prompt, directory, runtime, timeoutMs, signal, started})` | 按 `prompt` 生成一张图，写进 `directory`，返回文件名。收到 `signal` 的取消信号时停止。`background` 为 `false` 的适配器在任务真正开始时调用 `started()`，网页从「排队中」变为「生成中」。失败时抛出带 `code` 的错误：`login`、`api-key`、`quota`、`timeout`、`missing`、`failed` |

服务不相信文字上的「成功」：返回的文件必须真实存在于 `directory`、不是指向别处的链接、是 20MB 以内的 PNG / JPEG / WebP、边长 64–8192 像素，否则判为失败。

## 7. 恢复为未接入

把 `generator.json` 改成 `{"adapter":"none"}`（同目录的 `generator.example.json` 就是这个内容，可以直接复制），重启服务。
