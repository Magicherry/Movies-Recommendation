"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_LINE,
  AXIS_TICK,
  TRAIN_STROKE,
  VAL_STROKE,
  VAL_ERR_MAE_STROKE,
  VAL_ERR_RMSE_STROKE,
  tooltipTraining,
} from "./training-engine-curves-block";

const commonMargin = { top: 28, right: 10, left: 2, bottom: 28 } as const;

const LR_STROKE = "#06b6d4";

const legendTopRight = {
  align: "right" as const,
  verticalAlign: "top" as const,
  wrapperStyle: { fontSize: 12, color: "var(--text-subtle)", paddingLeft: 8 },
};

const tooltipLr = {
  contentStyle: {
    backgroundColor: "var(--chart-tooltip-bg)",
    border: "var(--chart-tooltip-border)",
    borderRadius: "var(--chart-tooltip-radius)",
  },
  labelStyle: { color: "var(--text-subtle)", fontSize: 12, marginBottom: 4 } as const,
  itemStyle: { color: LR_STROKE, fontSize: 13, fontWeight: 600 } as const,
  labelFormatter: (label: unknown) => `Epoch ${String(label)}`,
  formatter: (value: unknown, name: unknown) => {
    const n = name == null ? "" : String(name);
    if (typeof value === "number" && Number.isFinite(value)) {
      return [value.toExponential(4), n];
    }
    return [String(value ?? "—"), n];
  },
  cursor: { fill: "var(--chart-cursor-fill)" } as const,
  wrapperStyle: { outline: "none" } as const,
};

type History = {
  loss?: number[];
  train_loss?: number[];
  val_loss?: number[];
  mae?: number[];
  val_mae?: number[];
  rmse?: number[];
  val_rmse?: number[];
  learning_rate?: number[];
};

export function ActiveModelHistoryCharts({
  modelLabel,
  history,
  isOption4Als,
  lossChartData,
  maeChartData,
  rmseChartData,
  lrChartData,
}: {
  modelLabel: string;
  history: History;
  isOption4Als: boolean;
  lossChartData: { epoch: number; loss: number; val_loss?: number }[];
  maeChartData: { epoch: number; mae: number; val_mae?: number }[];
  rmseChartData: { epoch: number; rmse: number; val_rmse?: number }[];
  lrChartData: { epoch: number; lr: number }[];
}) {
  const h = history;
  const t = (suffix: string) => `${modelLabel}: ${suffix}`;
  const showMae = !!(h.mae && h.val_mae);
  const showRmse = !!(h.rmse && h.val_rmse);
  const maeRmsePair =
    showMae &&
    showRmse &&
    maeChartData.length > 0 &&
    rmseChartData.length > 0;

  const hasNeuralOrHuberLoss = !!(h.loss?.length || h.train_loss?.length);
  const lossChartTitle = hasNeuralOrHuberLoss
    ? t("Huber / loss per epoch")
    : isOption4Als
      ? t("Training convergence")
      : t("Train RMSE vs train MAE (matrix factorization)");

  const hasLossChart = lossChartData.length > 0;
  const hasLrChart = !!(h.learning_rate && lrChartData.length > 0);

  const lossLine1Stroke = hasNeuralOrHuberLoss ? TRAIN_STROKE : VAL_ERR_RMSE_STROKE;
  const lossLine2Stroke = hasNeuralOrHuberLoss ? VAL_STROKE : VAL_ERR_MAE_STROKE;
  const lossTooltipSeriesColor = hasNeuralOrHuberLoss ? TRAIN_STROKE : VAL_ERR_RMSE_STROKE;

  const lossChartCard = hasLossChart ? (
    <div className="chart-wrapper settings-db-charts db-chart-card">
      <h4 className="db-chart-title">{lossChartTitle}</h4>
      <p className="setting-desc">
        {hasNeuralOrHuberLoss
          ? "Primary training loss and validation on holdout, by epoch."
          : "Per-epoch train RMSE vs train MAE (models without a single Huber/loss series)."}
      </p>
      <div className="db-training-chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={lossChartData} margin={commonMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
            <XAxis
              dataKey="epoch"
              type="number"
              domain={["dataMin", "dataMax"]}
              allowDecimals={false}
              axisLine={AXIS_LINE}
              tickLine={false}
              tick={AXIS_TICK}
              label={{ value: "Epoch", position: "bottom", offset: 0, fill: "var(--text-subtle)", fontSize: 11 }}
            />
            <YAxis
              axisLine={AXIS_LINE}
              tickLine={false}
              tick={AXIS_TICK}
              width={52}
              domain={["auto", "auto"]}
              label={
                hasNeuralOrHuberLoss
                  ? { value: "Loss", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }
                  : { value: "Error", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }
              }
            />
            <Tooltip {...tooltipTraining(lossTooltipSeriesColor)} />
            <Legend {...legendTopRight} />
            <Line
              type="monotone"
              dataKey="loss"
              name={hasNeuralOrHuberLoss ? "Train loss" : "Train RMSE"}
              stroke={lossLine1Stroke}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="val_loss"
              name={hasNeuralOrHuberLoss ? "Val loss" : "Train MAE"}
              stroke={lossLine2Stroke}
              strokeWidth={2}
              {...(hasNeuralOrHuberLoss ? { strokeDasharray: "5 4" } : {})}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  ) : null;

  const lrChartCard = hasLrChart ? (
    <div className="chart-wrapper settings-db-charts db-chart-card">
      <h4 className="db-chart-title">{t("Learning rate schedule")}</h4>
      <p className="setting-desc">Optimizer step size per epoch (when available).</p>
      <div className="db-training-chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={lrChartData} margin={commonMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
            <XAxis
              dataKey="epoch"
              type="number"
              domain={["dataMin", "dataMax"]}
              allowDecimals={false}
              axisLine={AXIS_LINE}
              tickLine={false}
              tick={AXIS_TICK}
              label={{ value: "Epoch", position: "bottom", offset: 0, fill: "var(--text-subtle)", fontSize: 11 }}
            />
            <YAxis
              axisLine={AXIS_LINE}
              tickLine={false}
              tick={AXIS_TICK}
              width={60}
              domain={["auto", "auto"]}
              tickFormatter={(val) => (typeof val === "number" ? val.toExponential(1) : String(val))}
              label={{ value: "LR", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }}
            />
            <Tooltip {...tooltipLr} />
            <Legend {...legendTopRight} />
            <Line
              type="stepAfter"
              dataKey="lr"
              name="Learning rate"
              stroke={LR_STROKE}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  ) : null;

  return (
    <div className="model-history">
      <div className="model-engine-chart-stack">
        {hasLossChart && hasLrChart && (
          <div className="db-dashboard-grid training-curves-pair">
            <div className="db-dashboard-cell">{lossChartCard}</div>
            <div className="db-dashboard-cell">{lrChartCard}</div>
          </div>
        )}

        {hasLossChart && !hasLrChart && (
          <div className="db-dashboard-grid training-curves-pair training-curves-single">
            <div className="db-dashboard-cell">{lossChartCard}</div>
          </div>
        )}

        {!hasLossChart && hasLrChart && (
          <div className="db-dashboard-grid training-curves-pair training-curves-single">
            <div className="db-dashboard-cell">{lrChartCard}</div>
          </div>
        )}

        {maeRmsePair && (
          <div className="db-dashboard-grid training-curves-pair">
            <div className="db-dashboard-cell">
              <div className="chart-wrapper settings-db-charts db-chart-card">
                <h4 className="db-chart-title">{t("MAE per epoch")}</h4>
                <p className="setting-desc">Train and validation mean absolute error.</p>
                <div className="db-training-chart-plot">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={maeChartData} margin={commonMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                      <XAxis
                        dataKey="epoch"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        allowDecimals={false}
                        axisLine={AXIS_LINE}
                        tickLine={false}
                        tick={AXIS_TICK}
                        label={{ value: "Epoch", position: "bottom", offset: 0, fill: "var(--text-subtle)", fontSize: 11 }}
                      />
                      <YAxis
                        axisLine={AXIS_LINE}
                        tickLine={false}
                        tick={AXIS_TICK}
                        width={52}
                        domain={["auto", "auto"]}
                        label={{ value: "MAE", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }}
                      />
                      <Tooltip {...tooltipTraining(TRAIN_STROKE)} />
                      <Legend {...legendTopRight} />
                      <Line
                        type="monotone"
                        dataKey="mae"
                        name="Train MAE"
                        stroke={TRAIN_STROKE}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="val_mae"
                        name="Val MAE"
                        stroke={VAL_STROKE}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="db-dashboard-cell">
              <div className="chart-wrapper settings-db-charts db-chart-card">
                <h4 className="db-chart-title">{t("RMSE per epoch")}</h4>
                <p className="setting-desc">Train and validation root mean square error.</p>
                <div className="db-training-chart-plot">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rmseChartData} margin={commonMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                      <XAxis
                        dataKey="epoch"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        allowDecimals={false}
                        axisLine={AXIS_LINE}
                        tickLine={false}
                        tick={AXIS_TICK}
                        label={{ value: "Epoch", position: "bottom", offset: 0, fill: "var(--text-subtle)", fontSize: 11 }}
                      />
                      <YAxis
                        axisLine={AXIS_LINE}
                        tickLine={false}
                        tick={AXIS_TICK}
                        width={52}
                        domain={["auto", "auto"]}
                        label={{ value: "RMSE", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }}
                      />
                      <Tooltip {...tooltipTraining(TRAIN_STROKE)} />
                      <Legend {...legendTopRight} />
                      <Line
                        type="monotone"
                        dataKey="rmse"
                        name="Train RMSE"
                        stroke={TRAIN_STROKE}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="val_rmse"
                        name="Val RMSE"
                        stroke={VAL_STROKE}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {!maeRmsePair && showMae && maeChartData.length > 0 && (
          <div className="db-dashboard-grid training-curves-pair training-curves-single">
            <div className="db-dashboard-cell">
              <div className="chart-wrapper settings-db-charts db-chart-card">
                <h4 className="db-chart-title">{t("MAE per epoch")}</h4>
                <p className="setting-desc">Train and validation mean absolute error.</p>
                <div className="db-training-chart-plot">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={maeChartData} margin={commonMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                      <XAxis
                        dataKey="epoch"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        allowDecimals={false}
                        axisLine={AXIS_LINE}
                        tickLine={false}
                        tick={AXIS_TICK}
                        label={{ value: "Epoch", position: "bottom", offset: 0, fill: "var(--text-subtle)", fontSize: 11 }}
                      />
                      <YAxis
                        axisLine={AXIS_LINE}
                        tickLine={false}
                        tick={AXIS_TICK}
                        width={52}
                        domain={["auto", "auto"]}
                        label={{ value: "MAE", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }}
                      />
                      <Tooltip {...tooltipTraining(TRAIN_STROKE)} />
                      <Legend {...legendTopRight} />
                      <Line
                        type="monotone"
                        dataKey="mae"
                        name="Train MAE"
                        stroke={TRAIN_STROKE}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="val_mae"
                        name="Val MAE"
                        stroke={VAL_STROKE}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {!maeRmsePair && showRmse && rmseChartData.length > 0 && (
          <div className="db-dashboard-grid training-curves-pair training-curves-single">
            <div className="db-dashboard-cell">
              <div className="chart-wrapper settings-db-charts db-chart-card">
                <h4 className="db-chart-title">{t("RMSE per epoch")}</h4>
                <p className="setting-desc">Train and validation root mean square error.</p>
                <div className="db-training-chart-plot">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rmseChartData} margin={commonMargin}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                      <XAxis
                        dataKey="epoch"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        allowDecimals={false}
                        axisLine={AXIS_LINE}
                        tickLine={false}
                        tick={AXIS_TICK}
                        label={{ value: "Epoch", position: "bottom", offset: 0, fill: "var(--text-subtle)", fontSize: 11 }}
                      />
                      <YAxis
                        axisLine={AXIS_LINE}
                        tickLine={false}
                        tick={AXIS_TICK}
                        width={52}
                        domain={["auto", "auto"]}
                        label={{ value: "RMSE", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }}
                      />
                      <Tooltip {...tooltipTraining(TRAIN_STROKE)} />
                      <Legend {...legendTopRight} />
                      <Line
                        type="monotone"
                        dataKey="rmse"
                        name="Train RMSE"
                        stroke={TRAIN_STROKE}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="val_rmse"
                        name="Val RMSE"
                        stroke={VAL_STROKE}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
