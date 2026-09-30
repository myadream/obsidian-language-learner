// 必须在任何测试文件导入 Dexie 之前同步安装 fake IndexedDB
// （Dexie 在模块加载时即捕获 indexedDB 全局）
import "fake-indexeddb/auto";
