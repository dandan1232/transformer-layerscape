# Transformer LayerScape｜文档导航

本目录保存产品、技术、实施和测试文档。文档使用中文编写，并通过稳定编号建立“需求→工作包→测试→验收”的追踪关系。

## 推荐阅读顺序

| 顺序 | 文档 | 解决的问题 | 状态 |
| --- | --- | --- | --- |
| 1 | [产品需求文档](./requirements/product-requirements.md) | 做什么、为谁做、如何验收 | 1.0 已确认 |
| 2 | [产品与技术设计](./plans/2026-07-24-transformer-layerscape-design.md) | 2D/3D、课程、数据与模型如何统一 | 已确认 |
| 3 | [实施路径与交付计划](./plans/implementation-roadmap.md) | 按什么顺序实现、每包如何提交 | 1.0 待执行 |
| 4 | [测试与验收方案](./testing/test-and-acceptance.md) | 如何证明正确、可用且可发布 | 1.0 持续维护 |

## 追踪方式

```text
产品需求 ID
  ↓
实施工作包 WP
  ↓
单元/组件/E2E 用例
  ↓
里程碑验收报告
  ↓
Commit SHA 与发布版本
```

示例：

```text
FR-SYNC-001 统一选择状态
  → WP-13 共享 Store
  → WP-17 双向联动
  → E2E-03 / E2E-04
  → M1 验收报告
```

## 文档目录

```text
docs/
├─ README.md
├─ requirements/
│  └─ product-requirements.md
├─ plans/
│  ├─ 2026-07-24-transformer-layerscape-design.md
│  └─ implementation-roadmap.md
└─ testing/
   ├─ test-and-acceptance.md
   └─ reports/
      ├─ wp-10-test-baseline.md
      └─ wp-11-app-shell.md
```

后续里程碑验收报告放在 `docs/testing/reports/`，技术探针和重要架构取舍应放在 `docs/decisions/`，并从本页增加入口。

## 验证记录

- [WP-10 前端测试运行基线](./testing/reports/wp-10-test-baseline.md)：Vitest、Testing Library、覆盖率、Playwright 项目与 Chromium 冒烟。
- [WP-11 中文学习工作台外壳](./testing/reports/wp-11-app-shell.md)：设计 Token、响应式工作台、键盘交互与视觉验证。

## 文档维护规则

1. 产品范围、隐私边界、核心模型或下载体积发生变化时，先更新 PRD 并确认。
2. 技术边界或统一数据契约变化时，同步更新设计与实施路径。
3. 工作包新增、拆分或合并时，保证 WP 编号稳定；废弃编号不重复使用。
4. 新增需求时分配唯一 `FR-*` 或 `NFR-*` 编号，并补充验收条件。
5. 新增用户可见能力时，同时补充需求追踪和测试用例。
6. 每个里程碑结束时提交验收报告，记录命令、环境、结果、缺陷和 Commit SHA。
7. 文档中的“已完成”必须与远端代码和验证证据一致。
8. 文档 Commit 与功能 Commit 分开，避免产品边界变化藏在实现改动中。

## 当前交付状态

| 交付点 | Commit | 状态 |
| --- | --- | --- |
| 产品与技术设计基线 | `e311d82` | 已推送 |
| 中文产品需求文档 | `ffe2e7c` | 已推送 |
| 分阶段实施路径 | `131fa97` | 已推送 |
| 测试与验收规范 | `c13d442` | 已推送 |
| 文档导航 | 本文所在提交 | 随本文推送 |

后续实施工作包的 Commit SHA 和验证结果统一记录在对应里程碑验收报告中，不通过修改历史提交补写。
