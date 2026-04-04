"use client";

export const ACTIVE_MODEL_STORAGE_KEY = "streamx-active-model";
export const ACTIVE_MODEL_LOAD_STATUS_STORAGE_KEY = "streamx-active-model-load-status";

export type ModelLoadStatus = "idle" | "loading" | "ready" | "error";

type ModelStateLike = {
  active_model: string;
  active_model_load_status?: string;
  active_model_ready?: boolean;
};

export const SHORT_MODEL_LABELS: Record<string, string> = {
  option1: "MF-SGD",
  option2: "NCF",
  option3_ridge: "SVD-Ridge",
  option3_lasso: "SVD-Lasso",
  option4: "MF-ALS",
};

export const LONG_MODEL_LABELS: Record<string, string> = {
  option1: "Matrix Factorization",
  option2: "Deep Neural CF",
  option3_ridge: "Matrix SVD + Ridge",
  option3_lasso: "Matrix SVD + Lasso",
  option4: "MF-ALS Matrix Factorization",
};

export function getShortModelLabel(modelName: string | null | undefined): string {
  if (!modelName) return "Demo";
  return SHORT_MODEL_LABELS[modelName] ?? modelName;
}

export function getLongModelLabel(modelName: string | null | undefined): string {
  if (!modelName) return "the active model";
  return LONG_MODEL_LABELS[modelName] ?? modelName;
}

export function readStoredActiveModel(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_MODEL_STORAGE_KEY);
}

export function readStoredModelLoadStatus(): ModelLoadStatus | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(ACTIVE_MODEL_LOAD_STATUS_STORAGE_KEY);
  if (raw === "idle" || raw === "loading" || raw === "ready" || raw === "error") {
    return raw;
  }
  return null;
}

export function storeActiveModel(modelName: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_MODEL_STORAGE_KEY, modelName);
}

export function storeModelLoadStatus(status: ModelLoadStatus): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_MODEL_LOAD_STATUS_STORAGE_KEY, status);
}

export function storeModelState(state: ModelStateLike): void {
  if (!state.active_model) return;
  storeActiveModel(state.active_model);
  const status =
    state.active_model_ready
      ? "ready"
      : state.active_model_load_status === "loading" || state.active_model_load_status === "error"
        ? state.active_model_load_status
        : "idle";
  storeModelLoadStatus(status);
}

export function dispatchActiveModelChange(
  modelName: string,
  options?: { loadStatus?: ModelLoadStatus; ready?: boolean }
): void {
  if (typeof window === "undefined") return;
  const loadStatus = options?.ready ? "ready" : options?.loadStatus;
  storeActiveModel(modelName);
  if (loadStatus) {
    storeModelLoadStatus(loadStatus);
  }
  window.dispatchEvent(
    new CustomEvent("streamx-engine-changed", {
      detail: { activeModel: modelName, loadStatus: loadStatus ?? readStoredModelLoadStatus() },
    })
  );
}

export function getActiveModelFromEvent(event: Event): string | null {
  const maybeCustomEvent = event as CustomEvent<{ activeModel?: string }>;
  const activeModel = maybeCustomEvent.detail?.activeModel;
  if (typeof activeModel === "string" && activeModel.trim()) {
    return activeModel;
  }
  return null;
}

export function getModelLoadStatusFromEvent(event: Event): ModelLoadStatus | null {
  const maybeCustomEvent = event as CustomEvent<{ loadStatus?: string }>;
  const loadStatus = maybeCustomEvent.detail?.loadStatus;
  if (loadStatus === "idle" || loadStatus === "loading" || loadStatus === "ready" || loadStatus === "error") {
    return loadStatus;
  }
  return null;
}
