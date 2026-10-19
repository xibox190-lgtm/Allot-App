# 开发与验证

## 本地运行

支持 Node.js 20.19+（20.x）或 22.12+，建议使用 22.12+。

```sh
npm ci
npm start
```

单独构建使用 `npm run build`，产物位于 `dist/web/`。修改源代码后重新执行 `npm start`。构建会保留运行时依赖的许可文件。

## 测试

```sh
npm test
```

覆盖金额精度、计划确认、分次和超额买入、记录整理、AI 工具调用及 HTTP 接入。模型传输测试使用本机模拟服务，无需真实 Key，不产生模型费用。

`npm run test:ui` 是可选交互检查，额外依赖 `agent-browser` CLI 和 Windows PowerShell，不包含在标准测试中。

## 目录

- `app/public/components/`：Vue 界面。
- `app/public/modules/`：业务规则、AI 编排、平台桥接和状态。
- `app/server.mjs`：本机配置、静态资源与模型请求转发。
- `app/test/`：业务和 HTTP 测试。
- `android/`：Android 容器和构建脚本。
- `prototype/`：早期原型与解析测试，使用 `npm run prototype` 查看。

## AI 配置

可通过界面设置，也可设置 `DEEPSEEK_API_KEY`、`ALLOT_API_BASE`、`ALLOT_MODEL` 环境变量。`ALLOT_CONFIG_DIR` 指定配置目录，`PORT` 指定端口。程序不会自动加载 `.env` 文件，环境变量需由启动环境传入。不要提交实际密钥。

## Android 构建

使用 Windows PowerShell、Android SDK Platform 34 / Build Tools 34.0.0、JDK 8 编译器和 JDK 17+ 打包运行时。

```powershell
npm run build
./android/build.ps1 -Sdk '你的SDK目录' -Jdk '你的JDK8目录' -RuntimeJdk '你的JDK17以上目录'
```

也可设置 `ALLOT_JDK8` 和 `JAVA_HOME` 后运行 `npm run android:build`。

产物为 `dist/Allot-debug.apk`，使用本机 Android 调试密钥。清单启用了调试能力，不应将其标为正式安全发布包。公开发行使用以下发布构建；不要将签名密钥加入源码。

### 发布构建

设置 `ALLOT_KEYSTORE` 为私有 keystore 路径，`ALLOT_SIGNING_STORE_PASSWORD` 和 `ALLOT_SIGNING_KEY_PASSWORD` 为相应密码，再运行：

```powershell
npm run build
./android/build.ps1 -Release -Sdk '你的SDK目录' -Jdk '你的JDK8目录' -RuntimeJdk '你的JDK17以上目录' -ApkName 'Allot-0.1.0.apk'
```

发布模式强制使用独立密钥、关闭调试，默认应用 ID 为 `app.allot.mobile`；开发模式保留 `app.allot.personal`。入口 Activity 仍使用其完整 Java 类名。公开版与开发版可共存，数据独立。密码通过环境变量传入签名工具，不写入仓库或命令参数。

维护者必须在仓库外安全备份密钥及密码；后续更新必须保持同一签名。当前首发包完成构建、签名和资源检查，发布时未连接设备，尚未完成真机安装和升级验证。

## 导出公开源码

```sh
npm run opensource:export
```

从 `public-files.json` 明确列出的文件生成新的 `dist/open-source/Allot-*` 目录。不复制 `.git`、个人配置、安装包、字体二进制、历史设计稿和内部报告。命令检查常见敏感内容；通过不代表完整安全或法律审计。

在导出目录验证 `npm ci`、`npm test` 后，将其作为新公开仓库的起点。不要直接公开原开发仓库：原历史仍保留旧素材和提交身份信息。初始化新仓库前配置期望公开的昵称及邮箱。
