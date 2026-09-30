import type { GlobalThemeOverrides } from "naive-ui";

/**
 * 共享 naive-ui 主题覆盖
 * 色值与 styles/tokens.css 保持一致：青绿主色 + 橙色强调
 * 所有视图的 NConfigProvider 都应使用本函数，保证组件观感统一
 */
const palette = {
    light: {
        primary: "#0d9488",
        primaryHover: "#0f766e",
        primaryPressed: "#115e59",
        info: "#0284c7",
        success: "#16a34a",
        warning: "#d97706",
        error: "#dc2626",
    },
    dark: {
        primary: "#2dd4bf",
        primaryHover: "#5eead4",
        primaryPressed: "#14b8a6",
        info: "#38bdf8",
        success: "#4ade80",
        warning: "#fbbf24",
        error: "#f87171",
    },
};

export function getThemeOverrides(dark: boolean): GlobalThemeOverrides {
    const p = dark ? palette.dark : palette.light;
    return {
        common: {
            primaryColor: p.primary,
            primaryColorHover: p.primaryHover,
            primaryColorPressed: p.primaryPressed,
            primaryColorSuppl: p.primary,
            infoColor: p.info,
            infoColorHover: p.info,
            infoColorPressed: p.info,
            successColor: p.success,
            warningColor: p.warning,
            errorColor: p.error,
            // 方形圆角：全组件统一 3px 倒角，禁止胶囊造型
            borderRadius: "3px",
            borderRadiusSmall: "2px",
            fontSize: "14px",
            fontSizeMedium: "14px",
            fontSizeSmall: "13px",
            fontSizeTiny: "12px",
        },
        Button: { borderRadiusMedium: "3px", borderRadiusSmall: "2px", borderRadiusTiny: "2px" },
        Card: { borderRadius: "4px" },
        Dialog: { borderRadius: "4px" },
        Input: { borderRadius: "3px" },
        Tag: { borderRadius: "2px" },
        Pagination: { itemBorderRadius: "3px" },
        Drawer: { borderRadius: "0" },
    };
}
