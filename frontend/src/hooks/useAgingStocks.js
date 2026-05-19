import { useEffect, useRef, useState } from "react";
import {
  fetchAgingJob,
  fetchAgingJobBranches,
  fetchAgingJobItems,
  fetchAgingState,
  startAgingJob,
  updateAgingSettings
} from "../lib/api";

function isActiveJob(status) {
  return status === "running" || status === "queued";
}

const BRANCH_PAGE_SIZE = 8;
const ITEM_PAGE_SIZE = 8;
const AGING_JOB_POLL_INTERVAL_MS = 2000;

export function useAgingStocks(enabled, itemGroupFilter = "") {
  const [settings, setSettings] = useState(null);
  const [latestJob, setLatestJob] = useState(null);
  const [branches, setBranches] = useState([]);
  const [items, setItems] = useState([]);
  const [deptBreakdown, setDeptBreakdown] = useState([]);
  const [branchPagination, setBranchPagination] = useState(null);
  const [itemPagination, setItemPagination] = useState(null);
  const [selectedBucketKey, setSelectedBucketKey] = useState("");
  const [selectedBranchCode, setSelectedBranchCode] = useState("");
  const [selectedBranchDbName, setSelectedBranchDbName] = useState("");
  const [branchSearch, setBranchSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [branchPage, setBranchPage] = useState(1);
  const [itemPage, setItemPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [branchLoading, setBranchLoading] = useState(false);
  const [itemLoading, setItemLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSynced, setLastSynced] = useState(null);
  const branchRequestRef = useRef(0);
  const itemRequestRef = useRef(0);
  const [debouncedBranchSearch, setDebouncedBranchSearch] = useState("");
  const [debouncedItemSearch, setDebouncedItemSearch] = useState("");

  const syncJobState = (job) => {
    setLatestJob(job || null);

    const nextBucket = job?.buckets?.find((bucket) => bucket.key === selectedBucketKey)?.key
      || job?.buckets?.[0]?.key
      || "";

    if (!selectedBucketKey || !job?.buckets?.some((bucket) => bucket.key === selectedBucketKey)) {
      setSelectedBucketKey(nextBucket);
    }

    if (!job?.buckets?.length) {
      setSelectedBranchCode("");
      setSelectedBranchDbName("");
      setBranchSearch("");
      setItemSearch("");
      setBranches([]);
      setItems([]);
      setDeptBreakdown([]);
      setBranchPagination(null);
      setItemPagination(null);
      setBranchPage(1);
      setItemPage(1);
    }
  };

  const loadJobState = async (jobId) => {
    if (!jobId) {
      return null;
    }

    setIsRefreshing(true);
    try {
      const response = await fetchAgingJob(jobId);
      const job = response?.data || null;
      syncJobState(job);
      setLastSynced(new Date().toISOString());
      setError("");
      return job;
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadBranches = async (jobId, bucketKey, page = 1, fallbackBranchCode = "", search = "") => {
    if (!jobId || !bucketKey) {
      return;
    }

    const requestId = ++branchRequestRef.current;
    setBranchLoading(true);
    try {
      const response = await fetchAgingJobBranches(jobId, bucketKey, {
        search: search || undefined,
        page,
        limit: BRANCH_PAGE_SIZE
      });
      if (requestId !== branchRequestRef.current) {
        return;
      }

      const nextBranches = response?.data?.branches || [];
      const nextPagination = response?.data?.pagination || null;
      setBranches(nextBranches);
      setBranchPagination(nextPagination);

      const matchedBranch = nextBranches.find(
        (branch) =>
          branch.kode_cabang === selectedBranchCode &&
          branch.db_name === selectedBranchDbName
      );

      // Do not auto-select first branch on initial load. Keep selection empty
      // until user explicitly picks a branch.
      if (matchedBranch) {
        setSelectedBranchCode(matchedBranch.kode_cabang || "");
        setSelectedBranchDbName(matchedBranch.db_name || "");
      } else if (fallbackBranchCode) {
        setSelectedBranchCode(fallbackBranchCode);
      } else {
        setSelectedBranchCode("");
        setSelectedBranchDbName("");
      }
      setError("");
    } finally {
      if (requestId === branchRequestRef.current) {
        setBranchLoading(false);
      }
    }
  };

  const loadItems = async (jobId, bucketKey, branchCode, branchDbName, page = 1, search = "") => {
    if (!jobId || !bucketKey || !branchCode) {
      setItems([]);
      setDeptBreakdown([]);
      setItemPagination(null);
      return;
    }

    const requestId = ++itemRequestRef.current;
    setItemLoading(true);
    try {
      const response = await fetchAgingJobItems(jobId, bucketKey, branchCode, {
        db_name: branchDbName || undefined,
        search: search || undefined,
        page,
        limit: ITEM_PAGE_SIZE,
        kode_group: itemGroupFilter || undefined
      });
      if (requestId !== itemRequestRef.current) {
        return;
      }

      setItems(response?.data?.items || []);
      setDeptBreakdown(response?.data?.summary_by_dept || []);
      setItemPagination(response?.data?.pagination || null);
      setError("");
    } finally {
      if (requestId === itemRequestRef.current) {
        setItemLoading(false);
      }
    }
  };

  const startJob = async (params = {}) => {
    setIsStarting(true);
    try {
      const response = await startAgingJob(params);
      const jobId = response?.data?.job_id;
      if (jobId) {
        await loadJobState(jobId);
      }
      return jobId;
    } finally {
      setIsStarting(false);
    }
  };

  const refreshJob = async () => {
    if (latestJob?.job_id && isActiveJob(latestJob.status)) {
      return loadJobState(latestJob.job_id);
    }

    return startJob();
  };

  const saveSettings = async ({ buckets, excludedDatabases, resetAfterSave = false } = {}) => {
    setIsSaving(true);
    try {
      const payload = {};
      if (Array.isArray(buckets)) {
        payload.buckets = buckets;
      }
      if (Array.isArray(excludedDatabases)) {
        payload.excluded_databases = excludedDatabases;
      }

      const response = await updateAgingSettings(payload);
      setSettings(response?.data || null);
      if (resetAfterSave) {
        setLatestJob(null);
        setBranches([]);
        setItems([]);
        setDeptBreakdown([]);
        setBranchPagination(null);
        setItemPagination(null);
        setSelectedBucketKey("");
        setSelectedBranchCode("");
        setSelectedBranchDbName("");
        setBranchSearch("");
        setItemSearch("");
        setBranchPage(1);
        setItemPage(1);
      }
      setLastSynced(new Date().toISOString());
      return response?.data || null;
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      setLoading(true);
      try {
        const response = await fetchAgingState();
        if (cancelled) {
          return;
        }

        const nextSettings = response?.data?.settings || null;
        const nextJob = response?.data?.latest_job || null;

        setSettings(nextSettings);

        if (nextJob) {
          syncJobState(nextJob);
          setLastSynced(new Date().toISOString());
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Gagal memuat aging stocks");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !latestJob?.job_id || !selectedBucketKey) {
      return;
    }

    setBranchPage(1);
    setItemPage(1);
    setSelectedBranchCode("");
    setSelectedBranchDbName("");
    setBranchSearch("");
    setItemSearch("");
    setBranches([]);
    setItems([]);
    setDeptBreakdown([]);
    setBranchPagination(null);
    setItemPagination(null);
  }, [enabled, latestJob?.job_id, selectedBucketKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedBranchSearch(branchSearch.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [branchSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedItemSearch(itemSearch.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [itemSearch]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setBranchPage(1);
  }, [enabled, debouncedBranchSearch, selectedBucketKey]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setItemPage(1);
  }, [enabled, debouncedItemSearch, selectedBranchCode, selectedBranchDbName]);

  useEffect(() => {
    if (!enabled || !latestJob?.job_id || !selectedBucketKey) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        await loadBranches(
          latestJob.job_id,
          selectedBucketKey,
          branchPage,
          selectedBranchCode,
          debouncedBranchSearch
        );
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Gagal memuat cabang aging");
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [enabled, latestJob?.job_id, selectedBucketKey, branchPage, debouncedBranchSearch, selectedBranchCode, selectedBranchDbName]);

  useEffect(() => {
    if (!enabled || !latestJob?.job_id || !selectedBucketKey) {
      return;
    }

    setItemPage(1);
    setItems([]);
    setDeptBreakdown([]);
    setItemPagination(null);
  }, [enabled, latestJob?.job_id, selectedBucketKey, selectedBranchCode]);

  useEffect(() => {
    if (!enabled || !latestJob?.job_id || !isActiveJob(latestJob.status)) {
      return;
    }

    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const refreshed = await loadJobState(latestJob.job_id);
        if (cancelled) {
          return;
        }

        if (isActiveJob(refreshed?.status)) {
          timer = window.setTimeout(poll, AGING_JOB_POLL_INTERVAL_MS);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Gagal memantau progres aging");
          timer = window.setTimeout(poll, AGING_JOB_POLL_INTERVAL_MS);
        }
      }
    };

    timer = window.setTimeout(poll, AGING_JOB_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [enabled, latestJob?.job_id, latestJob?.status]);

  useEffect(() => {
    if (!enabled || !latestJob?.job_id || !selectedBucketKey || !selectedBranchCode) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        await loadItems(
          latestJob.job_id,
          selectedBucketKey,
          selectedBranchCode,
          selectedBranchDbName,
          itemPage,
          debouncedItemSearch
        );
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Gagal memuat item aging");
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [enabled, latestJob?.job_id, selectedBucketKey, selectedBranchCode, selectedBranchDbName, itemPage, debouncedItemSearch, itemGroupFilter]);

  return {
    settings,
    latestJob,
    selectedBucketKey,
    selectedBranchCode,
    selectedBranchDbName,
    branchSearch,
    itemSearch,
    branches,
    items,
    deptBreakdown,
    branchPagination,
    itemPagination,
    branchPage,
    itemPage,
    branchPageSize: BRANCH_PAGE_SIZE,
    itemPageSize: ITEM_PAGE_SIZE,
    loading,
    error,
    isRefreshing,
    isStarting,
    isSaving,
    branchLoading,
    itemLoading,
    lastSynced,
    setSelectedBucketKey,
    setSelectedBranchCode,
    setSelectedBranchDbName,
    setBranchSearch,
    setItemSearch,
    setBranchPage,
    setItemPage,
    refreshJob,
    startJob,
    saveSettings
  };
}
