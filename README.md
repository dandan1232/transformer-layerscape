# Transformer LayerScape｜层境

一个面向中文学习者的 Transformer 交互式教学项目。它计划把二维计算过程、三维模型空间、中文分步课程和浏览器内模型运行整合为一套同步体验，帮助学习者看懂一次完整的 next-token prediction。

## 当前状态

项目已完成 **M2：完整预置 Transformer 课程**，WP-20～WP-27 已全部验收。

- React、Vite、TypeScript 基础工程已建立。
- 产品边界、需求、实施路线和测试验收方案已经固化。
- M1 的测试基线、中文工作台、统一 `ModelTrace`、共享 Store、中文课程、二维计算、三维空间、完整联动、能力检测、错误恢复和综合验收已经完成。
- 当前页面可以学习 Token、Embedding、LayerNorm、Q/K/V、Attention、Residual、MLP 与 Output 共十四项中文课程，在二维图中查看位置编码相加、归一化分布、三路投影、跨 Head 差异、两条残差旁路、`8→32→8` 前馈网络和完整词表概率，并通过 Temperature、Top-k、Top-p 与 Seed 实验可复现的采样结果；自由探索台支持跨步骤选择算子、Token、Block 与 Head，同时保留返回课程锚点的入口。三维空间同步展示 CONCAT、Pre-Norm、MLP 与 Block 输出链路。移动端按窄屏、粗指针和内存能力切换简化三维，横竖屏变化后会恢复当前课程、二维视图和共享选择；系统同时保存本地进度，并在数据、子视图或 WebGL Context 失败时保持核心课程可用。
- 当前自动化基线为 157 条单元/组件测试和 19 条端到端场景；生产构建已通过 Chrome 全套回归与 Edge 主路径回归。

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
| M3 | 浏览器真实模型模式 | 待实施 |
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
```

首次运行 Playwright 前，需要安装测试浏览器：

```bash
npx playwright install
```

CI 尚未配置；修改 GitHub Actions 前需另行确认。

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
