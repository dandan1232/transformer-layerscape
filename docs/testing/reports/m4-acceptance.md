# M4｜发布完善验收报告

日期：2026-08-11

范围：WP-40～WP-45

结论：M4 代码、自动化质量门禁与生产发布链路通过；无 P0/P1 未解决缺陷。

## 1. 自动化结果

| 验证项 | 结果 |
| --- | --- |
| `npm run lint` | 通过，0 warning |
| `npm run test:coverage` | 29 个文件、216 个用例通过 |
| Statements / Branches | 85.47% / 76.51% |
| Functions / Lines | 79.79% / 86.94% |
| `npm run build` | 通过 |
| 生产依赖审计 | 0 个已知漏洞 |
| Chrome 发布与 WCAG A/AA | 桌面 5 / 5、移动 5 / 5 |
| Chrome 产品冒烟 | 8 / 8 |
| Chrome 性能预算 | 2 / 2 |
| 视觉回归 | 9 / 9 |

GitHub Actions 在部署前并行验证 desktop-chromium、desktop-firefox、desktop-webkit、mobile-chrome 和 mobile-safari；任一项目失败都会阻止生产部署。

性能门禁区分两组阈值：本地/专用机器使用表中严格预算；GitHub 共享虚拟 runner 使用宽松的回归保护线，以避免软件 GPU 和邻居噪声造成假失败。两组仍运行同一采样逻辑并保留指标日志。

## 2. 无障碍与韧性

- 关键课程和真实模型确认弹窗通过 axe WCAG 2 A/AA、2.1 A/AA 与 2.2 AA 自动扫描；
- 修正次要文字对比度，二维 SVG 使用允许交互后代的语义分组；
- SVG 实体支持 Enter/Space，Token 公开 `aria-pressed` 状态；
- 真实模型弹窗自动移入焦点、限制 Tab 循环、支持 Escape 并恢复触发按钮焦点；
- 跳过导航、减少动态效果、无 WebGL、Context 丢失、数据错误和移动端安全路径均有自动化覆盖。

## 3. 性能预算

本机生产构建、系统 Chrome、单 worker 样本：

| 指标 | 结果 | 门槛 |
| --- | --- | --- |
| 首次可交互 | 705ms | < 3000ms |
| 三维场景就绪 | 952ms | < 5000ms |
| 步骤反馈 | 9.2ms | ≤ 100ms |
| 桌面帧率 | 43.7 FPS | ≥ 30 FPS |
| 移动简化三维帧率 | 52.8 FPS | ≥ 20 FPS |
| 最长任务 | 303ms | < 500ms |
| 外部请求 | 0 | 0 |

时间线进度改为 transform 动画，避免宽度变化触发布局。三维异步 chunk 原始体积约 948kB（gzip 253kB），仍超过 Vite 500kB 提示线，但不在首屏同步 chunk，交互与场景就绪均显著低于预算，因此作为 P2 已知例外保留。

## 4. 发布与安全

- 生产构建只从已验证的 Actions artifact 部署；
- SSH 密钥与 known_hosts 只保存在 GitHub Secrets；
- 远端使用增量同步、临时容器健康检查、带 Commit SHA 镜像和失败自动回滚；
- Nginx 配置 SPA 回退、指纹资源长期缓存、首页禁止缓存，并发送 nosniff、Referrer-Policy、X-Frame-Options 和 Permissions-Policy；
- 生产入口：<https://tl.nianan.ggff.net/>。

## 5. 已知非阻断项

1. `onnxruntime-node` 仅用于本地模型探针，位于开发依赖；其上游压缩包依赖暂无兼容修复。它不进入浏览器生产 bundle，生产依赖审计为 0。
2. 真实 iOS/Android GPU、刘海安全区和浏览器手势仍建议在后续有设备时补充人工巡检；自动移动配置已进入每次发布门禁。
3. Three.js 依赖链仍会输出 `THREE.Clock` 弃用提示，不影响当前功能、帧率或 Context 恢复。
