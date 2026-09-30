# agents/ — 项目文档目录

本目录存放面向编码代理与协作者的项目文档。入口文档是仓库根目录的 [agent.md](../agent.md)（项目概况、命令、架构总览、陷阱清单），本目录只放专题文档。

## 目录结构

```
agents/
├── README.md            # 本文件：组织规则 + 索引
├── reference/           # 技术参考：描述现行机制，随代码演进同步更新
│   ├── ui-design-system.md          # ★ UI 设计系统（令牌/主题/组件约定/检查清单）
│   ├── datapanel.md                 # DataPanel 页面架构（布局/数据流/子组件/弹框）
│   ├── views.md                     # 视图层架构（挂载模型/事件总线/双入口表单）
│   ├── status-colors.md             # 学习状态颜色系统（双轨维护）
│   └── i18n.md                      # UI 国际化（机制/流程/陷阱）
└── history/             # 历史方案：已完结任务的决策背景归档，不再随代码更新
    ├── datapanel-plan.md            # DataPanel 卡片化 + 无限滚动改造（已完结）
    ├── datapanel-mobile.md          # DataPanel 移动端适配记录（已完结；组件未挂载）
    └── datapanel-components-legacy.md # 旧版组件拆分说明（已被 reference/datapanel.md 取代）
```

## 文档分类规则

| 类型 | 特征 | 放置规则 |
|------|------|----------|
| **技术参考**（reference） | 描述**现行**的机制/约定，内容必须始终与代码一致 | `agents/reference/<主题>.md`，kebab-case 命名 |
| **历史方案**（history） | 描述一次性的改造任务，完结后归档。允许保留当时表述，但**过时的架构描述文首必须标注**，避免误导 | `agents/history/<模块>-<主题>.md` |

> 不在此目录存放：会话级临时产物（用完即删）、可在代码里直接读到的结构说明（避免与代码重复漂移）、性能测试报告（`reports/`）。

## 现有文档索引

### reference/（现行有效）

| 文件 | 说明 | 对应代码 |
|------|------|----------|
| [ui-design-system.md](reference/ui-design-system.md) | ★ UI 设计系统：`--ll-*` 令牌、naive-ui 共享主题、组件约定、交付检查清单 | `src/styles/`、各视图 |
| [datapanel.md](reference/datapanel.md) | DataPanel 页面：布局结构、数据流、子组件契约、两个弹框 | `src/views/DataPanel.vue`、`src/component/DataPanel/` |
| [views.md](reference/views.md) | 视图层：挂载模型、五种视图、事件总线、LearnPanelForm 双入口 | `src/views/`、`src/component/` |
| [status-colors.md](reference/status-colors.md) | 状态色系统：TS/CSS 双轨、明暗主题、扩展指南 | `src/statusColors.ts` / `.css` |
| [i18n.md](reference/i18n.md) | UI 国际化：解析机制、新增词条流程、vue 缺键陷阱 | `src/lang/` |

### history/（归档，不随代码更新）

| 文件 | 状态 | 说明 |
|------|------|------|
| [datapanel-plan.md](history/datapanel-plan.md) | 已完结（100%） | DataPanel 卡片化 + 无限滚动 + 后端分页改造的原始方案 |
| [datapanel-mobile.md](history/datapanel-mobile.md) | 已完结（未挂载） | MobileWordList 移动端适配记录；该组件当前无引用，留待清理 |
| [datapanel-components-legacy.md](history/datapanel-components-legacy.md) | 已过时 | 旧版组件拆分说明，现状以 [reference/datapanel.md](reference/datapanel.md) 为准 |

## 维护约定

1. **代码改了，参考类文档同步改**：改动 UI 设计系统、DataPanel 结构、视图/事件、状态色、i18n 机制等被参考文档描述的内容时，同一次提交内更新对应文档（含文首"最后同步"日期）。
2. **方案文档完结后移入 history/**：作为决策背景归档，文首标注状态与最后同步日期；被新文档取代时在索引里注明取代关系。
3. **架构性结论优先写进根目录 agent.md**：跨模块的约定（命令、验证流程、语言代码、存储契约参数序等）以 agent.md 为单一入口，本目录文档只展开专题细节，必要时互相链接。
4. **新增专题先看是否已有归属**：UI 相关进 `reference/ui-design-system.md` 或对应页面文档；不确定时在索引表加一行并保持两段式（说明 + 对应代码）格式。
