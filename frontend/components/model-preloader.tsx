"use client";

import { useEffect, useRef } from "react";
import { preloadActiveModel } from "../lib/api";
import {
  dispatchActiveModelChange,
  getActiveModelFromEvent,
  getModelLoadStatusFromEvent,
  readStoredActiveModel,
  readStoredModelLoadStatus,
} from "../lib/model-engine";

const preloadedModels = new Set<string>();

function scheduleIdle(work: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const win = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof win.requestIdleCallback === "function" && typeof win.cancelIdleCallback === "function") {
    const idleId = win.requestIdleCallback(work, { timeout: 1200 });
    return () => win.cancelIdleCallback!(idleId);
  }

  const timeoutId = setTimeout(work, 120);
  return () => clearTimeout(timeoutId);
}

export default function ModelPreloader() {
  const inFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cancelScheduled = () => {};

    const runPreload = async () => {
      if (cancelled || inFlightRef.current) return;

      const storedModel = readStoredActiveModel();
      const storedStatus = readStoredModelLoadStatus();
      if (storedModel && storedStatus === "ready" && preloadedModels.has(storedModel)) {
        return;
      }

      const task = preloadActiveModel()
        .then((payload) => {
          if (cancelled) return;
          const activeModel = payload.active_model || storedModel;
          if (!activeModel) return;

          if (payload.active_model_ready) {
            preloadedModels.add(activeModel);
            dispatchActiveModelChange(activeModel, { ready: true });
            return;
          }

          dispatchActiveModelChange(activeModel, { loadStatus: "error" });
        })
        .catch(() => {
          if (cancelled) return;
          const activeModel = readStoredActiveModel();
          if (activeModel) {
            dispatchActiveModelChange(activeModel, { loadStatus: "error" });
          }
        })
        .finally(() => {
          inFlightRef.current = null;
        });

      inFlightRef.current = task;
      await task;
    };

    const schedulePreload = () => {
      cancelScheduled();
      cancelScheduled = scheduleIdle(() => {
        void runPreload();
      });
    };

    const handleEngineChanged = (event: Event) => {
      const modelName = getActiveModelFromEvent(event) ?? readStoredActiveModel();
      const loadStatus = getModelLoadStatusFromEvent(event);

      if (modelName && loadStatus === "ready") {
        preloadedModels.add(modelName);
        return;
      }

      if (loadStatus === "loading" || loadStatus === "idle" || loadStatus === null) {
        schedulePreload();
      }
    };

    const handleFocus = () => {
      const modelName = readStoredActiveModel();
      const loadStatus = readStoredModelLoadStatus();
      if (!modelName || loadStatus === "ready") return;
      schedulePreload();
    };

    schedulePreload();
    window.addEventListener("streamx-engine-changed", handleEngineChanged);
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      cancelScheduled();
      window.removeEventListener("streamx-engine-changed", handleEngineChanged);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return null;
}
