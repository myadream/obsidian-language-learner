<template>
	<div class="stat-analytics-dashboard">
		<!-- 顶层 KPI 计数概览小卡片 -->
		<div class="kpi-cards-row">
			<div class="kpi-card">
				<span class="kpi-label">{{ t("Total Words") }}</span>
				<span class="kpi-val">{{ totalWords.toLocaleString() }}</span>
			</div>
			<div class="kpi-card accent-learning">
				<span class="kpi-label">{{ t("Learning Words") }}</span>
				<span class="kpi-val">{{ learningWords.toLocaleString() }}</span>
			</div>
			<div class="kpi-card accent-ignore">
				<span class="kpi-label">{{ t("Ignored Words") }}</span>
				<span class="kpi-val">{{ ignoreWords.toLocaleString() }}</span>
			</div>
		</div>

		<!-- 中层 7 天趋势图分析 -->
		<div class="chart-section-card">
			<CustomChart :dates="last7days" :series="chartSeries" />
		</div>

		<!-- 底层 2 个比例分布 Donut 饼图 -->
		<div class="donuts-row">
			<DonutChart :title="t('Word Ratio')" :items="statusRatioItems" />
			<DonutChart :title="t('Learning Distribution')" :items="learningStageItems" />
		</div>
	</div>
</template>

<script setup lang="ts">
import { moment } from "obsidian";
import { ref, onMounted, onUnmounted, getCurrentInstance } from "vue";
import { t } from "@/lang/helper";
import LanguageLearner from "@/plugin";
import CustomChart from "./CustomChart.vue";
import DonutChart, { DonutItem } from "./DonutChart.vue";

const plugin: LanguageLearner = getCurrentInstance().appContext.config.globalProperties.plugin;

const last7days = [6, 5, 4, 3, 2, 1, 0].map((i) =>
	moment().subtract(i, "days").format("M-D")
);

// 新组件数据定义
const chartSeries = ref([
	{ name: t("Day Ignore"), color: "#4c6ef5", data: [0, 0, 0, 0, 0, 0, 0], type: "area" as const },
	{ name: t("Day Non-Ignore"), color: "#51cf66", data: [0, 0, 0, 0, 0, 0, 0], type: "area" as const },
]);

// KPI 统计数据
const totalWords = ref(0);
const learningWords = ref(0);
const ignoreWords = ref(0);

// Donut 饼图数据
const statusRatioItems = ref<DonutItem[]>([]);
const learningStageItems = ref<DonutItem[]>([]);

onMounted(async () => {
	updateChart();
});

async function updateChart() {
	// 获取 7 天趋势数据
	let data = await plugin.storage.DB().countSeven();
	let dayIgnoreWords = data.map((d) => d.today[0]);
	let dayNoIgnoreWords = data.map((d) =>
		d.today.slice(1).reduce((a, b) => a + b)
	);

	// 更新原生 SVG 曲线图数据（暂时隐藏累计）
	chartSeries.value = [
		{ name: t("Day Ignore"), color: "#4c6ef5", data: dayIgnoreWords, type: "area" },
		{ name: t("Day Non-Ignore"), color: "#51cf66", data: dayNoIgnoreWords, type: "area" },
	];

	// 获取单词全局状态统计数据
	try {
		let countInfo = await plugin.storage.DB().getCount();
		let wordCounts = countInfo.word_count || [0, 0, 0, 0, 0];

		let ignoreCount = wordCounts[0] || 0;
		let learningCount = wordCounts[1] || 0;
		let familiarCount = wordCounts[2] || 0;
		let knownCount = wordCounts[3] || 0;
		let learnedCount = wordCounts[4] || 0;

		let totalLearningCount = learningCount + familiarCount + knownCount + learnedCount;
		let totalAllCount = ignoreCount + totalLearningCount;

		totalWords.value = totalAllCount;
		learningWords.value = totalLearningCount;
		ignoreWords.value = ignoreCount;

		// 图一：词汇比例 (无视 vs 在学)
		statusRatioItems.value = [
			{ name: t("Ignore"), value: ignoreCount, color: "#748096" },
			{ name: t("In Learning"), value: totalLearningCount, color: "#4c6ef5" },
		];

		// 图二：在学词汇分布
		learningStageItems.value = [
			{ name: t("Learning"), value: learningCount, color: "#ff922b" },
			{ name: t("Familiar"), value: familiarCount, color: "#fcc419" },
			{ name: t("Known"), value: knownCount, color: "#51cf66" },
			{ name: t("Learned"), value: learnedCount, color: "#20c997" },
		];
	} catch (e) {
		console.warn("Failed to load word count info", e);
	}
}

onMounted(() => {
	addEventListener("obsidian-langr-refresh-stat", updateChart);
});

onUnmounted(() => {
	removeEventListener("obsidian-langr-refresh-stat", updateChart);
});

</script>

<style lang="scss">
.stat-analytics-dashboard {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 8px 6px;
	width: 100%;
	box-sizing: border-box;

	.kpi-cards-row {
		display: flex;
		gap: 6px;
		width: 100%;
		box-sizing: border-box;

		.kpi-card {
			flex: 1;
			min-width: 0;
			background-color: var(--background-secondary, #ffffff);
			border: 1px solid var(--background-modifier-border, rgba(128, 128, 128, 0.18));
			border-radius: var(--radius-m, 6px);
			padding: 6px 8px;
			display: flex;
			flex-direction: column;
			box-sizing: border-box;

			.kpi-label {
				font-size: 0.75em;
				color: var(--text-muted);
				margin-bottom: 2px;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}

			.kpi-val {
				font-size: 1.1em;
				font-weight: 700;
				color: var(--text-normal);
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}

			&.accent-learning .kpi-val {
				color: var(--text-accent, #4c6ef5);
			}

			&.accent-ignore .kpi-val {
				color: var(--text-muted, #748096);
			}
		}
	}

	.chart-section-card {
		background-color: var(--background-secondary, #ffffff);
		border: 1px solid var(--background-modifier-border, rgba(128, 128, 128, 0.18));
		border-radius: var(--radius-m, 8px);
		padding: 8px 6px 4px 6px;
		box-sizing: border-box;
		width: 100%;
	}

	.donuts-row {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		box-sizing: border-box;
	}
}
</style>
