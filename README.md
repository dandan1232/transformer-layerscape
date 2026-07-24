# Transformer LayerScape｜层境

一个面向中文学习者的 Transformer 交互式教学项目。它计划把二维计算过程、三维模型空间、中文分步课程和浏览器内模型运行整合为一套同步体验，帮助学习者看懂一次完整的 next-token prediction。

## 当前状态

项目已完成 **M0：文档与工程基线**，正在实施 M1。

- React、Vite、TypeScript 基础工程已建立。
- 产品边界、需求、实施路线和测试验收方案已经固化。
- M1 的测试基线、中文工作台、统一 `ModelTrace`、共享 Store、播放状态机、中文课程引擎与二维计算视图已经完成，下一交付点是三维模型空间。
- 当前页面已经可以学习 Token、Attention、Output 三章八项中文课程，在二维图中查看真实教学 Trace 的 Token、Q/K/V、因果掩码、Attention 权重和输出概率，并进行前后导航、播放、暂停和重置；三维场景仍是教学预览，将在后续工作包替换。

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
| M1 | Token→Attention→Output 联动垂直切片 | 进行中 |
| M2 | 完整预置 Transformer 课程 | 待实施 |
| M3 | 浏览器真实模型模式 | 待实施 |
| M4 | 跨浏览器、性能、无障碍与发布完善 | 待实施 |

## 项目文档

建议按以下顺序阅读：

1. [产品需求文档](./docs/requirements/product-requirements.md)：用户、目标、功能编号、优先级与验收标准。
2. [产品与技术设计](./docs/plans/2026-07-24-transformer-layerscape-design.md)：产品边界、交互、架构和模型方案。
3. [实施路径与交付计划](./docs/plans/implementation-roadmap.md)：36 个原子工作包、依赖、测试门槛和 Commit 粒度。
4. [测试与验收方案](./docs/testing/test-and-acceptance.md)：分层测试、性能预算、浏览器矩阵和放行规则。
5. [文档导航](./docs/README.md)：文档状态和维护约定。

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

测试分层、支持矩阵和不同里程碑的放行条件见[测试与验收方案](./docs/testing/test-and-acceptance.md)。CI 尚未配置；修改 GitHub Actions 前需另行确认。

## 开发与提交规范

实施以 [工作包](./docs/plans/implementation-roadmap.md#11-每个工作包的执行模板) 为最小交付单位：

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
