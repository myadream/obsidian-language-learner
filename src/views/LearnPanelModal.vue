<template>
  <div>
    <NConfigProvider :theme="theme" :theme-overrides="themeOverrides">
      <NMessageProvider>
        <NModal
          :show="props.show"
          @update:show="handleShowChange"
          :mask-closable="false"
          preset="dialog"
          :title="isEdit ? t('Edit Word') : t('Learning New Words')"
          :show-icon="false"
          class="learn-panel-modal"
          :style="{ width: 'min(640px, 94vw)' }"
          closable
        >
          <div id="langr-learn-panel-modal">
            <LearnPanelForm :model="model" />
          </div>
          <!-- 操作固定在底栏，长表单滚动时提交/取消始终可见 -->
          <template #action>
            <div class="modal-actions">
              <NButton quaternary @click="handleCancel">
                {{ t("Cancel") }}
              </NButton>
              <NButton
                type="primary"
                size="medium"
                @click="submit"
                :loading="submitLoading"
                class="submit-button"
              >
                <template #icon>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 15px; height: 15px; display: block;">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </template>
                {{ t("Submit") }}
              </NButton>
            </div>
          </template>
        </NModal>
      </NMessageProvider>
    </NConfigProvider>
  </div>
</template>

<script setup lang="ts">
import { darkTheme, NButton, NConfigProvider, NModal, NMessageProvider } from "naive-ui";
import { ExpressionInfo } from "@/storage/interface";
import { computed, PropType, watch, getCurrentInstance, ref } from "vue";
import { t } from "@/lang/helper";
import { Notice } from "obsidian";
import Plugin from "@/plugin";
import store from "@/store";
import { useLearn } from "./useLearn";
import LearnPanelForm from "./LearnPanelForm.vue";

const emit = defineEmits(["onChangeShow", "onChangeWord"]);

const props = defineProps({
  show: {
    type: Boolean,
    required: true,
  },
  word: {
    type: Object as PropType<ExpressionInfo>,
    required: true,
  },
});

const { model, themeOverrides, plugin, submit: submitForm } = useLearn();

// 编辑已有单词时切换标题
const isEdit = computed(() => Boolean(props.word?.expression));

// 处理模态框显示状态变化
const handleShowChange = (value: boolean) => {
    emit("onChangeShow", value);
};

// 取消编辑，直接关闭
const handleCancel = () => {
    emit("onChangeShow", false);
};

watch(
  () => props.show,
  (newValue) => {
    if (newValue === false) {
      emit("onChangeShow", newValue);
    }
  }
);
watch(
  () => props.word,
  (newValue) => {
    // 兜底：查询失败时 word 可能是 null/undefined，直接深拷贝会让 model 变 null 炸掉表单
    const base =
      newValue && typeof newValue === "object"
        ? newValue
        : {
            expression: null,
            meaning: null,
            status: 1,
            t: "WORD",
            tags: [],
            notes: [],
            sentences: [],
            connections: [],
          };
    // 防止重复
    model.value = JSON.parse(JSON.stringify(base));
  },
  { immediate: true }
);

// 切换明亮/黑暗模式
const theme = computed(() => {
  return store.dark ? darkTheme : null;
});

// 提交信息到数据库的加载状态
let submitLoading = ref(false);

async function submit() {
  submitLoading.value = true;
  const res = await submitForm(props.word.expression);
  submitLoading.value = false;

  if (res) {
    emit("onChangeShow", false);
    emit("onChangeWord", model);
  }
}
</script>

<style lang="scss">
// NModal 的 class 落在 dialog 根元素自身而非父容器，必须 &.n-dialog 才能命中
.learn-panel-modal {
  &.n-dialog {
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: var(--ll-radius-md);
    border-top: 2px solid var(--ll-primary);
    padding: 0;

    // 模态框标题样式（根元素 padding 已置 0 让底栏通栏，标题/内容各自补内边距）
    .n-dialog__title {
      padding: var(--ll-space-4) var(--ll-space-5) var(--ll-space-2);
      padding-right: calc(var(--ll-space-6) + 16px);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ll-text-2);
    }

    // 内容区域（长表单滚动，滚动条隐藏保持扁平观感）
    .n-dialog__content {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: var(--ll-space-2) var(--ll-space-5) var(--ll-space-4);

      &::-webkit-scrollbar {
        display: none;
        width: 0;
        height: 0;
      }

      // Firefox 隐藏滚动条
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    // 底部操作栏（固定，不随内容滚动）
    .n-dialog__action {
      padding: var(--ll-space-3) var(--ll-space-5);
      border-top: 1px solid var(--ll-border);
      background: var(--ll-surface-2);

      .modal-actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: var(--ll-space-3);
        width: 100%;
      }

      .submit-button {
        min-width: 120px;
        font-weight: 500;
      }
    }

    // ── 窄屏适配：压缩内边距，内容区占满高度 ────────────────
    @media (max-width: 560px) {
      width: 94vw;
      max-height: 92vh;

      .n-dialog__title {
        padding: var(--ll-space-3) var(--ll-space-4) var(--ll-space-1);
        padding-right: calc(var(--ll-space-6) + 8px);
        font-size: 13px;
      }

      .n-dialog__content {
        padding: var(--ll-space-1) var(--ll-space-4) var(--ll-space-3);
      }

      .n-dialog__action {
        padding: var(--ll-space-2) var(--ll-space-4);
      }
    }
  }
}
</style>
