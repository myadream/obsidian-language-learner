<template>
	<div class="stat-analytics-dashboard">
		<!-- 总览带：三大数字 + 忽略/在学比例条 -->
		<section class="overview-band">
			<div class="ov-stats">
				<div class="ov-stat">
					<span class="ov-label">{{ t("Total Words") }}</span>
					<span class="ov-val">{{ totalWords.toLocaleString() }}</span>
				</div>
				<div class="ov-stat is-learning">
					<span class="ov-label">
						<span class="ov-dot" aria-hidden="true"></span>
						{{ t("Learning Words") }}
					</span>
					<span class="ov-val">{{ learningWords.toLocaleString() }}</span>
				</div>
				<div class="ov-stat is-ignore">
					<span class="ov-label">
						<span class="ov-dot" aria-hidden="true"></span>
						{{ t("Ignored Words") }}
					</span>
					<span class="ov-val">{{ ignoreWords.toLocaleString() }}</span>
				</div>
			</div>
			<div
				v-if="totalWords > 0"
				class="ov-bar"
				role="img"
				:aria-label="`${t('In Learning')} ${learningRatioText}% · ${t('Ignore')} ${ignoreRatioText}%`"
			>
				<span
					class="bar-seg is-learning"
					:style="{ width: learningRatioText + '%' }"
					:title="`${t('In Learning')} ${learningRatioText}%`"
				></span>
				<span
					class="bar-seg is-ignore"
					:style="{ width: ignoreRatioText + '%' }"
					:title="`${t('Ignore')} ${ignoreRatioText}%`"
				></span>
			</div>
		</section>

		<!-- 非对称网格：左趋势大图 + 右比例纵列 -->
		<div class="dash-grid">
			<section class="trend-panel">
				<div class="panel-head">
					<span class="panel-title">{{ t("7-Day Trend") }}</span>
				</div>
				<CustomChart :dates="last7days" :series="chartSeries" />
			</section>

			<div class="ratio-col">
				<DonutChart :title="t('Word Ratio')" :items="statusRatioItems" />
				<DonutChart :title="t('Learning Distribution')" :items="learningStageItems" />
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { moment } from "obsidian";
import { ref, computed, onMounted, onUnmounted, getCurrentInstance } from "vue";
import { t } from "@/lang/helper";
import LanguageLearner from "@/plugin";
import CustomChart from "./CustomChart.vue";
import DonutChart, { DonutItem } from "./DonutChart.vue";

const plugin: LanguageLearner = getCurrentInstance().appContext.config.globalProperties.plugin;

const last7days = [6, 5, 4, 3, 2, 1, 0].map((i) =>
	moment().subtract(i, "days").format("M-D")
);

// 图表系列色引用 CSS 变量（SVG 属性不支持 var()，CustomChart 以内联 style 应用），
// 随明暗主题自动切换深浅
const chartSeries = ref([
	{ name: t("Day Ignore"), color: "var(--ll-chart-secondary)", data: [0, 0, 0, 0, 0, 0, 0], type: "area" as const },
	{ name: t("Day Non-Ignore"), color: "var(--ll-chart-primary)", data: [0, 0, 0, 0, 0, 0, 0], type: "area" as const },
]);

// KPI 统计数据
const totalWords = ref(0);
const learningWords = ref(0);
const ignoreWords = ref(0);

// 比例条：在学 / 忽略占比
const learningRatioText = computed(() => {
	if (totalWords.value === 0) return "0";
	return ((learningWords.value / totalWords.value) * 100).toFixed(1);
});
const ignoreRatioText = computed(() => {
	if (totalWords.value === 0) return "0";
	return ((ignoreWords.value / totalWords.value) * 100).toFixed(1);
});

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
		{ name: t("Day Ignore"), color: "var(--ll-chart-secondary)", data: dayIgnoreWords, type: "area" },
		{ name: t("Day Non-Ignore"), color: "var(--ll-chart-primary)", data: dayNoIgnoreWords, type: "area" },
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

		// 图一：词汇比例 (无视 vs 在学)，色值与 --status-* 体系一致
		statusRatioItems.value = [
			{ name: t("Ignore"), value: ignoreCount, color: "var(--status-ignore-main)" },
			{ name: t("In Learning"), value: totalLearningCount, color: "var(--ll-chart-primary)" },
		];

		// 图二：在学词汇分布
		learningStageItems.value = [
			{ name: t("Learning"), value: learningCount, color: "var(--status-learning-main)" },
			{ name: t("Familiar"), value: familiarCount, color: "var(--status-familiar-main)" },
			{ name: t("Known"), value: knownCount, color: "var(--status-known-main)" },
			{ name: t("Learned"), value: learnedCount, color: "var(--status-learned-main)" },
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
	gap: var(--ll-space-3);
	padding: var(--ll-space-3) var(--ll-space-2);
	width: 100%;
	box-sizing: border-box;

	// ── 总览带 ──────────────────────────────────────────────
	.overview-band {
		background-color: var(--ll-surface-2);
		border: 1px solid var(--ll-border);
		border-radius: var(--ll-radius-md);
		padding: var(--ll-space-4) var(--ll-space-4) var(--ll-space-3);
		display: flex;
		flex-direction: column;
		gap: var(--ll-space-3);
		box-sizing: border-box;
		width: 100%;

		.ov-stats {
			display: flex;
			align-items: stretch;

			.ov-stat {
				display: flex;
				flex-direction: column;
				gap: 4px;
				flex: 1;
				min-width: 0;
				padding-right: var(--ll-space-4);

				& + .ov-stat {
					padding-left: var(--ll-space-4);
					border-left: 1px solid var(--ll-border);
				}

				.ov-label {
					display: inline-flex;
					align-items: center;
					gap: 6px;
					font-size: 11px;
					font-weight: 600;
					letter-spacing: 0.05em;
					text-transform: uppercase;
					color: var(--ll-text-3);
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;

					.ov-dot {
						width: 7px;
						height: 7px;
						border-radius: 50%;
						background: currentColor;
						flex-shrink: 0;
					}
				}

				.ov-val {
					font-size: 1.75em;
					font-weight: 700;
					line-height: 1.1;
					color: var(--ll-text);
					font-variant-numeric: tabular-nums;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}

				&.is-learning {
					.ov-label {
						color: var(--ll-primary);

						.ov-dot {
							background: var(--ll-primary);
						}
					}
				}

				&.is-ignore {
					.ov-label {
						color: var(--status-ignore-main);

						.ov-dot {
							background: var(--status-ignore-main);
						}
					}
				}
			}
		}

		// 比例条：在学（品牌青绿）/ 忽略（石板灰）两段方形条
		.ov-bar {
			display: flex;
			height: 6px;
			border-radius: var(--ll-radius-xs);
			overflow: hidden;
			background: var(--ll-surface-3);

			.bar-seg {
				display: block;
				height: 100%;
				transition: width var(--ll-speed-slow) var(--ll-ease);

				&.is-learning {
					background: var(--ll-primary);
				}

				&.is-ignore {
					background: var(--status-ignore-main);
				}
			}
		}
	}

	// ── 非对称仪表网格 ───────────────────────────────────────
	.dash-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
		gap: var(--ll-space-3);
		align-items: start;
		width: 100%;
		box-sizing: border-box;
	}

	.trend-panel {
		background-color: var(--ll-surface-2);
		border: 1px solid var(--ll-border);
		border-radius: var(--ll-radius-md);
		padding: var(--ll-space-3) var(--ll-space-3) var(--ll-space-1);
		box-sizing: border-box;
		width: 100%;

		.panel-head {
			display: flex;
			align-items: center;
			margin-bottom: var(--ll-space-2);

			.panel-title {
				font-size: 0.88em;
				font-weight: 600;
				color: var(--ll-text);
			}
		}
	}

	.ratio-col {
		display: flex;
		flex-direction: column;
		gap: var(--ll-space-3);
		min-width: 0;
	}

	// ── 窄屏：单列堆叠，环形图并排 ────────────────────────────
	@media (max-width: 900px) {
		.dash-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.ratio-col {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		}

		.ov-stats {
			flex-wrap: wrap;

			.ov-stat + .ov-stat {
				border-left: none !important;
				padding-left: 0 !important;
			}
		}
	}
}
</style>
