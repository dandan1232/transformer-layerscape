# WP-10｜前端测试运行基线验证记录

日期：2026-07-24

工作包：WP-10 测试运行器与质量脚本

对应要求：NFR-MAINT-001、M1 测试出口

结论：通过，可以进入 WP-11

## 1. 交付范围

本工作包完成：

- Vitest + jsdom 测试环境；
- Testing Library、jest-dom 与 user-event；
- V8 覆盖率输出；
- Playwright 桌面 Chromium、Firefox、WebKit及移动 Chrome、Safari 项目；
- Playwright 本地 Vite Server；
- React DOM 环境冒烟测试；
- 真实浏览器应用启动冒烟测试；
- `test`、`test:run`、`test:coverage`、`test:e2e` 与视觉基线更新脚本。

本工作包未修改 GitHub Actions 或其他 CI 配置。

## 2. 验证环境

| 项目 | 版本或环境 |
| --- | --- |
| 操作系统 | Windows，PowerShell |
| Node.js | 22.20.0 |
| npm | 10.9.3 |
| Vitest | 4.1.10 |
| Playwright | 1.61.1 |
| 本地真实浏览器 | Google Chrome 150.0.7871.129 |
| 应用服务器 | Vite，`127.0.0.1:4173` |

## 3. 自动化结果

| 验证项 | 命令 | 结果 |
| --- | --- | --- |
| 静态检查 | `npm run lint` | 通过 |
| 单元测试 | `npm run test:run` | 1 文件、1 用例通过 |
| 覆盖率 | `npm run test:coverage` | 当前 App 冒烟路径 100% |
| 生产构建 | `npm run build` | 通过 |
| E2E 用例发现 | `npx playwright test --list` | 5 个浏览器项目均发现用例 |
| 真实浏览器冒烟 | `npm run test:e2e -- --project=desktop-chromium` | 1 用例通过 |
| 依赖安全审计 | `npm audit --audit-level=high` | 未完成：当前 npm 镜像不实现 Audit API |

当前覆盖率只证明测试链路能够采集应用代码，不代表后续业务模块已经满足整体覆盖率门槛。业务代码加入后，按测试方案分别执行领域、Store、适配器和 UI 覆盖率要求。

## 4. 验证过程中发现并解决的问题

### 4.1 Vitest 错误扫描 Playwright 用例

现象：Vitest 默认匹配 `*.spec.ts`，将 `e2e/smoke.spec.ts` 当作单元测试执行，Playwright 报告 `test()` 调用位置错误。

处理：在 `vitest.config.ts` 中明确限定 `src/**/*.test.{ts,tsx}`。单元测试与端到端测试由不同运行器负责。

验证：`npm run test:run` 只发现 `src/test/environment.test.tsx`；`npx playwright test --list` 只发现 `e2e/smoke.spec.ts`。

### 4.2 Playwright 管理浏览器未安装

现象：本机 Playwright 浏览器缓存不存在，在线安装在本次网络环境中超时。

处理：配置可选的 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`，允许开发环境使用本机 Chrome 完成 Chromium 冒烟；未设置时仍使用 Playwright 标准管理浏览器，不改变后续 CI 和跨浏览器策略。

验证：Playwright 通过系统 Chrome 启动页面并完成真实应用冒烟。

### 4.3 本地代理阻断 Web Server 就绪检测

现象：环境存在 `HTTP_PROXY` 和 `HTTPS_PROXY`，但没有 `NO_PROXY`。Vite 已监听且 HTTP 200，Playwright 却一直等待服务器就绪。

处理：Playwright 配置只在当前测试进程中为 `127.0.0.1,localhost` 补充 `NO_PROXY/no_proxy`，不修改系统环境。

验证：Server 就绪检测正常，Chromium 用例在 3.6 秒内完成。

### 4.4 Windows 子进程退出稳定性

现象：通过 `npm run dev` 间接启动 Vite 时，测试进程被外层终止后容易残留 Vite 子进程。

处理：Playwright Web Server 直接调用 Vite 的 Node 入口，减少一层 npm 子进程，便于 Runner 管理生命周期。

## 5. 已知边界

1. 本机只实际执行了系统 Chrome 冒烟；Firefox、WebKit 和移动项目已完成配置与用例发现，但管理浏览器尚未安装。
2. Vite 默认模板 CSS 含有 jsdom 无法完整解析的嵌套规则，覆盖率执行会显示 CSS 解析提示；WP-11 替换模板样式后应消失。
3. 当前只有测试环境冒烟，不代表 ModelTrace、Store、2D 或 3D 已有覆盖；这些测试随对应工作包实现。
4. CI/Actions 不在本工作包范围内，按照项目规范需在修改前单独确认。
5. 当前 npm Registry 为 `npmmirror.com`，其 Audit API 返回 `NOT_IMPLEMENTED`；本工作包未擅自修改 Registry。正式发布前需要在支持 Audit API 的可信 Registry 或等效供应链工具中补做依赖审计。

以上边界均不阻塞 WP-11。跨浏览器真实执行属于 WP-19/M4 验收门槛，不能在发布时继续保留为未验证状态。

## 6. 放行检查

- [x] 单元测试能够运行并操作 React DOM。
- [x] 覆盖率报告能够生成。
- [x] Playwright 能发现五个浏览器项目。
- [x] 至少一个真实 Chromium 浏览器完成冒烟。
- [x] lint 通过。
- [x] TypeScript 与生产构建通过。
- [x] 测试产物位于 `.gitignore` 范围。
- [x] 未修改 CI。
- [x] 已记录未执行的跨浏览器范围及原因。
