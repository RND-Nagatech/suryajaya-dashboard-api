const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3301/api/v1";

async function requestJson(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    throw new Error(`Request gagal: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchJson(path) {
  return requestJson(path);
}

function withQuery(path, query = {}) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    params.set(key, String(value));
  });

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function sortByPrimaryMetric(items, key) {
  return [...(items || [])].sort((left, right) => {
    const rightValue = Number(right?.[key] || 0);
    const leftValue = Number(left?.[key] || 0);

    if (rightValue !== leftValue) {
      return rightValue - leftValue;
    }

    return String(left?.kode_lokasi || left?.kode_toko || "").localeCompare(
      String(right?.kode_lokasi || right?.kode_toko || "")
    );
  });
}

function normalizeOverview(payload) {
  const data = payload?.data || {};

  return {
    primaryMetrics: [
      {
        id: "grosir-netto",
        label: "Netto Grosir",
        value: Number(data.grosir_stock?.total_netto || 0),
        unit: "gr",
        tone: "lime"
      },
      {
        id: "transfer-pending",
        label: "Transfer Pending",
        value: Number(data.transfer_pending?.total_doc || 0),
        unit: "dok",
        tone: "amber"
      },
      {
        id: "transfer-received",
        label: "Transfer Diterima",
        value: Number(data.transfer_received?.total_doc || 0),
        unit: "dok",
        tone: "cyan"
      },
      {
        id: "keep-stock",
        label: "Keep Stock Real",
        value: Number(data.pusat_keep_stock?.total_berat_real || 0),
        unit: "gr",
        tone: "lime"
      },
      {
        id: "kom-stock",
        label: "KOM Stock",
        value: Number(data.kom_stock?.berat_bruto || 0),
        unit: "gr",
        tone: "glass"
      },
      {
        id: "brc-stock",
        label: "BRC Stock",
        value: Number(data.brc_stock?.berat_bruto || 0),
        unit: "gr",
        tone: "glass"
      }
    ],
    hero: {
      grosirQty: Number(data.grosir_stock?.total_qty || 0),
      grosirNetto: Number(data.grosir_stock?.total_netto || 0),
      pendingQty: Number(data.transfer_pending?.total_qty || 0),
      receivedQty: Number(data.transfer_received?.total_qty || 0),
      cabangGroups: Number(data.cabang_stock_grouped_count?.total_group || 0),
      keepRealQty: Number(data.pusat_keep_stock?.total_qty_real || 0)
    }
  };
}

function normalizeTransfers(pendingPayload, receivedPayload) {
  const pending = pendingPayload?.data || {};
  const received = receivedPayload?.data || {};
  const pendingDocs = Number(pending.total_doc || 0);
  const receivedDocs = Number(received.total_doc || 0);
  const totalDocs = pendingDocs + receivedDocs;
  const completion = totalDocs > 0 ? Math.round((receivedDocs / totalDocs) * 100) : 0;

  return {
    completion,
    pending: {
      docs: pendingDocs,
      qty: Number(pending.total_qty || 0),
      bruto: Number(pending.total_bruto || 0)
    },
    received: {
      docs: receivedDocs,
      qty: Number(received.total_qty || 0),
      bruto: Number(received.total_bruto || 0)
    },
    latestOutput: received.last_tanggal_output || pending.last_tanggal_output || null,
    trend: [...(pending.per_tanggal || []), ...(received.per_tanggal || [])]
      .slice(0, 6)
      .map((item) => ({
        label: item.tanggal,
        value: Number(item.total_qty || 0)
      }))
  };
}

function normalizeLocations(stockPayload) {
  const data = stockPayload?.data || {};
  const perLokasi = sortByPrimaryMetric(data.per_lokasi, "total_netto").slice(0, 6);

  return {
    totalRow: Number(data.total_row || 0),
    totalQty: Number(data.total_qty || 0),
    totalNetto: Number(data.total_netto || 0),
    groups: perLokasi.map((item) => ({
      id: item.kode_lokasi,
      name: item.kode_lokasi || "Tanpa lokasi",
      qty: Number(item.total_qty || 0),
      netto: Number(item.total_netto || 0),
      bruto: Number(item.total_bruto || 0)
    }))
  };
}

function normalizeKeepStock(payload) {
  const data = payload?.data || {};

  return {
    documents: Number(data.total_doc || 0),
    qtyReal: Number(data.total_qty_real || 0),
    weightReal: Number(data.total_berat_real || 0),
    timeline: (data.per_tanggal || []).slice(0, 5).map((item) => ({
      label: item.tanggal,
      qty: Number(item.total_qty_real || 0),
      weight: Number(item.total_berat_real || 0)
    }))
  };
}

function normalizeBucket(payload, label) {
  const data = payload?.data || {};
  const groups = sortByPrimaryMetric(data.per_baki, "total_berat_bruto").slice(0, 5);

  return {
    label,
    totalDoc: Number(data.total_doc || 0),
    totalStockOnHand: Number(data.total_stock_on_hand || 0),
    totalWeight: Number(data.total_berat_bruto || 0),
    groups: groups.map((item) => ({
      id: item.kode_toko,
      name: item.kode_toko || "Tanpa kode",
      stockOnHand: Number(item.total_stock_on_hand || 0),
      weight: Number(item.total_berat_bruto || 0)
    }))
  };
}

function normalizeCabang(payload) {
  const data = payload?.data || {};
  const groups = sortByPrimaryMetric(data.groups, "total_berat").slice(0, 5);

  return {
    totalGroup: Number(data.total_group || 0),
    totalDoc: Number(data.total_doc || 0),
    totalStockOnHand: Number(data.total_stock_on_hand || 0),
    totalWeight: Number(data.total_berat || 0),
    groups: groups.map((item) => ({
      id: item.kode_toko,
      name: item.kode_toko || "Tanpa toko",
      stockOnHand: Number(item.total_stock_on_hand || 0),
      weight: Number(item.total_berat || 0)
    }))
  };
}

export async function fetchDashboardBundle() {
  const [
    health,
    overview,
    grosirStocks,
    pendingTransfers,
    receivedTransfers,
    keepStocks,
    komStocks,
    brcStocks,
    cabangStocks
  ] = await Promise.all([
    fetchJson("/health"),
    fetchJson("/dashboard/overview"),
    fetchJson("/dashboard/grosir/stocks"),
    fetchJson("/dashboard/grosir-to-pusat/transfers?status=pending"),
    fetchJson("/dashboard/grosir-to-pusat/transfers?status=received"),
    fetchJson("/dashboard/pusat/keep-stocks"),
    fetchJson("/dashboard/pusat/kom-stocks"),
    fetchJson("/dashboard/pusat/brc-stocks"),
    fetchJson("/dashboard/pusat/cabang-stocks")
  ]);

  return {
    apiStatus: health?.ok ? "online" : "offline",
    overviewMetrics: normalizeOverview(overview),
    transferSummary: normalizeTransfers(pendingTransfers, receivedTransfers),
    locationGroups: normalizeLocations(grosirStocks),
    keepStock: normalizeKeepStock(keepStocks),
    bucketGroups: {
      kom: normalizeBucket(komStocks, "KOM"),
      brc: normalizeBucket(brcStocks, "BRC"),
      cabang: normalizeCabang(cabangStocks)
    }
  };
}

export async function fetchFocusBundle() {
  const [
    health,
    grosirStocks,
    keepStocks,
    komStocks,
    brcStocks,
    cabangStocks
  ] = await Promise.all([
    fetchJson("/health"),
    fetchJson("/dashboard/grosir/stocks?include_details=false"),
    fetchJson("/dashboard/pusat/keep-stocks?include_details=false"),
    fetchJson("/dashboard/pusat/kom-stocks?include_details=false"),
    fetchJson("/dashboard/pusat/brc-stocks?include_details=false"),
    fetchJson("/dashboard/pusat/cabang-stocks?include_details=false")
  ]);

  return {
    apiStatus: health?.ok ? "online" : "offline",
    locationGroups: normalizeLocations(grosirStocks),
    keepStock: normalizeKeepStock(keepStocks),
    bucketGroups: {
      kom: normalizeBucket(komStocks, "KOM"),
      brc: normalizeBucket(brcStocks, "BRC"),
      cabang: normalizeCabang(cabangStocks)
    }
  };
}

export async function fetchAgingState() {
  return requestJson("/dashboard/cabang/aging-stocks");
}

export async function fetchAgingSettings() {
  return requestJson("/dashboard/cabang/aging-stocks/settings");
}

export async function updateAgingSettings(payload) {
  return requestJson("/dashboard/cabang/aging-stocks/settings", {
    method: "PUT",
    body: payload
  });
}

export async function startAgingJob(params = {}) {
  return requestJson("/dashboard/cabang/aging-stocks/jobs", {
    method: "POST",
    body: params
  });
}

export async function fetchAgingJob(jobId) {
  return requestJson(`/dashboard/cabang/aging-stocks/jobs/${encodeURIComponent(jobId)}`);
}

export async function fetchAgingJobBranches(jobId, bucket, query = {}) {
  return requestJson(
    withQuery(
      `/dashboard/cabang/aging-stocks/jobs/${encodeURIComponent(jobId)}/buckets/${encodeURIComponent(bucket)}/branches`,
      query
    )
  );
}

export async function fetchAgingJobItems(jobId, bucket, kodeCabang, query = {}) {
  return requestJson(
    withQuery(
      `/dashboard/cabang/aging-stocks/jobs/${encodeURIComponent(jobId)}/buckets/${encodeURIComponent(bucket)}/branches/${encodeURIComponent(kodeCabang)}/items`,
      query
    )
  );
}
