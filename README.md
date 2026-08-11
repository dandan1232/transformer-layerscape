# Transformer LayerScape｜层境

一个面向中文学习者的 Transformer 交互式教学项目。它计划把二维计算过程、三维模型空间、中文分步课程和浏览器内模型运行整合为一套同步体验，帮助学习者看懂一次完整的 next-token prediction。

在线使用：[https://tl.nianan.ggff.net/](https://tl.nianan.ggff.net/)

## 当前状态

项目已完成 **M2：完整预置 Transformer 课程**，并进入 **M3：浏览器真实模型模式**。WP-30～WP-35 已完成资源固定、插桩、Worker、下载缓存、统一 Trace 适配和参数实验，WP-36 已完成浏览器推理的性能与内存治理。

- React、Vite、TypeScript 基础工程已建立。
- 产品边界、需求、实施路线和测试验收方案已经固化。
- M1 的测试基线、中文工作台、统一 `ModelTrace`、共享 Store、中文课程、二维计算、三维空间、完整联动、能力检测、错误恢复和综合验收已经完成。
- 当前页面可以学习 Token、Embedding、LayerNorm、Q/K/V、Attention、Residual、MLP 与 Output 共十四项中文课程，在二维图中查看位置编码相加、归一化分布、三路投影、跨 Head 差异、两条残差旁路、`8→32→8` 前馈网络和完整词表概率，并通过 Temperature、Top-k、Top-p 与 Seed 实验可复现的采样结果；自由探索台支持跨步骤选择算子、Token、Block 与 Head，同时保留返回课程锚点的入口。三维空间同步展示 CONCAT、Pre-Norm、MLP 与 Block 输出链路。移动端按窄屏、粗指针和内存能力切换简化三维，横竖屏变化后会恢复当前课程、二维视图和共享选择；系统同时保存本地进度，并在数据、子视图或 WebGL Context 失败时保持核心课程可用。
- M2 自动化基线为 157 条单元/组件测试和 19 条端到端场景；生产构建已通过 Chrome 全套回归与 Edge 主路径回归。
- 真实模型候选固定为 DistilGPT-2 的不可变 Revision，预计主动下载 87.02MB；文件哈希、加载覆盖项和许可证边界见 [真实模型资源基线](./MODEL_RESOURCES.md) 与 [第三方声明](./THIRD_PARTY_NOTICES.md)。
- 插桩图通过 Node CPU 与浏览器 WASM 实测，81 个额外输出覆盖 Embedding、Q/K/V、Attention、Residual 与 MLP，完整下载仍约 87.03MB；方案与数值校验见 [插桩 ONNX 技术探针](./MODEL_INSTRUMENTATION.md)。
- [模型 Worker 协议](./MODEL_WORKER_PROTOCOL.md)已覆盖握手、加载进度、推理、取消、释放、结构化错误和张量 Transferable，后续下载与缓存实现复用同一请求关联机制。
- [真实模型下载与缓存](./MODEL_DOWNLOAD_CACHE.md)已实现下载前确认、流式进度、取消、重试、SHA-256 校验和按 Revision 隔离的 Cache Storage；浏览器实测从缓存读取 87,020,477 字节并在 Worker 内完成插桩与 WASM Session 初始化，主线程保持响应。
- [真实模型轨迹适配器](./MODEL_TRACE_ADAPTER.md)把所选 DistilGPT-2 层映射为 22 个语义张量，并与预置适配器复用同一运行时契约；浏览器第 6 层实测覆盖 12 Heads、50,257 个词表候选，概率和 Attention 归一化及残差/MLP 数值校验均通过。
- [真实模型参数实验](./MODEL_EXPERIMENTS.md)支持英文输入、Layer 1～6、Temperature、Top-k、Top-p 与 Seed；精确 GPT-2 Token 数在 ONNX 执行前限制为最多 12，合法结果可切入工作台并随时恢复预置案例。
- [真实模型性能与内存](./MODEL_RUNTIME_PERFORMANCE.md)只请求所选层必需输出，分块构建可取消摘要，并提供显式 Session 释放；12 Token Trace 的 Transferable 预算不超过 1.3MB，真实浏览器恢复预置后 Worker 数回到基线。

## 目标体验

- 桌面端同屏展示中文课程、二维计算图、三维模型和统一时间轴。
- 移动端提供完整二维课程以及按能力降级的简化三维视图。
- 2D、3D、课程和时间轴读取同一份 `ModelTrace`，支持双向选中与同步播放。
- 预计算案例随站点提供，首次访问无需下载模型即可学习。
- 真实模型由用户主动下载，并在浏览器本地运行。
- 默认讲通俗中文，公式、张量形状和伪代码作为可展开的深入内容。
- 不接入账号、后端、云同步或使用统计。

## 里程碑

| 里程碑 | 目标 | 状态 |
| --- | --- | --- |
| M0 | 工程、需求、实施与测试基线 | 已完成 |
| M1 | Token→Attention→Output 联动垂直切片 | 已完成 |
| M2 | 完整预置 Transformer 课程 | 已完成 |
| M3 | 浏览器真实模型模式 | 进行中（WP-36 / 37） |
| M4 | 跨浏览器、性能、无障碍与发布完善 | 待实施 |

## M2 验收摘要

| 验证项 | 结果 |
| --- | --- |
| 单元与组件测试 | 17 个文件、157 个用例通过 |
| 覆盖率 | Statements 86.77%、Branches 77.52%、Functions 79.84%、Lines 88.26% |
| 生产构建 Chrome E2E | 19 / 19 通过，覆盖完整课程、自由探索、3D、故障恢复、移动端、视觉与性能 |
| 系统 Edge 主路径 | 8 / 8 通过 |
| 生产态性能 | 首交互 450～593ms；3D 就绪 738～842ms；步骤反馈 11～16ms；无外部请求 |

本机未安装 Firefox，Windows 也没有可用的系统 WebKit；对应 Playwright 项目已经配置，但本轮未擅自下载浏览器包。真实 iOS Safari、Android Chrome、Firefox 与 WebKit 仍属于发布前跨浏览器/真机验证边界。

## 技术栈

| 领域 | 技术 |
| --- | --- |
| 前端 | React 19、Vite 8、TypeScript |
| 二维可视化 | React SVG、D3 |
| 三维可视化 | Three.js、React Three Fiber、Drei |
| 状态与动效 | Zustand、GSAP |
| 浏览器模型 | Transformers.js、ONNX Runtime Web |
| 质量验证 | oxlint、Vitest、Playwright |

## 本地运行

环境建议：当前稳定版 Node.js 与 npm。

```bash
npm install
npm run dev
```

Vite 会输出本地访问地址。当前阶段无需模型文件或后端服务。

## 当前可用命令

```bash
# 本地开发
npm run dev

# 静态检查
npm run lint

# TypeScript 检查并生成生产构建
npm run build

# 本地预览生产构建
npm run preview

# 交互式单元测试
npm test

# 单次运行单元测试
npm run test:run

# 生成覆盖率报告
npm run test:coverage

# 运行 Playwright 端到端测试
npm run test:e2e

# 验证真实模型缓存、Worker 插桩和 WASM 初始化（需本地固定模型缓存）
npm run verify:model:download

# 验证真实第 6 层到统一 ModelTrace 的完整链路
npm run verify:model:trace
```

首次运行 Playwright 前，需要安装测试浏览器：

```bash
npx playwright install
```

生产 CI/CD 已配置在 GitHub Actions；其部署密钥只保存在 GitHub Secrets 中。

## 生产部署

推送到 `main` 后，GitHub Actions 会依次执行 lint、单元/组件测试和生产构建。验证全部通过后，工作流通过专用 SSH 密钥连接生产服务器，构建带 Commit SHA 的 Docker 镜像，并在替换 8080 端口上的现有容器前启动临时容器完成健康检查。替换后的健康检查失败时会自动恢复上一个镜像。

工作流需要在 GitHub `production` Environment 或仓库 Actions Secrets 中配置：

- `DEPLOY_HOST`：生产服务器地址；
- `DEPLOY_USER`：SSH 用户；
- `DEPLOY_SSH_KEY`：仅用于部署的私钥；
- `DEPLOY_KNOWN_HOSTS`：固定的 SSH 主机公钥记录。

生产入口为 <https://tl.nianan.ggff.net/>。部署工作流也可以从 GitHub Actions 页面手动触发。

## 开发与提交规范

实施以单个工作包为最小交付单位：

1. 开始前确认工作树和需求范围。
2. 实现最小闭环并添加相应测试。
3. 至少通过 lint、相关测试和生产构建。
4. 只暂存当前工作包涉及的文件。
5. 每个工作包独立 Commit，并在验证后 Push。
6. Commit 使用 Conventional Commits 前缀和清晰的中文描述。

删除文件、大规模重构、修改 Git 历史、修改 CI、环境配置或数据库前必须单独确认。

## 隐私与许可证

- 用户输入和模型推理计划全部留在浏览器。
- 第三方依赖、字体和模型必须保留各自要求的许可证信息。
- 项目自身使用 [MIT License](./LICENSE)，版权所有者为“念安/waitu1232”。
