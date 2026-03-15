# NanoClaw ROADMAP V2

> Version: 2.1.0  
> Status: Draft for Execution  
> Scope: Learning + Evolution + Memory + Runtime + Security 全栈升维

---

## 0. 北极星目标 (North Star)

将 NanoClaw 从「可用的个人 Agent 工具」升级为「可持续进化的局域智能体社会系统」，同时保持三条底线：

1. **实时可用**：高并发与长会话下稳定响应  
2. **认知连续**：跨会话、跨通道、跨模态保持一致身份与记忆  
3. **可控进化**：所有能力演进具备验证、审计、熔断与回滚

---

## 1. 优先级定义

- **P0**: 必须先完成，直接影响稳定性、成本或主链路可用性  
- **P1**: 主干能力建设，决定系统是否进入“升维态”  
- **P2**: 增强能力，显著提升体验与长期壁垒  
- **P3**: 远期探索，构建生态与护城河

---

## 2. 执行阶段总览 (Phase Map)

| Phase | 核心主题 | 关联维度 | 主优先级 |
| --- | --- | --- | --- |
| Phase 0 | 架构护栏与基线观测 | 全维度 | P0 |
| Phase 1 | 记忆与上下文引擎升维 | 维度 1 | P0 |
| Phase 2 | Private Moltbook 局域社会 | 维度 2 | P1 |
| Phase 3 | 向上知识反哺闭环 | 维度 3 | P1 |
| Phase 4 | Runtime 并发性能重构 | 维度 4 | P0 |
| Phase 5 | 离线与多端同步能力 | 维度 5 | P2 |
| Phase 6 | Observer WebUI 与安全加固 | 维度 6 | P1/P2 |
| Phase 7 | Skills 体系迭代与治理 | 跨维度（Skills over Features） | P0/P1 |

---

## 3. 详细 Phase 与 Task 清单

## Phase 0 — 架构护栏与基线观测 (P0)

### 目标
在不改动业务语义的前提下，为后续全部升维任务建立可观测、可验证、可回滚的工程底座。

### Tasks
- [ ] [P0] 定义 ROADMAP_V2 对应的架构决策记录模板并落地 ADR 索引
- [ ] [P0] 统一关键指标命名并建立 memory/evolution/runtime 三域基线面板
- [ ] [P0] 为高风险变更建立 Feature Flag 策略与默认降级路径
- [ ] [P0] 建立影子流量、灰度发布、熔断、回滚的执行准则文档
- [ ] [P0] 明确每个 Phase 的 DoD、验收指标与失败判定条件

---

## Phase 1 — 认知与记忆引擎升维 (Memory, Context & Identity)

### 目标
从“召回强”升级到“推理强”：身份可解析、上下文可压缩、记忆可图谱化、模态可扩展。

### 1.1 Identity Resolution Engine
- [ ] [P1] 设计物理实体 ID 模型并定义跨平台账号绑定规则
- [ ] [P1] 扩展 user_profiles 结构以支持视觉特征向量映射
- [ ] [P1] 在认知链路引入身份解析服务与置信度阈值策略
- [ ] [P1] 建立动态认知注入模板并定义角色优先级覆盖规则
- [ ] [P2] 设计身份冲突合并与人工确认流程

### 1.2 LLM 动态上下文压缩
- [ ] [P0] 集成本地小模型推理通道并完成资源配额隔离
- [ ] [P0] 实现长文本归档摘要流水线与质量评估策略
- [ ] [P0] 实现 Prompt Token 熵过滤链路并定义保真阈值
- [ ] [P1] 建立压缩前后效果对比指标与自动回退策略
- [ ] [P1] 输出成本节约与响应时延收益看板

### 1.3 GraphRAG 与多模态记忆
- [ ] [P1] 在 extractKeyInformation 增加实体关系抽取规范
- [ ] [P1] 设计 Node/Edge 图谱表并补齐索引与约束
- [ ] [P1] 实现图路径检索与向量召回融合排序
- [ ] [P2] 在 memories/L3 预留多模态向量字段与元数据 schema
- [ ] [P2] 建立视觉-文本跨模态检索评测集与基线分数

---

## Phase 2 — Private Moltbook (局域智能体社会)

### 目标
构建 Agent 闲时协作、知识辩论、同行评审与社会信号沉淀的“内网论坛层”。

### 2.1 黑板模式底座
- [ ] [P1] 设计 local_moltbook_posts/comments 数据模型与迁移脚本
- [ ] [P1] 设计 submolt 命名规范与访问隔离策略
- [ ] [P1] 实现帖子、回复、点赞、排序、归档的服务接口
- [ ] [P2] 建立论坛反垃圾与异常行为限流机制

### 2.2 Agent 社交工具链
- [ ] [P1] 定义 browse_forum/create_post/reply/upvote 工具协议
- [ ] [P1] 为闲置状态建立自动触发脚本与冷却窗口
- [ ] [P1] 设计“人类消息优先”抢占机制避免社交占用主链路
- [ ] [P2] 为论坛行为引入信誉分与质量惩罚机制

### 2.3 Peer Review 驱动进化
- [ ] [P1] 定义 Moltbook 评论到 Validation 的结构化映射
- [ ] [P1] 实现点赞阈值触发 Gene 晋升候选逻辑
- [ ] [P1] 建立多 Agent 沙箱复验流程与冲突裁决规则
- [ ] [P2] 建立演进行为审计追踪与可回溯证据链

---

## Phase 3 — 向上知识反哺 (Upward Knowledge Flow)

### 目标
打通容器内智能体与主控系统的能力回流，让最优能力自动沉淀为可复用资产。

### 3.1 母体反哺机制
- [ ] [P1] 设计 exportToHostAgent 协议与产物标准格式
- [ ] [P1] 建立 Capsule 到主项目技能资产的编译与签名流程
- [ ] [P1] 设计写入目标目录规范与版本冲突处理策略
- [ ] [P2] 建立反哺资产分级审批策略与人工覆盖入口

### 3.2 Shadow Mode 安全晋升
- [ ] [P1] 建立影子执行通道并隔离用户可见输出
- [ ] [P1] 定义主线输出与影子输出的评分对齐框架
- [ ] [P1] 实现胜率阈值触发 Promote 的自动化门禁
- [ ] [P1] 建立负向进化检测、熔断与自动回退机制

### 3.3 P2P Gene Sharing 远期协议
- [ ] [P3] 设计脱敏交换协议与签名校验链路
- [ ] [P3] 定义外部胶囊信任评级与沙箱准入标准
- [ ] [P3] 设计跨实例基因市场的审计与许可模型

---

## Phase 4 — Runtime & Concurrency 重构

### 目标
将高频内部协作从“冷启动受限”升级为“低延迟高吞吐”执行模型。

### 4.1 Warm Container Pooling
- [ ] [P0] 设计匿名热容器池生命周期与容量策略
- [ ] [P0] 实现容器预热、借还、回收与健康检查机制
- [ ] [P0] 实现 Context 与 Group Folder 的动态注入协议
- [ ] [P0] 建立池化命中率、排队时延、失败率观测指标
- [ ] [P1] 增加异常池容器熔断与自动补池机制

### 4.2 分级隔离执行面
- [ ] [P1] 定义 Docker/Wasm/Isolate 三层风险分级规则
- [ ] [P1] 建立低风险任务自动降级到轻量沙箱的路由策略
- [ ] [P1] 设计跨执行面统一审计日志与追踪 ID
- [ ] [P2] 建立执行面切换回归测试矩阵与性能基线

---

## Phase 5 — Edge & Sync (离线与多端同步)

### 目标
在断网、跨设备和 API 异常条件下保持系统连续可用与状态一致。

### 5.1 CRDT 多端一致性
- [ ] [P2] 设计 SQLite 向 CRDT 存储过渡的双写迁移路径
- [ ] [P2] 定义冲突解决策略与最终一致性验证规则
- [ ] [P2] 建立设备身份、同步会话与权限边界模型
- [ ] [P2] 输出同步延迟、冲突率、修复率观测面板

### 5.2 Local LLM Fallback
- [ ] [P1] 在路由层增加网络与 API 健康感知探针
- [ ] [P1] 建立云端模型到本地模型的无感切换策略
- [ ] [P1] 设计降级能力边界与任务分流白名单
- [ ] [P2] 建立恢复云端后的一致性补偿与重放机制

---

## Phase 6 — Observer WebUI & Security

### 目标
实现“全知观察者控制台 + 主动安全防线”，让系统在可视化与安全性上同时进化。

### 6.1 Observer WebUI
- [ ] [P1] 定义 WebUI 分层架构与主进程 API 边界
- [ ] [P1] 建立 `docs/design-system.html` 作为唯一视觉规范源并固化 token 映射
- [ ] [P1] 在 Vue3/React WebUI 中读取 Cosmic Latte/Nebula Blue/Rose Gold 等 CSS 变量
- [ ] [P1] 统一 Cinzel/DM Mono/Cormorant Garamond 字体角色分工并落地组件层
- [ ] [P1] 实现 Moltbook Timeline 只读+点赞视图
- [ ] [P1] 按「宇宙平均色 + 星图符号学」规范渲染 Moltbook 数据卡片与动效
- [ ] [P1] 实现 Identity & Graph 关系可视化面板
- [ ] [P1] 使用 ECharts 或 D3.js 将 GraphRAG Node/Edge 渲染为“星座图”样式
- [ ] [P1] 记忆星图连线采用 Rose Gold 发光并实现 hover 慢速连结交互
- [ ] [P1] 实现 Swarms Ops 运行态监控面板
- [ ] [P1] 以设计系统卡片规范渲染 Agent 监控面板并统一状态徽章语义
- [ ] [P1] 实现 Evolution Registry 与一键熔断入口
- [ ] [P2] 建立统一权限模型与审计追踪

### 6.2 安全加固
- [ ] [P1] 设计文本与视觉双通道 Prompt Injection 检测链路
- [ ] [P1] 建立多模态输入“意图清洗”前置代理
- [ ] [P2] 设计 Secure Enclave 集成接口与密钥分层托管策略
- [ ] [P2] 建立高敏操作强校验与多因子授权流程
- [ ] [P2] 建立安全事件演练、告警分级、应急回滚手册

---

## Phase 7 — Skills 体系迭代与治理 (Skills over Features)

### 目标
将 setup、测试、容器内能力沉淀为标准化 Skill 链路，避免功能散落到核心循环，实现“先 Skill、后 Feature”。

### 7.1 setup-agents skill
- [ ] [P0] 升级 setup-agents 初始化模板，覆盖 Memory/Learning/Evolution/WebUI 能力开关
- [ ] [P1] 增加 Identity/GraphRAG/星座图可视化初始化选项与默认策略
- [ ] [P1] 增加 design-system 视觉规范接入提示并固化默认 token 策略
- [ ] [P1] 增加 Docker/Apple Container 运行时差异化提示与 API 地址自检

### 7.2 agent-flow-tester skill
- [ ] [P0] 增加 Observer 看板与 Moltbook 数据流的端到端验证场景
- [ ] [P1] 增加 GraphRAG 星座图渲染、交互与降级路径的专项验证
- [ ] [P1] 增加 `.claude/skills` 与 `.trae/skills` 双目录一致性检查任务
- [ ] [P1] 增加 Shadow Promote 与向上反哺链路的回归验证

### 7.3 container skills（agent-learning / agent-memory）
- [ ] [P0] 为 agent-learning 补充与新路线图对齐的阶段任务模板与治理门禁
- [ ] [P1] 为 agent-learning 增加 GraphRAG/身份解析学习与自评流程
- [ ] [P0] 为 agent-memory 增加多模态记忆、图谱关系、检索 explain 使用规范
- [ ] [P1] 为 agent-memory 增加本地 LLM fallback 与安全清洗链路指导

### 7.4 Skills 发布治理
- [ ] [P0] 建立 Skill 版本号、兼容矩阵、变更记录制度
- [ ] [P1] 建立 Skill 生命周期流程（评审、实验、灰度、稳定）
- [ ] [P1] 建立“需求优先映射 Skill”评审门禁与例外审批机制
- [ ] [P1] 建立 Skill 退役与替代机制，避免历史脚本漂移

---

## 4. 里程碑与验收门禁

### Milestone A (P0 Closure)
- [ ] [P0] 完成 Phase 0 + Phase 1.2 + Phase 4.1 核心链路
- [ ] [P0] 达成“成本下降 + 启动时延下降 + 回滚可用”三项硬指标

### Milestone B (P1 Expansion)
- [ ] [P1] 完成身份解析、Moltbook、向上反哺、Observer 核心能力
- [ ] [P1] 打通“社会信号 -> 进化评审 -> 能力晋升 -> 主控反哺”闭环

### Milestone C (P2 Hardening)
- [ ] [P2] 完成 GraphRAG、多模态记忆、Edge Sync、安全硬件能力
- [ ] [P2] 建立跨设备、跨模态、跨执行面与跨 Skill 的统一治理能力

### Milestone D (P3 Frontier)
- [ ] [P3] 启动 P2P Gene Sharing 试验网络并定义治理章程

---

## 5. 非目标与边界

- 本路线图阶段不包含对 `src/` 业务代码的直接实现提交  
- 本路线图用于开发组织、任务拆解、优先级治理与执行跟踪  
- 所有实施动作需在对应 Phase 启动后按 DoD 与风控门禁执行

---

## 6. 执行约束 (Execution Contract)

- [ ] [P0] 任何 P1/P2/P3 任务开始前，必须确认对应 P0 护栏已就绪  
- [ ] [P0] 任何“自动晋升”能力必须具备影子验证与熔断回滚路径  
- [ ] [P0] 任何跨模态输入必须经过安全代理清洗后再进入推理主链路  
- [ ] [P1] 任何跨设备同步能力必须先通过冲突注入与恢复演练

---

**Maintainer**: NanoClaw Team  
**Roadmap Version**: 2.1.0  
**Last Updated**: 2026-03-15
