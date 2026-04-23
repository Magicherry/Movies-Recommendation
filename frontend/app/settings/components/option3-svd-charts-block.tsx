"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_LINE, AXIS_TICK } from "./training-engine-curves-block";

const tooltipBase = {
  contentStyle: {
    backgroundColor: "var(--chart-tooltip-bg)" as const,
    border: "var(--chart-tooltip-border)" as const,
    borderRadius: "var(--chart-tooltip-radius)" as const,
  },
};

const angledCategoryTick = { fill: "var(--text-subtle)" as const, fontSize: 11 as const };

export type Option3ErrorRow = { metric: string; train: number; test: number };
export type Option3EnergyRow = {
  component: string;
  energyPct: number;
  cumulativePct?: number;
};
export type Option3NormBin = { bin: string; count: number };
export type Option3CalWeight = { feature: string; absWeight: number };

function pairGridClassName(pair: boolean) {
  return `db-dashboard-grid training-curves-pair svd-option3-charts${pair ? "" : " training-curves-single"}`;
}

/**
 * SVD / option3 static fit diagnostics: same card + grid shell as training curves.
 */
export function Option3SvdChartsBlock({
  modelLabel,
  errorData,
  energyData,
  userNormData,
  itemNormData,
  calibrationData,
}: {
  /** Display name for the active option (e.g. SVD-Lasso) — same pattern as training line charts. */
  modelLabel: string;
  errorData: Option3ErrorRow[];
  energyData: Option3EnergyRow[];
  userNormData: Option3NormBin[];
  itemNormData: Option3NormBin[];
  calibrationData: Option3CalWeight[];
}) {
  const t = (title: string) => `${modelLabel}: ${title}`;
  const hasError = errorData.length > 0;
  const hasEnergy = energyData.length > 0;
  const hasUser = userNormData.length > 0;
  const hasItem = itemNormData.length > 0;
  const hasCalibration = calibrationData.length > 0;
  const hasAnyChart = hasError || hasEnergy || hasUser || hasItem || hasCalibration;

  return (
    <div className="setting-group option3-svd-charts-block" style={{ marginTop: 32 }}>
      <label>Training Curves</label>
      <p className="setting-desc">
        SVD is fit in one pass—no per-epoch line curves. Charts below (when data exists) show train vs holdout and
        component/diagnostic views.
      </p>

      <div className="option3-svd-charts-stack">
        {(hasError || hasEnergy) && (
          <div className={pairGridClassName(hasError && hasEnergy)}>
            {hasError && (
              <div className="db-dashboard-cell">
                <div className="chart-wrapper settings-db-charts db-chart-card">
                  <h4 className="db-chart-title">{t("Error comparison (train vs holdout)")}</h4>
                  <p className="setting-desc">In-sample training error vs test metrics (MAE, RMSE).</p>
                  <div className="db-svd-chart-plot">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={errorData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                        <XAxis dataKey="metric" axisLine={AXIS_LINE} tickLine={false} tick={AXIS_TICK} />
                        <YAxis axisLine={AXIS_LINE} tickLine={false} tick={AXIS_TICK} domain={[0, "auto"]} />
                        <Tooltip
                          {...tooltipBase}
                          formatter={(value) => (typeof value === "number" ? value.toFixed(4) : `${value ?? "-"}`)}
                        />
                        <Legend />
                        <Bar dataKey="train" name="Training (in-sample)" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                        <Bar dataKey="test" name="Holdout test" fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={48} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
            {hasEnergy && (
              <div className="db-dashboard-cell">
                <div className="chart-wrapper settings-db-charts db-chart-card">
                  <h4 className="db-chart-title">{t("SVD component energy share")}</h4>
                  <p className="setting-desc">Variance explained by each retained singular component.</p>
                  <div className="db-svd-chart-plot">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={energyData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                        <XAxis dataKey="component" axisLine={AXIS_LINE} tickLine={false} tick={AXIS_TICK} />
                        <YAxis
                          axisLine={AXIS_LINE}
                          tickLine={false}
                          tick={AXIS_TICK}
                          domain={[0, "auto"]}
                          tickFormatter={(value) => `${value}%`}
                        />
                        <Tooltip
                          {...tooltipBase}
                          formatter={(value) => (typeof value === "number" ? `${value.toFixed(2)}%` : `${value ?? "-"}`)}
                        />
                        <Legend />
                        <Bar dataKey="energyPct" name="Energy %" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {(hasUser || hasItem) && (
          <div className={pairGridClassName(hasUser && hasItem)}>
            {hasUser && (
              <div className="db-dashboard-cell">
                <div className="chart-wrapper settings-db-charts db-chart-card">
                  <h4 className="db-chart-title">{t("User latent norm distribution")}</h4>
                  <p className="setting-desc">Histogram of user factor vector norms (optional diagnostic).</p>
                  <div className="db-svd-chart-plot">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={userNormData} margin={{ top: 8, right: 16, left: 8, bottom: 32 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                        <XAxis
                          dataKey="bin"
                          axisLine={AXIS_LINE}
                          tickLine={false}
                          tick={angledCategoryTick}
                          angle={-25}
                          textAnchor="end"
                          height={56}
                        />
                        <YAxis axisLine={AXIS_LINE} tickLine={false} tick={AXIS_TICK} domain={[0, "auto"]} />
                        <Tooltip {...tooltipBase} />
                        <Legend />
                        <Bar dataKey="count" name="User count" fill="#14b8a6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
            {hasItem && (
              <div className="db-dashboard-cell">
                <div className="chart-wrapper settings-db-charts db-chart-card">
                  <h4 className="db-chart-title">{t("Item latent norm distribution")}</h4>
                  <p className="setting-desc">Histogram of item factor vector norms (optional diagnostic).</p>
                  <div className="db-svd-chart-plot">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={itemNormData} margin={{ top: 8, right: 16, left: 8, bottom: 32 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                        <XAxis
                          dataKey="bin"
                          axisLine={AXIS_LINE}
                          tickLine={false}
                          tick={angledCategoryTick}
                          angle={-25}
                          textAnchor="end"
                          height={56}
                        />
                        <YAxis axisLine={AXIS_LINE} tickLine={false} tick={AXIS_TICK} domain={[0, "auto"]} />
                        <Tooltip {...tooltipBase} />
                        <Legend />
                        <Bar dataKey="count" name="Item count" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {hasCalibration && (
          <div className="db-dashboard-grid training-curves-pair training-curves-single svd-option3-charts">
            <div className="db-dashboard-cell">
              <div className="chart-wrapper settings-db-charts db-chart-card">
                <h4 className="db-chart-title">{t("Top calibration weights (|w|)")}</h4>
                <p className="setting-desc">Largest-magnitude linear calibration terms when available.</p>
                <div className="db-svd-chart-plot db-svd-chart-plot--tall">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={calibrationData} margin={{ top: 8, right: 16, left: 8, bottom: 32 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                      <XAxis
                        dataKey="feature"
                        axisLine={AXIS_LINE}
                        tickLine={false}
                        tick={angledCategoryTick}
                        angle={-25}
                        textAnchor="end"
                        height={56}
                      />
                      <YAxis axisLine={AXIS_LINE} tickLine={false} tick={AXIS_TICK} domain={[0, "auto"]} />
                      <Tooltip
                        {...tooltipBase}
                        formatter={(value) => (typeof value === "number" ? value.toFixed(5) : `${value ?? "-"}`)}
                      />
                      <Legend />
                      <Bar dataKey="absWeight" name="|weight|" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {!hasAnyChart && (
          <p className="setting-desc" style={{ margin: 0, color: "var(--text-subtle)", fontStyle: "italic" }}>
            No charts yet (metrics or diagnostics missing). SVD has no per-epoch training file like MF/Deep Hybrid.
          </p>
        )}
      </div>
    </div>
  );
}
