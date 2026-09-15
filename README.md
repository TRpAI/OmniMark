# OmniMark 极简导航与书签系统

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)]()
[![React](https://img.shields.io/badge/React-19-cyan.svg)]()
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.1-38bdf8.svg)]()

> **OmniMark** 是专为极客与高效工作者打造的现代化、高安全性私有化站点导航与个人书签管理平台。兼具极简美感与严谨的工程安全架构，支持双运行引擎（Node.js / Express 与 Cloudflare Workers + D1/KV 无缝切换）。

---

## ✨ 核心特性

- **🛡️ 零信任企业级安全架构**
  - **密码学安全**：采用 PBKDF2-HMAC-SHA256（100,000 次高强度迭代 + 32 字节密码学随机盐值）及常量时间比对（Timing-Safe Equal），彻底抵御彩虹表与时序侧信道攻击；
  - **严格鉴权守卫**：全链路采用 `Authorization: Bearer <token>` 头部认证，彻底废除 URL Query 传递 Token 的泄露隐患；
  - **会话失效机制**：服务端严格校验 `expiresAt` 会话有效周期，管理员修改密码时主动清空所有活跃会话，防止窃取令牌滥用；
  - **全方位 SSRF 防护**：内网 IP（包括 IPv4、IPv6、映射格式、数字及十六进制表示）、云平台元数据网关（`169.254.169.254`、`metadata.google.internal`）深度防护，网络爬取支持多跳手动重定向安全校验；
  - **D1 故障阻断**：若 D1 数据库未绑定，敏感写操作直接返回 503 拒绝执行，绝不静默越权。

- **⚡ 双运行引擎支持**
  - **本地/自托管**：基于 Node.js & Express，内置轻量级持久化 JSON 存储与本地缓存；
  - **边缘云部署**：基于 Cloudflare Pages + Workers + D1 分布式 SQL 数据库 + KV 边缘加速。

- **📂 强大的书签管理与导入导出**
  - 支持 Netscape 标准书签格式（Chrome / Edge / Firefox / Safari 浏览器导出文件）深度解析；
  - 导入白名单安全过滤，支持增量合并（O(1) 内存去重）与完整覆盖模式；
  - JSON 全量备份导出与恢复，安全脱敏过滤凭证信息。

- **🎨 极简优雅的前端体验**
  - 响应式栅格与列表视图平滑切换；
  - 基于 `@dnd-kit` 的流畅拖拽排序；
  - 多搜索引擎聚合切换；
  - 自动域名 Favicon 图标解析与多层代理兜底缓存。

---

## 🚀 快速启动

### 本地开发

```bash
# 安装依赖
npm install

# 启动本地开发服务（Express + Vite SPA，运行在 http://localhost:3000）
npm run dev

# 运行自动化安全与业务测试
npm test
```

### 构建与生产运行

```bash
# 构建本地生产产物
npm run build

# 启动本地生产服务
npm start
```

### Cloudflare Workers 部署

```bash
# 构建 Cloudflare Worker 打包产物
npm run build:cloudflare

# 使用 Wrangler 部署至 Cloudflare
npx wrangler d1 migrations apply omnimark-db
npx wrangler deploy
```

---

## 🧪 自动化测试

项目内置完善的单元与安全测试套件：

```bash
npm test
```

涵盖：
- PBKDF2 哈希与自动无感升级
- SSRF 边界拦截（IPv4/IPv6/云元数据端点/伪造编码）
- Netscape 多行属性书签解析器
- 导入配置项白名单拦截
- 点击统计路由防误伤正则校验
- 令牌生成随机熵与会话生命周期校验

---

## 📄 开源许可证

本项目采用 [MIT License](LICENSE) 开源。
