import { startTransition, useEffect, useRef, useState } from "react";
import { fetchDashboardBundle, fetchFocusBundle } from "../lib/api";

const DEFAULT_REFRESH_INTERVAL = Number(import.meta.env.VITE_REFRESH_INTERVAL_MS || 45000);

export function useDashboardData(activePage) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [stale, setStale] = useState(false);
  const lastSuccessRef = useRef(0);
  const hasDashboardDataRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const loadData = async (mode = "refresh") => {
      if (!mounted) {
        return;
      }

      if (mode === "initial") {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const shouldLoadDashboard = activePage === "dashboard";
        const payload = shouldLoadDashboard ? await fetchDashboardBundle() : await fetchFocusBundle();
        if (!mounted) {
          return;
        }

        startTransition(() => {
          setData((current) => ({
            ...(current || {}),
            ...payload
          }));
          setError("");
          setStale(false);
          const now = new Date().toISOString();
          setLastUpdated(now);
          lastSuccessRef.current = Date.now();
          if (shouldLoadDashboard) {
            hasDashboardDataRef.current = true;
          }
        });
      } catch (requestError) {
        if (!mounted) {
          return;
        }

        setError(requestError.message || "Gagal memuat dashboard");
        const staleThreshold = DEFAULT_REFRESH_INTERVAL * 2;
        setStale(Boolean(lastSuccessRef.current) && Date.now() - lastSuccessRef.current > staleThreshold);
      } finally {
        if (!mounted) {
          return;
        }

        setLoading(false);
        setIsRefreshing(false);
      }
    };

    const initialMode = !data || (activePage === "dashboard" && !hasDashboardDataRef.current) ? "initial" : "refresh";
    loadData(initialMode);
    const refreshInterval = window.setInterval(() => loadData("refresh"), DEFAULT_REFRESH_INTERVAL);
    const staleInterval = window.setInterval(() => {
      if (!lastSuccessRef.current) {
        return;
      }

      setStale(Date.now() - lastSuccessRef.current > DEFAULT_REFRESH_INTERVAL * 2);
    }, 5000);

    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
      window.clearInterval(staleInterval);
    };
  }, [activePage]);

  return {
    data,
    error,
    loading,
    isRefreshing,
    lastUpdated,
    stale
  };
}
