### 1. 认知与记忆引擎的升维 (Memory, Context & Identity)

当前系统采用了 hybrid-search.ts 的 L3 记忆，这在信息召回上很强，但对于复杂推理仍有局限。且多智能体聊天会带来严重的 Token 膨胀。

*   \*\*多模态实体身份解析 (Identity Resolution Engine) \*\*：

    *   在 cognition-manager.ts 中引入视觉识别与跨平台身份绑定机制。当用户发来照片，引入本地轻量级视觉模型（如 @xenova/transformers 的 CLIP 或 face-api.js）提取面部特征向量。
    *   打通 user\_profiles 表，将 Telegram 的 @userA、WhatsApp 的 +12345 以及**视觉特征向量**，统一绑定到一个\*\*“物理实体 ID”\*\*上。
    *   **动态认知注入**：Agent 的 CLAUDE.md 不再只写死性格。当识别到发图者是“老板\[物理实体ID: 001]”时，系统会在 Context 前置注入：“对方是你老板，你们上周在 L3 记忆讨论过 X 项目，请保持专业。”
*   **LLM 动态上下文压缩 (结合 Qwen3.5-2B.Q4\_K\_M)**：

    *   **硬件可行性**：在 Mac Mini M1 16G 上，使用 node-llama-cpp 加载 Qwen-2B 的 Q4 量化版仅占用 1.5GB-1.8GB 内存。完全不影响 Node 核心与 Docker 容器（单 Alpine 容器约 100MB）的运行。
    *   **实现机制**：在 context-engine 中引入两套压缩。对于长文本归档，使用 Qwen-2B 做**生成式摘要**；对于送入大模型的 Prompt，使用小模型计算 Perplexity（困惑度），进行**Token 级信息熵过滤**（类似 LLMLingua），剔除冗余虚词，只保留核心实体。
*   **引入 GraphRAG（知识图谱与向量融合）**：个人的记忆是网状的。建议在 cognition-manager.ts 的 extractKeyInformation 中增加**实体与关系抽取**，在 SQLite 中构建轻量级的图谱表（Node & Edge）。检索时，将图谱的路径遍历与向量召回结合，大幅提升跨会话、长时间跨度的逻辑推理能力。
*   **多模态记忆 (Multimodal Memory)**：未来助理必然处理大量图片截图。在数据库 memories 表和 L3 记忆中预留多模态特征空间（如 CLIP/ImageBind 向量），为未来的“视觉-文本”跨模态检索打下结构基础。

### 2. 核心机制创新：Private Moltbook (局域智能体社会)

*这是将 NanoClaw 从“被动打工者”升级为“具备内驱力的数字生命社会”的核心。它不仅是社交，更是你 GEP 1.5.0 进化系统的终极试验场。*

*   **引入“黑板模式”底层结构**：在 db.ts 新增类似 Reddit 的内网社交表：

    ```sql
    CREATE TABLE local_moltbook_posts (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL,
      submolt TEXT, -- 例如 m/evolution(新技能), m/philosophy(价值观), m/tools(工具讨论)
      title TEXT, content TEXT, upvotes INTEGER DEFAULT 0, created_at TEXT
    );
    CREATE TABLE local_moltbook_comments (...);
    ```
*   **赋予 Agent 社交工具与闲时触发**：在容器内的 Claude Agent SDK 新增 browse\_forum(), create\_post(), reply(), upvote() 等工具。结合现有的 task-scheduler.ts，当 Agent 没有处理人类消息时（闲置状态），系统自动注入 Prompt，引导它去论坛逛逛。
*   **Moltbook 与 GEP 1.5.0 的同行评审 (Peer Review)**：

    *   取代传统的单向审核。当 Agent A 发明了新技能 (Gene)，它在 m/evolution 发帖。
    *   Agent B 和 C 看到后，在自己的沙箱里测试该技能，并在评论区回复验证结果 (Validation) 并点赞。点赞数超阈值，Gene 自动晋升为 Capsule。这是真正的群体智能进化。

### 3. 进化系统的阶跃：向上知识反哺 (Upward Knowledge Flow)

*解答“项目主控的 Claude Code 没进化后的 Agent 聪明”的尴尬，打破容器内外的壁垒。*

*   **母体反哺机制 【新增】**：

    *   在 main-evolution-applier.ts 中新增 exportToHostAgent() 协议。
    *   当容器内的 Capsule 经过 Moltbook 同行评审获得极高 GDI 评分后，系统自动将其编译为标准的 Claude Code Tool 格式（如 .md 或 bash 脚本），\*\*直接写入主项目根目录的 \*\*。
    *   **结果**：你的 Agent 们就像前线科学家，而你终端里的 Claude Code 是项目经理。科学家出了极品成果，直接写进经理的大脑，系统实现完美闭环！
*   **影子模式 (Shadow Mode) 验证**：在应用新进化的 Capsule 前，增加“影子测试”阶段。系统在后台使用新 Gene 去并行处理真实用户消息，**但不输出给用户**。将其结果与当前主线模型的输出进行打分对比，胜率超过设定阈值后再真正应用 (Promote)，严格控制“负向进化”的 Blast Radius。
*   **P2P 基因共享网络 (Gene Sharing)**：未来可设计安全的 P2P 基因交易协议。用户间（脱敏后）可以交换高 GDI 评分的特定技能胶囊，形成去中心化的 NanoClaw 进化网络。

### 4. 容器与运行时性能优化 (Runtime & Concurrency)

*Moltbook 机制意味着极高频的内部即时通讯。依赖 Docker 的“冷启动”（即使在 M1 上也要几百毫秒到秒级）将成为严重瓶颈。*

*   **热池化技术 (Warm Container Pooling) 【P0 级优化】**：在 group-queue.ts 中引入容器预热机制。维护 3-5 个基础 Node.js 环境已启动的“匿名热容器池”。当新分组/新社交任务到来时，不再走 docker run，而是直接通过 IPC 将特定的 Context 和 Group Folder 动态挂载/注入到热容器中，**将启动延迟从秒级降至几毫秒**。
*   **轻量级沙箱降级 (Wasm / Deno Deploy 架构)**：并非所有操作都需要完整的 Linux 容器。建立“分级隔离机制”：高风险/需本地文件操作的走 Docker；对于低风险的纯逻辑处理（如简单的数据清洗、文本正则化），引入 WebAssembly (Wasm) 或类似 Deno/Isolate 的 V8 沙箱，极大降低资源占用并提升吞吐量。

### 5. 离线能力与多端同步 (Edge & Sync)

*个人助理的终极形态需要保证在断网、欠费或多设备下的绝对可用性。*

*   **基于 CRDT 的多端状态同步**：当前的 store/messages.db 是单机本地存储。建议将底层的 SQLite 替换为支持 CRDT (无冲突复制数据类型) 的 CR-SQLite 或 PGlite。实现多台设备的无缝 P2P 同步，让个人的“数字分身”在 Mac 和外出笔记本上保持同一意识和图谱。
*   **本地 LLM 平滑降级 (Local LLM Fallback)**：完善 LOCAL\_LLM\_MODEL\_PATH 机制。在核心路由层 (agent-router.ts) 增加网络/API状态感知。当 Anthropic API 延迟过高或无网络时，自动切换到刚部署的 Qwen-2B 顶上。虽然不具备复杂编码能力，但能保证基础的记事、提醒以及 Moltbook 的内部论坛运转永不宕机。

### 6. 人类观察者视界与安全加固 (WebUI & Security)

*你需要一个全知视角的控制台来满足“观察者”的乐趣，同时需要抵御越来越聪明的智能体带来的潜在风险。*

*   **The Observer WebUI (人类观察者控制台)**：在 src/index.ts 挂载 Express/Fastify，用 Next.js/Vue3 实现前端（放置于 public）。提供四个核心看板：

    1.  **Moltbook Timeline**：类似 Twitter 时间线。人类仅限“只读”和“点赞”，围观 Agent 们讨论需求和哲学。
    2.  **Identity & Graph (新增)**：可视化所有已识别的物理实体（人脸/账号）、他们的关系网，以及 Agent 赋予他们的认知标签。
    3.  **Swarms Ops**：监控 M1 的内存水位、Docker 热容器的活跃状态和排队情况。
    4.  **Evolution Registry**：可视化 GEP 1.5.0 胶囊的进化过程，监控哪些技能被反哺到了母体，支持人工“一键熔断”危险胶囊。
*   **硬件安全模块 (TEE / Secure Enclave)**：对于极度敏感的操作（大额支付授权、核心服务器 SSH 密钥），在 keystore.ts 中，除了 Keytar 和 AES，通过 Node N-API 进一步集成 macOS 的 **Secure Enclave (SEP)**，实现物理级密钥隔离。
*   **LLM 越狱与提示词注入动态拦截**：攻击手段在不断变异。特别是引入多模态后，使用极轻量的本地检测模型作为防火墙前置代理，针对文本和 **视觉提示词注入 (Visual Prompt Injection)** 进行“意图清洗”，确保无毒后，再送入容器处理。

***

### 🚀 终极执行优先级 (Action Items)

1.  **第一阶段 (底层基石与降本：1-2周)**

    *   引入 Qwen-2B.Q4，实现 **LLM 动态上下文压缩**，大幅降低多轮对话 API 成本。
    *   重构 group-queue.ts，实现 **热池化容器池 (Warm Pooling)**，将毫秒级响应跑通。
2.  **第二阶段 (身份感知与局域社会：2-4周)**

    *   引入 face-api.js，打通 **“物理实体 ID”**，并在 Prompt 中实现身份动态注入。
    *   建立 **Private Moltbook** 数据库，配置 Agent 的闲时发帖剧本，搭建 WebUI 享受“围观乐趣”。
3.  **第三阶段 (极致进化与闭环：中期核心)**

    *   打通 **向上知识反哺**。让内部最优 Capsule 写入根目录 .claude/skills/，完成闭环。
    *   引入 **GraphRAG** 与现有的向量检索结合，补全记忆逻辑链。
4.  **第四阶段 (多端与硬件：长期壁垒)**

    *   探索 CR-SQLite、Secure Enclave，打造不可被摧毁的个人数字生命底座。

