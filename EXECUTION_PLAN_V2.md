# NanoClaw V2 具体执行方案

> Version: 1.2.0  
> Based on: `docs/ARCHITECTURE.md` + `docs/ROADMAP_V2.md`  
> Objective: 将路线图转化为可直接执行与追踪的 Phase/Task 清单

---

## 0. 执行原则

- [ ] [P0] 先护栏后建设：未完成观测、灰度、回滚前不进入高风险实现
- [ ] [P0] 先契约后编码：每个模块先定义输入/输出/错误语义与验收口径
- [ ] [P0] 先验证后发布：每个 Phase 必须有可复现验证与失败回退路径
- [ ] [P1] 设计系统强约束：WebUI 视觉规范以 `docs/design-system.html` 为单一来源
- [ ] [P0] Skills over Features：新增能力优先以 Skill 形态落地，再决定是否下沉核心代码

---

## 1. Phase 总览

| Phase   | 主题                    | 目标产物                                       | 优先级 |
| ------- | ----------------------- | ---------------------------------------------- | ------ |
| Phase A | 执行基线与风险护栏      | 指标基线、灰度/熔断/回滚制度                   | P0     |
| Phase B | Context 与记忆引擎升级  | 压缩链路、身份解析、图谱检索框架               | P0/P1  |
| Phase C | Private Moltbook 社会层 | 帖子/评论/点赞模型与闲时协作闭环               | P1     |
| Phase D | 进化反哺与影子晋升      | 主控反哺协议、Shadow Promote 门禁              | P1     |
| Phase E | 并发性能与执行面分级    | 热池容器、轻量沙箱分流                         | P0/P1  |
| Phase F | Edge 同步与本地降级     | CRDT 路径、Local LLM fallback                  | P1/P2  |
| Phase G | Observer WebUI 与星座图 | 设计系统落地、监控看板、GraphRAG 星座可视化    | P1/P2  |
| Phase H | Skills 体系迭代与治理   | setup/tester/container skills 升级与一致性治理 | P0/P1  |

---

## 2. Phase A — 执行基线与风险护栏

### A1. 指标与观测

- [x] [P0] 建立 runtime/memory/evolution 三域指标字典与统一命名
- [x] [P0] 定义启动时延、压缩收益、错误率、回滚恢复时长四类核心指标
- [x] [P0] 输出基线快照模板并冻结 Phase 级对比口径

#### A1.1 指标字典与命名规则

| 指标域    | 命名前缀        | 必填标签                                     | 说明                             |
| --------- | --------------- | -------------------------------------------- | -------------------------------- |
| runtime   | `nc_runtime_`   | `agent_id` `session_id` `runtime` `version`  | 覆盖启动、调度、执行面切换与错误 |
| memory    | `nc_memory_`    | `agent_id` `session_id` `pipeline` `version` | 覆盖召回、压缩、写入、降级与回滚 |
| evolution | `nc_evolution_` | `agent_id` `phase` `experiment_id` `version` | 覆盖候选、验证、晋升、熔断与回退 |

统一约束：

- Counter 使用 `_total` 后缀，Gauge 使用 `_current` 后缀，Histogram 使用 `_ms` 或 `_ratio` 后缀
- 错误指标统一使用 `error_code` 标签，禁止仅记录自由文本错误
- 高风险操作必须携带 `trace_id`，保障跨模块审计可追踪

#### A1.2 核心指标定义

| 指标         | 定义                         | 计算方式                                         | 目标门槛            |
| ------------ | ---------------------------- | ------------------------------------------------ | ------------------- |
| 启动时延     | 冷启动到可处理第一条消息耗时 | `t(ready) - t(process_start)` P95                | 相比基线下降 >= 20% |
| 压缩收益     | 压缩后 token 降幅            | `(tokens_before - tokens_after) / tokens_before` | 中位数 >= 30%       |
| 错误率       | 请求失败比例                 | `errors_total / requests_total`                  | 7 日滚动 <= 1.5%    |
| 回滚恢复时长 | 熔断触发到恢复服务耗时       | `t(service_recovered) - t(circuit_open)` P95     | <= 10 分钟          |

#### A1.3 基线快照模板（冻结口径）

- 基线版本：`BASELINE_VERSION`（例：`2026-Q1`）
- 快照窗口：固定 7 天，按 UTC 0 点切片
- 对比维度：`环境`、`运行时`、`模型/策略版本`、`Phase`
- 输出字段：`样本量`、`P50/P95`、`失败率`、`回滚次数`、`结论`
- 冻结规则：同一 Phase 未升级基线版本前，不允许替换统计口径

### A2. 风险与发布控制

- [x] [P0] 为高风险能力定义 Feature Flag 命名与默认值策略
- [x] [P0] 建立 Canary/Shadow/Promote/Fallback 四阶段发布规范
- [x] [P0] 建立熔断触发条件、人工接管条件与自动回退规则

#### A2.1 Feature Flag 命名与默认值

- 命名格式：`NC_{DOMAIN}_{CAPABILITY}_{MODE}`，示例：`NC_MEMORY_COMPRESSION_CANARY`
- 高风险能力默认 `false`；仅允许在 `canary` 或 `shadow` 环境开启
- 每个 Flag 必须定义：`owner`、`expiry_date`、`rollback_action`、`audit_scope`
- Flag 存活超过 2 个里程碑必须进入清理评审，避免长期配置漂移

#### A2.2 四阶段发布规范

| 阶段     | 目标                 | 进入条件                               | 退出条件                         |
| -------- | -------------------- | -------------------------------------- | -------------------------------- |
| Canary   | 小流量验证稳定性     | 通过单元/集成/契约测试，错误率基线可用 | 24h 无 P0/P1 告警且核心指标达标  |
| Shadow   | 与主线并行对比效果   | Canary 达标，具备同输入双轨评测        | 胜率与置信门限达标，负向演化为 0 |
| Promote  | 逐步替换主线策略     | Shadow 连续 3 个窗口达标               | 全量开启后 7 天稳定，无熔断触发  |
| Fallback | 回切旧策略保障连续性 | 触发熔断或人工接管                     | 完成复盘并重新进入 Canary        |

#### A2.3 熔断/接管/自动回退

- 熔断触发：5 分钟窗口内错误率 > 3% 或 P95 时延劣化 > 50%
- 人工接管触发：连续两次自动回退失败、或出现数据一致性风险告警
- 自动回退路径：`关闭高风险 Flag -> 切换稳定策略 -> 重放必要补偿任务 -> 记录审计`
- 恢复前置：必须输出事故编号、根因分类、验证记录与再发布门禁结论

### A3. 验收门禁

- [x] [P0] 定义每个 Phase 的 DoD 与阻塞条件
- [x] [P0] 定义变更记录模板（目标、范围、风险、验证、回退）
- [x] [P0] 建立“未通过门禁不得进入下一 Phase”检查清单

#### A3.1 DoD 与阻塞条件

DoD（全部满足才可关闭 Phase）：

- 契约完整：输入/输出/错误语义、回退路径、审计字段齐备
- 质量达标：核心指标达到门槛，且对比基线结论为“通过”
- 可运维：告警、熔断、回退、人工接管流程演练完成
- 可追踪：变更记录、验证记录、回滚记录均已归档

阻塞条件（任一命中即阻塞）：

- 缺失基线快照或快照口径不一致
- 存在未闭合 P0/P1 缺陷或未完成回滚演练
- 高风险能力缺少 Feature Flag 或审计字段
- 验证证据缺失，无法复现实验结论

#### A3.2 变更记录模板（Phase A 版）

- Task ID / Phase / Priority
- 变更目标与范围（In Scope / Out of Scope）
- 输入契约 / 输出契约 / 错误语义
- 风险等级与影响面
- 验证方法与结果（含指标对比）
- 回退策略与演练结果
- 审批人 / 执行人 / 时间戳

#### A3.3 过闸检查清单

- [ ] 已附基线快照并确认口径一致
- [ ] 已通过 Canary/Shadow/Promote 对应阶段门禁
- [ ] 已完成熔断与回退演练并留存记录
- [ ] 已补齐变更记录模板全部字段
- [ ] 已完成跨模块审计字段抽样检查
- [ ] 已确认无阻塞条件命中

---

## 3. Phase B — Context 与记忆引擎升级

### B1. LLM 动态压缩（优先落地）

- [ ] [P0] 确立小模型压缩链路边界（摘要压缩与 Prompt 熵过滤）
- [ ] [P0] 定义压缩质量评分、信息保真阈值与自动降级条件
- [ ] [P1] 建立压缩前后 token 成本、时延与答复质量对比面板

### B2. Identity Resolution

- [ ] [P1] 定义物理实体 ID 与跨平台账号绑定数据契约
- [ ] [P1] 规划视觉特征向量字段接入与置信度阈值策略
- [ ] [P1] 设计动态认知注入模板与角色优先级冲突规则
- [ ] [P2] 设计身份冲突合并、人工确认与审计留痕流程

### B3. GraphRAG 与多模态记忆准备

- [ ] [P1] 定义实体关系抽取 schema 与 Node/Edge 存储约束
- [ ] [P1] 定义图路径召回与向量召回融合排序策略
- [ ] [P2] 预留多模态向量字段与检索元数据映射规范
- [ ] [P2] 设计跨模态评测集、召回指标与回归基线

---

## 4. Phase C — Private Moltbook 社会层

### C1. 数据与协议

- [ ] [P1] 明确 local_moltbook_posts/comments 表结构与索引策略
- [ ] [P1] 定义 submolt 命名约束与读写权限边界
- [ ] [P1] 定义帖子、评论、点赞、排序、归档接口契约

### C2. 闲时协作机制

- [ ] [P1] 定义 browse/create/reply/upvote 工具能力边界
- [ ] [P1] 设计闲时触发窗口、冷却机制与主任务抢占规则
- [ ] [P2] 设计论坛信誉分、异常行为识别与惩罚机制

### C3. 同行评审驱动进化

- [ ] [P1] 定义评论到 Validation 的结构化映射
- [ ] [P1] 定义点赞阈值触发晋升候选规则
- [ ] [P1] 定义多 Agent 沙箱复验流程与争议裁决机制
- [ ] [P2] 建立可追溯审计链与回放视图

---

## 5. Phase D — 进化反哺与影子晋升

### D1. 向上知识反哺

- [ ] [P1] 定义 exportToHostAgent 协议与输出格式标准
- [ ] [P1] 设计 Capsule 编译为主控技能资产的转换流程
- [ ] [P1] 定义反哺写入路径、版本冲突检测与覆盖策略
- [ ] [P2] 建立反哺资产分级审批与人工复核入口

### D2. Shadow Promote 门禁

- [ ] [P1] 定义影子执行与主线执行并行评测框架
- [ ] [P1] 定义胜率阈值、置信门限与晋升前置条件
- [ ] [P1] 定义负向进化识别、熔断与自动回退路径
- [ ] [P1] 定义影子阶段观测指标与告警规则

### D3. 远期 P2P 基因共享

- [ ] [P3] 设计脱敏交换协议与签名验证流程
- [ ] [P3] 定义外部基因信任评级与沙箱准入门槛
- [ ] [P3] 设计交易审计、许可策略与风险隔离边界

---

## 6. Phase E — 并发性能与执行面分级

### E1. Warm Container Pooling

- [ ] [P0] 定义热池容量策略、生命周期与健康检查契约
- [ ] [P0] 定义容器借还、失效回收与快速补池流程
- [ ] [P0] 定义 Context/Group 动态注入协议与隔离边界
- [ ] [P1] 定义池化命中率、排队时延、失败率监测面板

### E2. 分级执行面

- [ ] [P1] 定义 Docker/Wasm/Isolate 风险分级矩阵
- [ ] [P1] 定义低风险任务降级路由与回切条件
- [ ] [P1] 定义跨执行面统一 TraceId 与审计事件模型
- [ ] [P2] 建立执行面切换回归基线与性能比较报告

---

## 7. Phase F — Edge 同步与本地降级

### F1. 多端状态同步

- [ ] [P2] 定义 SQLite 到 CRDT 的双写迁移与回滚策略
- [ ] [P2] 定义冲突检测、冲突解决与最终一致性准则
- [ ] [P2] 定义设备身份、同步授权与会话失效机制
- [ ] [P2] 建立同步时延、冲突率、修复率追踪看板

### F2. Local LLM Fallback

- [ ] [P1] 定义网络/API 健康探测与切换触发条件
- [ ] [P1] 定义云端到本地模型的能力分层与任务白名单
- [ ] [P1] 定义降级运行下的最小可用能力保障
- [ ] [P2] 定义云端恢复后的补偿重放与一致性修复流程

---

## 8. Phase G — Observer WebUI 与星座可视化

### G1. 设计系统接入（保持与现有 Roadmap 同颗粒度）

- [ ] [P1] 约束 `docs/design-system.html` 为 WebUI token 与组件唯一视觉源
- [ ] [P1] 在 Vue3/React 层读取并消费 Cosmic/Nebula/Rose Gold CSS 变量
- [ ] [P1] 固化字体分工：Cinzel（展示）、Cormorant（叙述）、DM Mono（数据）
- [ ] [P1] 统一卡片、徽章、动效节奏与 glow 规则到面板组件

### G2. 面板落地

- [ ] [P1] 定义 Moltbook Timeline 数据映射与只读点赞交互模型
- [ ] [P1] 定义 Swarms Ops 指标卡片布局与实时刷新策略
- [ ] [P1] 定义 Evolution Registry 的审计视图与熔断操作流
- [ ] [P2] 定义统一权限模型与审计追踪字段

### G3. 记忆星座图（GraphRAG）

- [ ] [P1] 选择 ECharts 或 D3.js 作为星座图实现引擎并固化决策
- [ ] [P1] 将 GraphRAG Node 映射为“星体”并按实体类型编码视觉语义
- [ ] [P1] 将 GraphRAG Edge 映射为 Rose Gold 发光连线并设置强度规则
- [ ] [P1] 设计 hover 慢连结、渐显轨迹与低性能降级策略
- [ ] [P2] 建立星座图可读性、交互响应与性能基线验收项

### G4. 安全协同

- [ ] [P1] 定义文本与视觉双通道注入拦截在 WebUI 入口的显示策略
- [ ] [P2] 定义高敏操作（如熔断、授权）的强校验与审计闭环
- [ ] [P2] 对接 Secure Enclave 规划的密钥状态可观测展示规范

---

## 9. Phase H — Skills 体系迭代与治理（Skills over Features 主轴）

### H1. setup-agents skill 升级

- [ ] [P0] 为 setup-agents 增加能力开关模板（Memory/Learning/Evolution/WebUI）与版本标记
- [ ] [P1] 增加“物理实体 ID / GraphRAG / 星座图可视化”初始化选项与默认策略
- [ ] [P1] 增加设计系统接入提示，确保新 Agent 默认遵循 design-system token 规范
- [ ] [P1] 增加容器运行时差异校验（Docker/Apple Container）与 API 地址自检流程

### H2. agent-flow-tester skill 升级

- [ ] [P0] 增加 WebUI 看板联调测试场景（Moltbook Timeline / Swarms Ops / Evolution Registry）
- [ ] [P1] 增加 GraphRAG 星座图渲染链路的契约测试与降级测试
- [ ] [P1] 增加 skills 双目录一致性检查（`.claude/skills` 与 `.trae/skills`）
- [ ] [P1] 增加 Shadow Promote 与反哺链路的专项回归用例

### H3. container skills 迭代（agent-learning / agent-memory）

- [ ] [P0] 为 agent-learning 增加与新 Roadmap 对齐的阶段脚本入口与治理门禁说明
- [ ] [P1] 为 agent-learning 增加 GraphRAG/Identity 学习任务模板与结果评估口径
- [ ] [P0] 为 agent-memory 增加多模态记忆、图谱节点关系、检索 explain 的调用示例
- [ ] [P1] 为 agent-memory 增加本地 LLM fallback 与安全清洗链路的使用说明

### H4. Skills 发布与治理

- [ ] [P0] 建立 Skill 版本号、变更日志、兼容矩阵（主进程/容器/运行时）制度
- [ ] [P0] 建立 Skill 生命周期规范：设计评审 -> 实验 -> 灰度 -> 稳定
- [ ] [P1] 建立“功能需求优先映射 Skill”的评审清单，避免直接 Feature 化
- [ ] [P1] 建立 Skill 退役与替代策略，防止历史脚本长期漂移

---

## 10. 里程碑与完成标准

### Milestone 1（基础可执行）

- [ ] [P0] 完成 Phase A + Phase B(B1) + Phase E(E1)
- [ ] [P0] 达成启动时延下降、成本下降、可回滚三项硬门槛

### Milestone 2（闭环可运行）

- [ ] [P1] 完成 Phase C + Phase D + Phase G(G1/G2/G3)
- [ ] [P1] 打通“协作信号 -> 评审 -> 晋升 -> 反哺 -> 可视化”闭环

### Milestone 3（韧性可扩展）

- [ ] [P2] 完成 Phase F + Phase B(B3) + Phase G(G4) + Phase H(H2/H3)
- [ ] [P2] 达成跨设备一致性、降级连续性与安全纵深目标

### Milestone 4（生态探索）

- [ ] [P3] 启动 P2P Gene Sharing 试点并建立治理制度

---

## 11. 执行记录模板

- [ ] [P0] Task ID:
- [ ] [P0] 所属 Phase:
- [ ] [P0] 优先级:
- [ ] [P0] 输入契约:
- [ ] [P0] 输出契约:
- [ ] [P0] 风险等级:
- [ ] [P0] 验收结果:
- [ ] [P0] 回滚结果:

---

**Maintainer**: NanoClaw Team  
**Plan Version**: 1.2.0  
**Last Updated**: 2026-03-15
