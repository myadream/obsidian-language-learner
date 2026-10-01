# 单词学习状态颜色配置

> **类型**：技术参考（现行有效）　**最后同步**：2026-09-30（UI 重设计后与 src/statusColors.ts / statusColors.css 核对一致）
> 跨模块的工程约定与架构总览见根目录 [AGENTS.md](../../AGENTS.md)，文档组织规则见 [../README.md](../README.md)；UI 整体规范见 [ui-design-system.md](ui-design-system.md)。

## 概述

本项目使用统一的颜色配置系统来管理单词学习状态的显示颜色，确保在 `ReadingArea` 和 `DataPanel` 中颜色显示的一致性。Learned 状态使用品牌青绿色（与设计令牌 `--ll-primary` 同族），语义上呼应"已掌握 = 品牌色"。

## 状态定义（亮色主题）

| 状态码 | 状态名称 | 颜色 | 说明 |
|--------|----------|------|------|
| 0 | Ignore | 石板灰 #94a3b8 | 忽略的单词 |
| 1 | Learning | 琥珀橙 #d97706 | 正在学习中的单词 |
| 2 | Familiar | 蓝 #2563eb | 熟悉的单词 |
| 3 | Known | 绿 #16a34a | 已知的单词 |
| 4 | Learned | 青绿 #0d9488 | 已掌握的单词 |

暗色主题（`.theme-dark`）在 `statusColors.css` 中整体提亮主色、微调透明度。

## 颜色配置文件

### 1. TypeScript 配置文件
**位置**: `src/statusColors.ts`

提供以下功能：
- `WordStatus` 枚举：定义所有学习状态
- `StatusColors` 对象：包含每个状态的完整颜色配置（主色、背景色、边框色）
- `StatusColorMap` 映射：通过状态索引获取颜色配置
- `StatusClassMap` 映射：通过状态索引获取 CSS 类名
- 辅助函数：`getStatusColor()`, `getStatusClass()`, `getStatusMainColor()` 等

> 注意：TS 配置为单套色值（取亮色主题），仅用于无法引用 CSS 变量的内联场景；能走 CSS 的地方一律用变量。

### 2. CSS 变量文件
**位置**: `src/statusColors.css`

定义了 CSS 变量，可以在任何 SCSS 文件中使用：

```scss
// 使用 CSS 变量
.my-element {
    background-color: var(--status-learning-bg);
    color: var(--status-learning-main);
    border: 1px solid var(--status-learning-border);
}
```

可用的 CSS 变量：
- `--status-ignore-main/bg/border`
- `--status-learning-main/bg/border`
- `--status-familiar-main/bg/border`
- `--status-known-main/bg/border`
- `--status-learned-main/bg/border`

## 在组件中使用

### ReadingArea.vue

使用 CSS 类名应用颜色：
```scss
span {
    .learning {
        background-color: var(--status-learning-bg);
    }
    .known {
        background-color: var(--status-known-bg);
    }
}
```

### WordCardList.vue（DataPanel 卡片）

状态芯片用 `StatusClassMap` 生成类名，颜色由 `.ll-status-chip.s-*` 上的 CSS 变量提供，随明暗主题自动切换：

```vue
<span class="ll-status-chip" :class="`s-${statusClass(item.statusIndex)}`">
    <span class="status-dot" aria-hidden="true"></span>
    {{ item.status }}
</span>
```

```scss
@each $s in ignore learning familiar known learned {
    &.s-#{$s} {
        color: var(--status-#{$s}-main);
        background: var(--status-#{$s}-bg);
        border-color: var(--status-#{$s}-border);
    }
}
```

## 颜色透明度说明

- **Main Color**: 100% 不透明，用于文字颜色、图标等
- **Background**: ~22-26% 透明度，用于背景高亮
- **Border**: 40-50% 透明度，用于边框

## 主题适配

`statusColors.css` 中 `.theme-dark` 规则整体覆盖暗色变量（主色提亮、背景/边框透明度微调），由 Obsidian 在 body 上切换 `.theme-dark`/`.theme-light` 自动生效。

## 扩展指南

如果需要添加新的学习状态：

1. 在 `statusColors.ts` 中添加新的枚举值和颜色配置
2. 在 `statusColors.css` 中添加对应的 CSS 变量（含 `.theme-dark` 覆盖）
3. 在 `WordCardList.vue` 的 `@each` 列表中追加状态名
4. 更新相关组件以支持新状态

## 维护注意事项

- 修改颜色时，请同时更新 TypeScript 配置和 CSS 变量（含暗色段）
- 确保颜色对比度符合可访问性标准
- 测试在亮色和暗色主题下的显示效果
- 保持颜色系统的一致性，避免使用过多不同的颜色变体
