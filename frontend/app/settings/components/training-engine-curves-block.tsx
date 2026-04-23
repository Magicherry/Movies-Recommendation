"use client";

import { useEffect, useMemo, useState } from "react";
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

export const AXIS_LINE = { stroke: "var(--border-soft)" as const };
export const AXIS_TICK = { fill: "var(--text-subtle)", fontSize: 11 };

export const TRAIN_STROKE = "var(--chart-train-line)";
export const VAL_STROKE = "var(--chart-val-line)";
export const VAL_ORANGE = "var(--chart-val-secondary)";

/** Val MAE (rose) & Val RMSE (amber) in “Validation error”; same tokens for train RMSE vs train MAE (MF) line chart. */
export const VAL_ERR_MAE_STROKE = "var(--chart-val-err-mae)";
export const VAL_ERR_RMSE_STROKE = "var(--chart-val-err-rmse)";

type TrainingHistory = Record<string, number[] | undefined>;

export interface TrainingEngineRow {
  id: string;
  label: string;
  history: TrainingHistory;
}

function trainingEpochCount(h: TrainingHistory): number {
  let m = 0;
  for (const [k, v] of Object.entries(h)) {
    if (k.startsWith("best_")) continue;
    if (Array.isArray(v) && v.length > m) m = v.length;
  }
  return m;
}

function isDeepHybridHistory(h: TrainingHistory): boolean {
  return Array.isArray(h.train_loss) && h.train_loss.length >= 2;
}

function buildEpochRows(
  h: TrainingHistory,
  n: number,
  keys: string[]
): Array<{ epoch: number } & Record<string, number | undefined>> {
  const rows: Array<{ epoch: number } & Record<string, number | undefined>> = [];
  for (let i = 0; i < n; i++) {
    const row: { epoch: number } & Record<string, number | undefined> = { epoch: i + 1 };
    for (const key of keys) {
      const arr = h[key];
      if (Array.isArray(arr) && i < arr.length) {
        const v = arr[i];
        if (typeof v === "number" && Number.isFinite(v)) {
          row[key] = v;
        }
      }
    }
    rows.push(row);
  }
  return rows;
}

export const tooltipTraining = (seriesColor: string) => ({
  contentStyle: {
    backgroundColor: "var(--chart-tooltip-bg)",
    border: "var(--chart-tooltip-border)",
    borderRadius: "var(--chart-tooltip-radius)",
  },
  labelStyle: { color: "var(--text-subtle)", fontSize: 12, marginBottom: 4 } as const,
  itemStyle: { color: seriesColor, fontSize: 13, fontWeight: 600 } as const,
  labelFormatter: (label: unknown) => `Epoch ${String(label)}`,
  formatter: (value: unknown, name: unknown) => {
    const n = name == null ? "" : String(name);
    if (typeof value === "number" && Number.isFinite(value)) {
      return [value.toFixed(4), n];
    }
    return [String(value ?? "—"), n];
  },
  cursor: { fill: "var(--chart-cursor-fill)" } as const,
  wrapperStyle: { outline: "none" } as const,
});

function EngineTrainingGrid({ label, history }: { label: string; history: TrainingHistory }) {
  const n = trainingEpochCount(history);
  if (n < 2) return null;

  const commonMargin = { top: 28, right: 10, left: 2, bottom: 28 } as const;

  if (isDeepHybridHistory(history)) {
    const lossData = buildEpochRows(history, n, ["train_loss", "val_loss"]);
    const valErrData = buildEpochRows(history, n, ["val_mae", "val_rmse"]);
    const hasValLoss = (history.val_loss?.length ?? 0) >= 1;
    return (
      <div className="db-dashboard-grid training-curves-pair">
        <div className="db-dashboard-cell">
          <div className="chart-wrapper settings-db-charts db-chart-card">
            <h4 className="db-chart-title">{label}: Loss convergence</h4>
            <p className="setting-desc">Huber (smooth L1) loss on the training batch and on the holdout set.</p>
            <div className="db-training-chart-plot">
              <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lossData} margin={commonMargin}>
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
                  label={{ value: "Huber loss", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }}
                />
                <Tooltip {...tooltipTraining(TRAIN_STROKE)} />
                <Legend
                  align="right"
                  verticalAlign="top"
                  wrapperStyle={{ fontSize: 12, color: "var(--text-subtle)", paddingLeft: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="train_loss"
                  name="Train"
                  stroke={TRAIN_STROKE}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
                {hasValLoss && (
                  <Line
                    type="monotone"
                    dataKey="val_loss"
                    name="Validation"
                    stroke={VAL_STROKE}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="db-dashboard-cell">
          <div className="chart-wrapper settings-db-charts db-chart-card">
            <h4 className="db-chart-title">{label}: Validation error</h4>
            <p className="setting-desc">Holdout MAE and RMSE (rating scale) over training epochs.</p>
            <div className="db-training-chart-plot">
              <ResponsiveContainer width="100%" height="100%">
              <LineChart data={valErrData} margin={commonMargin}>
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
                  label={{ value: "Error", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }}
                />
                <Tooltip {...tooltipTraining(VAL_ERR_MAE_STROKE)} />
                <Legend
                  align="right"
                  verticalAlign="top"
                  wrapperStyle={{ fontSize: 12, color: "var(--text-subtle)", paddingLeft: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="val_mae"
                  name="Val MAE"
                  stroke={VAL_ERR_MAE_STROKE}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="val_rmse"
                  name="Val RMSE"
                  stroke={VAL_ERR_RMSE_STROKE}
                  strokeWidth={2}
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
    );
  }

  const maeData = buildEpochRows(history, n, ["train_mae", "val_mae"]);
  const rmseData = buildEpochRows(history, n, ["train_rmse", "val_rmse"]);
  const hasValMae = (history.val_mae?.length ?? 0) >= 1;
  const hasValRmse = (history.val_rmse?.length ?? 0) >= 1;
  return (
    <div className="db-dashboard-grid training-curves-pair">
      <div className="db-dashboard-cell">
        <div className="chart-wrapper settings-db-charts db-chart-card">
          <h4 className="db-chart-title">{label}: MAE convergence</h4>
          <p className="setting-desc">Mean absolute error on training data vs holdout (when validation is used).</p>
          <div className="db-training-chart-plot">
            <ResponsiveContainer width="100%" height="100%">
            <LineChart data={maeData} margin={commonMargin}>
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
                label={{ value: "MAE", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }}
              />
              <Tooltip {...tooltipTraining(TRAIN_STROKE)} />
              <Legend
                align="right"
                verticalAlign="top"
                wrapperStyle={{ fontSize: 12, color: "var(--text-subtle)", paddingLeft: 8 }}
              />
              <Line
                type="monotone"
                dataKey="train_mae"
                name="Train"
                stroke={TRAIN_STROKE}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              {hasValMae && (
                <Line
                  type="monotone"
                  dataKey="val_mae"
                  name="Validation"
                  stroke={VAL_STROKE}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="db-dashboard-cell">
        <div className="chart-wrapper settings-db-charts db-chart-card">
          <h4 className="db-chart-title">{label}: RMSE convergence</h4>
          <p className="setting-desc">Root mean square error on training data vs holdout.</p>
          <div className="db-training-chart-plot">
            <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rmseData} margin={commonMargin}>
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
                label={{ value: "RMSE", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }}
              />
              <Tooltip {...tooltipTraining(TRAIN_STROKE)} />
              <Legend
                align="right"
                verticalAlign="top"
                wrapperStyle={{ fontSize: 12, color: "var(--text-subtle)", paddingLeft: 8 }}
              />
              <Line
                type="monotone"
                dataKey="train_rmse"
                name="Train"
                stroke={TRAIN_STROKE}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              {hasValRmse && (
                <Line
                  type="monotone"
                  dataKey="val_rmse"
                  name="Validation"
                  stroke={VAL_STROKE}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TrainingEngineCurvesSection({
  activeEngineId,
  activeEngineLabel,
}: {
  /** Backend `active_model` — only this engine’s curves are shown. */
  activeEngineId: string;
  /** Short name for the active engine (e.g. Deep Hybrid for option2 / NCF). */
  activeEngineLabel: string;
}) {
  const [trainingState, setTrainingState] = useState<{
    loading: boolean;
    engines: TrainingEngineRow[];
  }>({ loading: true, engines: [] });

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8001/api";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/training-histories`);
        const data = res.ok
          ? ((await res.json()) as { engines?: TrainingEngineRow[] })
          : { engines: [] as TrainingEngineRow[] };
        if (!cancelled) {
          setTrainingState({ loading: false, engines: data.engines ?? [] });
        }
      } catch {
        if (!cancelled) {
          setTrainingState({ loading: false, engines: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [API_BASE]);

  const visibleEngines = useMemo(() => {
    if (!activeEngineId) return [];
    return trainingState.engines.filter((e) => e.id === activeEngineId);
  }, [trainingState.engines, activeEngineId]);

  return (
    <div className="setting-group" style={{ marginTop: 32 }}>
      <label>Training Curves</label>
      <p className="setting-desc">Per-epoch metrics for the engine selected above, from the last training run.</p>
      {trainingState.loading && (
        <div className="loading-state" style={{ marginTop: 12 }}>
          Loading training history…
        </div>
      )}
      {!trainingState.loading && visibleEngines.length === 0 && (
        <p className="setting-desc" style={{ marginTop: 8 }}>
          {!activeEngineId
            ? "No active model is selected."
            : trainingState.engines.length === 0
              ? "No multi-epoch training history on disk. Run the training script to create training_history.json for this engine, then refresh."
              : `No multi-epoch training history is available for ${activeEngineLabel} (${activeEngineId}). ` +
                "Train that model, or the closed-form SVD options may only expose a single-epoch history that is not shown here."}
        </p>
      )}
      {!trainingState.loading &&
        visibleEngines.map((eng) => (
          <EngineTrainingGrid key={eng.id} label={activeEngineLabel} history={eng.history} />
        ))}
    </div>
  );
}
