import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Settings, X, ChevronLeft, ChevronRight, Eye, EyeOff, LogOut, Maximize2, Minimize2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { GlassCard } from "./components/GlassCard";
import { AgingPage } from "./components/AgingPage";
import { useDashboardData } from "./hooks/useDashboardData";
import { Encryptor } from "./lib/encryptor";
import { clearToken, createUser, deleteUser, fetchAgingSettings, fetchBrcStockItems, fetchCabangStockItems, fetchExcludeGroupSettings, fetchGroups, fetchKomStockItems, fetchLabelSettings, fetchMe, fetchUsers, loginApi, updateAgingSettings, updateExcludeGroupSettings, updateLabelSettings, updateUser, verifySuperuserPassword } from "./lib/api";
import {
  formatClock,
  formatInteger,
  formatMetric,
  formatRelativeFreshness,
  formatTimestamp
} from "./lib/formatters";

const PAGE_TABS = [
  { id: "focus", label: "Page 1" },
  { id: "dashboard", label: "Page 2" },
  { id: "settings", label: "Page 3" }
];
const FOCUS_POINTS = [
  {
    id: 1,
    label: "Grosir",
    valueKey: "grosir",
    pointStyle: { left: "77.5%", top: "21%" },
    cardStyle: { left: "79.9%", top: "14.8%" }
  },
  {
    id: 2,
    label: "Keep Stocks",
    valueKey: "keepStocks",
    pointStyle: { left: "63.5%", top: "58.5%" },
    cardStyle: { left: "66.3%", top: "61.8%" }
  },
  {
    id: 3,
    label: "KOM Stocks",
    valueKey: "kom",
    pointStyle: { left: "49.2%", top: "39%" },
    cardStyle: { left: "52.1%", top: "21.5%" }
  },
  {
    id: 4,
    label: "BRC Stocks",
    valueKey: "brc",
    pointStyle: { left: "35.8%", top: "24.4%" },
    cardStyle: { left: "20.6%", top: "7.8%" }
  },
  {
    id: 5,
    label: "Cabang Stocks",
    valueKey: "cabang",
    pointStyle: { left: "15.5%", top: "54%" },
    cardStyle: { left: "6.9%", top: "60.4%" }
  }
];

function useCommandClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}
  


function StatusPill({ children, tone = "default" }) {
  return <span className={`status-pill tone-${tone}`}>{children}</span>;
}

function GlowBadge({ label, value, tone = "glass" }) {
  return (
    <div className={`glow-badge tone-${tone}`}>
      {label && <span>{label}</span>}
      <strong>{value}</strong>
    </div>
  );
}

function FocusTopStatusBar({ apiStatus, stale, error, lastUpdated }) {
  return (
    <div className="focus-top-status">
      <div className="focus-top-pills">
        <StatusPill tone={apiStatus === "online" ? "lime" : "amber"}>
          API {apiStatus === "online" ? "Online" : "Offline"}
        </StatusPill>
        <StatusPill tone={stale ? "amber" : "glass"}>
          {stale ? "Data Stale" : "Data Fresh"}
        </StatusPill>
        <StatusPill tone={error ? "amber" : "glass"}>
          {error ? "Mode Proteksi" : "Auto Refresh"}
        </StatusPill>
      </div>
      <div className="focus-top-meta">
        <span>{error || "Monitoring grosir, transfer, dan stok pusat aktif."}</span>
        <strong>Sync {formatTimestamp(lastUpdated)}</strong>
      </div>
    </div>
  );
}

function PageTabs({ activePage, onChange }) {
  return (
    <div className="page-tabs" aria-label="Dashboard pages">
      {PAGE_TABS.map((page) => (
        <button
          key={page.id}
          type="button"
          className={`page-tab ${activePage === page.id ? "is-active" : ""}`}
          onClick={() => onChange(page.id)}
        >
          {page.label}
        </button>
      ))}
    </div>
  );
}

function FocusMetricCard({ point, metric, onClick }) {
  return (
    <GlassCard className={`focus-value-card ${onClick ? "is-clickable" : ""}`} tone="default">
      <button
        type="button"
        className="focus-card-trigger"
        onClick={onClick}
        aria-label={`Detail ${point.label}`}
      >
        <div className="focus-card-topline">
          <p>{point.label}</p>
        </div>
        <strong>{metric.value}</strong>
        <small>{metric.meta}</small>
      </button>
    </GlassCard>
  );
}

function FocusPage({ backgroundAsset, locations, keepStock, buckets, labels, onCardClick }) {
  const resolvedPoints = FOCUS_POINTS.map((point) => ({
    ...point,
    label: labels?.[point.valueKey] || point.label
  }));

  const focusMetrics = {
    grosir: {
      value: formatMetric(locations?.totalNetto || 0, "gr"),
      meta: `${formatInteger(locations?.totalRow || 0)} row summary`
    },
    keepStocks: {
      value: formatMetric(keepStock?.weightReal || 0, "gr"),
      meta: `${formatMetric(keepStock?.qtyReal || 0, "qty")}`
    },
    kom: {
      value: formatMetric(buckets?.kom?.totalWeight || 0, "gr"),
      meta: `${formatInteger(buckets?.kom?.totalStockOnHand || 0)} stock on hand`
    },
    brc: {
      value: formatMetric(buckets?.brc?.totalWeight || 0, "gr"),
      meta: `${formatInteger(buckets?.brc?.totalStockOnHand || 0)} stock on hand`
    },
    cabang: {
      value: formatMetric(buckets?.cabang?.totalWeight || 0, "gr"),
      meta: `${formatInteger(buckets?.cabang?.totalStockOnHand || 0)} stock on hand`
    }
  };

  return (
    <section className="focus-screen">
      <div className="visual-background focus-background focus-reference-layout">
        <div className="focus-visual-core">
          {backgroundAsset ? (
            <img src={backgroundAsset} alt="Isometric warehouse layout" className="focus-hero-image" />
          ) : (
            <div className="fallback-warehouse focus-fallback" aria-hidden="true">
              <span className="block block-a" />
              <span className="block block-b" />
              <span className="block block-c" />
              <span className="block block-d" />
              <span className="block block-e" />
            </div>
          )}
        </div>

        {resolvedPoints.map((point) => (
          <div key={point.id}>
            <button
              type="button"
              className={`focus-pin focus-pin-${point.id}`}
              style={point.pointStyle}
              aria-label={point.label}
            />
            <div className="focus-card-wrap" style={point.cardStyle}>
              <FocusMetricCard
                point={point}
                metric={focusMetrics[point.valueKey]}
                onClick={onCardClick ? () => onCardClick(point.valueKey) : undefined}
              />
            </div>
          </div>
        ))}

      </div>
    </section>
  );
}

function LabelSettingsDialog({ labels, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...labels }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      await onSave({ labels: draft });
      onClose();
    } catch (err) {
      setError(err.message || "Gagal menyimpan label");
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: "grosir", defaultLabel: "Grosir" },
    { key: "keepStocks", defaultLabel: "Keep Stocks" },
    { key: "kom", defaultLabel: "KOM Stocks" },
    { key: "brc", defaultLabel: "BRC Stocks" },
    { key: "cabang", defaultLabel: "Cabang Stocks" }
  ];

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel label-settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Pengaturan Label</h2>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Tutup dialog">
            <X size={18} />
          </button>
        </div>

        <div className="dialog-body">
          {fields.map((field) => (
            <label key={field.key} className="label-field">
              <span className="label-field-key">{field.defaultLabel}</span>
              <input
                type="text"
                className="label-field-input"
                value={draft[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.defaultLabel}
              />
            </label>
          ))}
        </div>

        {error && <p className="dialog-error">{error}</p>}

        <div className="dialog-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

const encryptor = new Encryptor();

const CHART_COLORS = [
  "#22c55e", "#84cc16", "#facc15", "#fb923c", "#ef4444",
  "#06b6d4", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"
];

const ITEM_FETCHERS = {
  brc: fetchBrcStockItems,
  kom: fetchKomStockItems,
  cabang: fetchCabangStockItems
};

function StockDetailSheet({ sheetKey, label, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const searchRef = useRef("");
  const pageRef = useRef(1);

  const fetchFn = ITEM_FETCHERS[sheetKey] || ITEM_FETCHERS.brc;

  const loadData = useCallback(async (queryPage, querySearch) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchFn({ page: queryPage, limit: 10, search: querySearch });
      setData(res?.data || null);
    } catch (err) {
      setError(err.message || "Gagal memuat detail");
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    loadData(1, "");
  }, [loadData]);

  const handleSearch = () => {
    const q = search.trim();
    searchRef.current = q;
    pageRef.current = 1;
    setPage(1);
    loadData(1, q);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > (data?.pagination?.total_pages || 1)) return;
    pageRef.current = newPage;
    setPage(newPage);
    loadData(newPage, searchRef.current);
  };

  const pagination = data?.pagination || {};
  const items = data?.items || [];
  const perBaki = data?.per_baki || [];
  const topBaki = perBaki.slice(0, 10);
  const weightField = sheetKey === "cabang" ? "total_berat" : "total_berat_bruto";
  const totalBerat = data?.[weightField] || 0;

  return (
    <div className="detail-sheet-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="detail-sheet-handle" />

        <div className="detail-sheet-header">
          <div className="detail-sheet-title">
            <h2>{label}</h2>
            {data && (
              <div className="detail-sheet-summary">
                <span>{formatInteger(data.total_doc)} dokumen</span>
                <span>{formatMetric(totalBerat, "gr")}</span>
              </div>
            )}
          </div>
          <button type="button" className="detail-sheet-close" onClick={onClose} aria-label="Tutup">
            <X size={20} />
          </button>
        </div>

        <div className="detail-sheet-body">
          {loading && !data && (
            <div className="detail-sheet-loading">Memuat data...</div>
          )}

          {error && (
            <div className="detail-sheet-error">{error}</div>
          )}

          {data && (
            <div className="detail-two-col">
              <div className="detail-col-chart">
                <span className="detail-col-hint">Menampilkan 10 baki dengan berat teratas</span>

                {topBaki.length > 0 && (
                  <>
                    <div className="donut-wrapper detail-donut-wrap">
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={topBaki.map((b) => ({ name: b.kode_toko, value: b[weightField] || 0, total_doc: b.total_doc }))}
                            dataKey="value"
                            innerRadius={62}
                            outerRadius={100}
                            paddingAngle={3}
                            cornerRadius={6}
                            stroke="rgba(255,255,255,0.92)"
                            strokeWidth={1}
                          >
                            {topBaki.map((entry, index) => (
                              <Cell key={entry.kode_toko || index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="donut-center">
                        <strong>{formatMetric(totalBerat, "gr")}</strong>
                        <small>{topBaki.length} baki</small>
                      </div>
                    </div>

                    <div className="detail-legend-list">
                      {topBaki.map((baki, index) => {
                        const bakiWeight = baki[weightField] || 0;
                        const share = totalBerat > 0 ? (bakiWeight / totalBerat) * 100 : 0;
                        return (
                          <div key={baki.kode_toko} className="detail-legend-row">
                            <span
                              className="detail-legend-dot"
                              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                            />
                            <div className="detail-legend-copy">
                              <strong>{baki.kode_toko}</strong>
                              <small>{baki.total_doc} dok</small>
                            </div>
                            <span className="detail-legend-share">{share.toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {topBaki.length === 0 && (
                  <div className="detail-empty">Belum ada data baki.</div>
                )}
              </div>

              <div className="detail-col-list">
                <div className="detail-search-row">
                  <div className="detail-search-input-wrap">
                    <Search size={14} className="detail-search-icon" />
                    <input
                      type="text"
                      className="detail-search-input"
                      placeholder="Cari barcode, nama, baki..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                    />
                  </div>
                  <button type="button" className="btn-secondary btn-sm" onClick={handleSearch}>
                    Cari
                  </button>
                </div>

                {items.length === 0 ? (
                  <div className="detail-empty">Tidak ada item ditemukan.</div>
                ) : (
                  <div className="detail-item-list">
                    {items.map((item, index) => (
                      <div key={item.kode_barcode || index} className="detail-item-row">
                        <div className="detail-item-main">
                          <strong className="detail-item-barcode">{item.kode_barcode || "-"}</strong>
                          {item.nama_barang && <span className="detail-item-name">{encryptor.doDecrypt(item.nama_barang).toUpperCase()}</span>}
                          <div className="detail-item-meta-row">
                            <small>Baki: {item.kode_baki || "-"}</small>
                            <small>Dept: {item.kode_dept || "-"}</small>
                            <small>Group: {item.kode_group || "-"}</small>
                            {item.tgl_last_beli && <small>Last Beli: {item.tgl_last_beli}</small>}
                          </div>
                        </div>
                        <div className="detail-item-values">
                          <strong>{formatMetric(sheetKey === "cabang" ? item.berat : item.berat_bruto, "gr")}</strong>
                          <small>SOH: {item.stock_on_hand}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {pagination.total_pages > 1 && (
                  <div className="detail-pager">
                    <span className="detail-pager-info">
                      {pagination.total} item &middot; Halaman {pagination.page} dari {pagination.total_pages}
                    </span>
                    <div className="detail-pager-controls">
                      <button
                        type="button"
                        className="detail-pager-btn"
                        disabled={pagination.page <= 1}
                        onClick={() => handlePageChange(page - 1)}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        type="button"
                        className="detail-pager-btn"
                        disabled={!pagination.has_more}
                        onClick={() => handlePageChange(page + 1)}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsPage() {
  const [labelDraft, setLabelDraft] = useState({ grosir: "", keepStocks: "", kom: "", brc: "", cabang: "" });
  const [bucketDraft, setBucketDraft] = useState([]);
  const [labelSaving, setLabelSaving] = useState(false);
  const [bucketSaving, setBucketSaving] = useState(false);
  const [labelError, setLabelError] = useState("");
  const [bucketError, setBucketError] = useState("");
  const [labelDone, setLabelDone] = useState(false);
  const [bucketDone, setBucketDone] = useState(false);
  const [excludedDraft, setExcludedDraft] = useState([]);
  const [availableDatabases, setAvailableDatabases] = useState([]);
  const [excludeSaving, setExcludeSaving] = useState(false);
  const [excludeDone, setExcludeDone] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [userFormMode, setUserFormMode] = useState("add");
  const [userFormUsername, setUserFormUsername] = useState("");
  const [userFormPassword, setUserFormPassword] = useState("");
  const [userFormLevel, setUserFormLevel] = useState("operator");
  const [userFormError, setUserFormError] = useState("");
  const [userFormSaving, setUserFormSaving] = useState(false);
  const [userDeleteConfirm, setUserDeleteConfirm] = useState(null);
  const [groupList, setGroupList] = useState([]);
  const [excludedGroupDraft, setExcludedGroupDraft] = useState([]);
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupDone, setGroupDone] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);

  const labelFields = [
    { key: "grosir", defaultLabel: "Grosir" },
    { key: "keepStocks", defaultLabel: "Keep Stocks" },
    { key: "kom", defaultLabel: "KOM Stocks" },
    { key: "brc", defaultLabel: "BRC Stocks" },
    { key: "cabang", defaultLabel: "Cabang Stocks" }
  ];

  useEffect(() => {
    let cancelled = false;
    setSettingsLoading(true);

    Promise.all([
      fetchLabelSettings().catch(() => null),
      fetchAgingSettings().catch(() => null),
      fetchUsers().catch(() => null),
      fetchGroups().catch(() => null),
      fetchExcludeGroupSettings().catch(() => null)
    ]).then(([labelRes, agingRes, usersRes, groupsRes, excludeGroupsRes]) => {
      if (cancelled) return;
      const labels = labelRes?.data?.labels || {};
      setLabelDraft({
        grosir: labels.grosir || "",
        keepStocks: labels.keepStocks || "",
        kom: labels.kom || "",
        brc: labels.brc || "",
        cabang: labels.cabang || ""
      });
      const buckets = agingRes?.data?.buckets || [];
      setBucketDraft(buckets.map((b) => ({ ...b })));
      setExcludedDraft(Array.isArray(agingRes?.data?.excluded_databases) ? [...agingRes.data.excluded_databases] : []);
      setAvailableDatabases(Array.isArray(agingRes?.data?.available_databases) ? [...agingRes.data.available_databases] : []);
      setUsersList(Array.isArray(usersRes?.data) ? usersRes.data : []);
      setGroupList(Array.isArray(groupsRes?.data) ? groupsRes.data : []);
      setExcludedGroupDraft(Array.isArray(excludeGroupsRes?.data?.excluded_groups) ? excludeGroupsRes.data.excluded_groups : []);
      setSettingsLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const handleLabelChange = (key, value) => {
    setLabelDraft((prev) => ({ ...prev, [key]: value }));
    setLabelDone(false);
  };

  const handleSaveLabels = async () => {
    setLabelError("");
    setLabelSaving(true);
    try {
      await updateLabelSettings({ labels: labelDraft });
      setLabelDone(true);
      setTimeout(() => setLabelDone(false), 2000);
    } catch (err) {
      setLabelError(err.message || "Gagal menyimpan label");
    } finally {
      setLabelSaving(false);
    }
  };

  const handleBucketChange = (index, field, value) => {
    setBucketDraft((prev) => {
      const next = prev.map((b, i) => (i === index ? { ...b, [field]: value } : b));
      return next;
    });
    setBucketDone(false);
  };

  const handleAddBucket = () => {
    const last = bucketDraft[bucketDraft.length - 1];
    const newMin = (last?.min_age || 0) + 31;
    setBucketDraft((prev) => [
      ...prev.slice(0, -1),
      { ...prev[prev.length - 1], max_age: newMin - 1 },
      { key: `bucket_${prev.length + 1}`, label: `Bucket ${prev.length + 1}`, min_age: newMin, max_age: null, color: "#84cc16" }
    ]);
    setBucketDone(false);
  };

  const handleRemoveBucket = (index) => {
    if (bucketDraft.length <= 2) return;
    setBucketDraft((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length && next[next.length - 1].max_age !== null) {
        next[next.length - 1] = { ...next[next.length - 1], max_age: null };
      }
      return next;
    });
    setBucketDone(false);
  };

  const handleSaveBuckets = async () => {
    setBucketError("");
    setBucketSaving(true);
    try {
      await updateAgingSettings({ buckets: bucketDraft });
      setBucketDone(true);
      setTimeout(() => setBucketDone(false), 2000);
    } catch (err) {
      setBucketError(err.message || "Gagal menyimpan bucket");
    } finally {
      setBucketSaving(false);
    }
  };

  const toggleExcluded = (dbName) => {
    setExcludedDraft((prev) =>
      prev.includes(dbName) ? prev.filter((n) => n !== dbName) : [...prev, dbName]
    );
    setExcludeDone(false);
  };

  const handleSaveExclude = async () => {
    setExcludeSaving(true);
    try {
      await updateAgingSettings({ excluded_databases: excludedDraft });
      setExcludeDone(true);
      setTimeout(() => setExcludeDone(false), 2000);
    } catch (err) {
      // silently ignore
    } finally {
      setExcludeSaving(false);
    }
  };

  const handleOpenUserForm = (mode, user) => {
    if (mode === "add") {
      setUserFormUsername("");
      setUserFormPassword("");
      setUserFormLevel("operator");
    } else {
      setUserFormUsername(user?.username || "");
      setUserFormPassword("");
      setUserFormLevel(user?.level || "operator");
    }
    setUserFormMode(mode);
    setUserFormError("");
    setUserFormOpen(true);
  };

  const handleSaveUser = async () => {
    setUserFormError("");
    setUserFormSaving(true);
    try {
      if (userFormMode === "add") {
        await createUser(userFormUsername, userFormPassword, userFormLevel);
      } else {
        const payload = { level: userFormLevel };
        if (userFormPassword) payload.password = userFormPassword;
        await updateUser(userFormUsername, payload);
      }
      setUserFormOpen(false);
      const res = await fetchUsers();
      setUsersList(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setUserFormError(err.message || "Gagal menyimpan user");
    } finally {
      setUserFormSaving(false);
    }
  };

  const handleDeleteUser = async (username) => {
    try {
      await deleteUser(username);
      setUserDeleteConfirm(null);
      const res = await fetchUsers();
      setUsersList(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      // silently ignore
    }
  };

  const toggleExcludedGroup = (group) => {
    setExcludedGroupDraft((prev) =>
      prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]
    );
    setGroupDone(false);
  };

  const handleSaveExcludeGroups = async () => {
    setGroupSaving(true);
    try {
      await updateExcludeGroupSettings({ excluded_groups: excludedGroupDraft });
      setGroupDone(true);
      setTimeout(() => setGroupDone(false), 2000);
    } catch (err) {
      // silently ignore
    } finally {
      setGroupSaving(false);
    }
  };

  const filteredGroups = groupSearch
    ? groupList.filter((g) => g.toLowerCase().includes(groupSearch.toLowerCase()))
    : groupList;

  return (
    <section className="settings-page">
      {settingsLoading ? (
        <div className="detail-sheet-loading">Memuat pengaturan...</div>
      ) : (
        <div className="settings-grid">
          <div className="settings-card">
            <div className="settings-card-head">
              <h2>Label Dashboard</h2>
              <p>Ubah label yang tampil pada card di Page 1.</p>
            </div>
            <div className="settings-card-body">
              {labelFields.map((field) => (
                <label key={field.key} className="label-field">
                  <span className="label-field-key">{field.defaultLabel}</span>
                  <input
                    type="text"
                    className="label-field-input"
                    value={labelDraft[field.key] || ""}
                    onChange={(e) => handleLabelChange(field.key, e.target.value)}
                    placeholder={field.defaultLabel}
                  />
                </label>
              ))}
            </div>
            {labelError && <p className="dialog-error">{labelError}</p>}
            <div className="settings-card-footer">
              {labelDone && <span className="settings-done-tick">Tersimpan</span>}
              <button type="button" className="btn-primary" onClick={handleSaveLabels} disabled={labelSaving}>
                {labelSaving ? "Menyimpan..." : "Simpan Label"}
              </button>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-head">
              <h2>Bucket Aging</h2>
              <p>Atur range umur, label, dan warna untuk setiap bucket aging di Page 2.</p>
            </div>
            <div className="settings-card-body">
              <div className="aging-setting-header">
                <span>#</span>
                <span>Label</span>
                <span>Min</span>
                <span>Max</span>
                <span>Warna</span>
                <span>Aksi</span>
              </div>
              <div className="aging-setting-list">
                {bucketDraft.map((bucket, index) => (
                  <div key={index} className="aging-setting-row settings-bucket-row">
                    <span className="aging-setting-index">{String(index + 1).padStart(2, "0")}</span>
                    <input
                      type="text"
                      className="aging-setting-input"
                      value={bucket.label || ""}
                      onChange={(e) => handleBucketChange(index, "label", e.target.value)}
                      placeholder="Label"
                    />
                    <input
                      type="number"
                      className="aging-setting-input aging-setting-number"
                      value={bucket.min_age ?? ""}
                      onChange={(e) => handleBucketChange(index, "min_age", Number(e.target.value))}
                      placeholder="0"
                      min="0"
                    />
                    <input
                      type="number"
                      className="aging-setting-input aging-setting-number"
                      value={bucket.max_age ?? ""}
                      onChange={(e) => handleBucketChange(index, "max_age", e.target.value === "" ? null : Number(e.target.value))}
                      placeholder="null"
                      min="0"
                    />
                    <div className="settings-color-cell">
                      <input
                        type="color"
                        className="settings-color-input"
                        value={bucket.color || "#84cc16"}
                        onChange={(e) => handleBucketChange(index, "color", e.target.value)}
                      />
                      <span className="settings-color-hex">{bucket.color || "#84cc16"}</span>
                    </div>
                    <button
                      type="button"
                      className="aging-setting-remove"
                      disabled={bucketDraft.length <= 2}
                      onClick={() => handleRemoveBucket(index)}
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </div>
              <div className="aging-settings-tools">
                <button type="button" className="aging-action-btn" onClick={handleAddBucket}>
                  Tambah Bucket
                </button>
                <small>{bucketDraft.length} bucket</small>
              </div>
            </div>
            {bucketError && <p className="dialog-error">{bucketError}</p>}
            <div className="settings-card-footer">
              {bucketDone && <span className="settings-done-tick">Tersimpan</span>}
              <button type="button" className="btn-primary" onClick={handleSaveBuckets} disabled={bucketSaving}>
                {bucketSaving ? "Menyimpan..." : "Simpan Bucket"}
              </button>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-head">
              <h2>Exclude Database</h2>
              <p>Pilih database cabang yang tidak akan diproses aging. Perubahan berlaku untuk job berikutnya.</p>
            </div>
            <div className="settings-card-body">
              {availableDatabases.length === 0 ? (
                <small>Daftar database belum tersedia. Jalankan refresh dari Page 2.</small>
              ) : (
                <div className="aging-db-settings-list" style={{ maxHeight: "none", gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                  {availableDatabases.map((dbName) => (
                    <label key={dbName} className="aging-db-item">
                      <input
                        type="checkbox"
                        checked={excludedDraft.includes(dbName)}
                        onChange={() => toggleExcluded(dbName)}
                      />
                      <span>{dbName}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="settings-card-footer">
              <span>{excludedDraft.length} dari {availableDatabases.length} database di-exclude</span>
              {excludeDone && <span className="settings-done-tick">Tersimpan</span>}
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveExclude}
                disabled={excludeSaving}
              >
                {excludeSaving ? "Menyimpan..." : "Simpan Exclude"}
              </button>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-head">
              <h2>Exclude Kode Group</h2>
              <p>Pilih kode group yang tidak akan diproses dalam agregasi aging. Perubahan berlaku untuk semua halaman.</p>
            </div>
            <div className="settings-card-body">
              <div className="detail-search-input-wrap">
                <Search size={14} className="detail-search-icon" />
                <input
                  type="text"
                  className="detail-search-input"
                  placeholder="Cari kode group..."
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                />
              </div>
              {groupList.length === 0 ? (
                <small>Daftar kode group belum tersedia.</small>
              ) : (
                <div className="aging-db-settings-list" style={{ maxHeight: "14rem", gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
                  {filteredGroups.map((group) => (
                    <label key={group} className="aging-db-item">
                      <input
                        type="checkbox"
                        checked={excludedGroupDraft.includes(group)}
                        onChange={() => toggleExcludedGroup(group)}
                      />
                      <span>{group}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="settings-card-footer">
              <span>{excludedGroupDraft.length} dari {groupList.length} kode group di-exclude</span>
              {groupDone && <span className="settings-done-tick">Tersimpan</span>}
              <button type="button" className="btn-primary" onClick={handleSaveExcludeGroups} disabled={groupSaving}>
                {groupSaving ? "Menyimpan..." : "Simpan Exclude"}
              </button>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-head">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                <div>
                  <h2>Manajemen User</h2>
                  <p>Tambah, edit, dan hapus user dashboard.</p>
                </div>
                <button type="button" className="btn-primary btn-sm" onClick={() => handleOpenUserForm("add")}>
                  Tambah User
                </button>
              </div>
            </div>
            <div className="settings-card-body">
              {usersList.length === 0 ? (
                <small>Belum ada user terdaftar.</small>
              ) : (
                <div className="user-table">
                  <div className="user-table-header">
                    <span>Username</span>
                    <span>Level</span>
                    <span>Dibuat</span>
                    <span>Aksi</span>
                  </div>
                  {usersList.map((u) => (
                    <div key={u.username} className="user-table-row">
                      <strong>{u.username}</strong>
                      <span className="user-level-badge">{u.level}</span>
                      <small>{u.created_at ? new Date(u.created_at).toLocaleDateString("id-ID") : "-"}</small>
                      <div className="user-table-actions">
                        <button type="button" className="btn-secondary btn-sm" onClick={() => handleOpenUserForm("edit", u)}>Edit</button>
                        {u.username !== "admin" && (
                          <button type="button" className="aging-setting-remove btn-sm" onClick={() => setUserDeleteConfirm(u.username)}>Hapus</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {userFormOpen && (
            <div className="dialog-backdrop" onClick={() => setUserFormOpen(false)}>
              <div className="dialog-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(26rem, calc(100vw - 2rem))" }}>
                <div className="dialog-header">
                  <h2>{userFormMode === "add" ? "Tambah User" : "Edit User"}</h2>
                  <button type="button" className="dialog-close" onClick={() => setUserFormOpen(false)}><X size={18} /></button>
                </div>
                <div className="dialog-body">
                  <label className="label-field">
                    <span className="label-field-key">Username</span>
                    <input type="text" className="label-field-input" value={userFormUsername}
                      onChange={(e) => setUserFormUsername(e.target.value)}
                      disabled={userFormMode === "edit"} placeholder="Username" />
                  </label>
                  <label className="label-field">
                    <span className="label-field-key">{userFormMode === "add" ? "Password" : "Password (kosongkan jika tidak diubah)"}</span>
                    <input type="password" className="label-field-input" value={userFormPassword}
                      onChange={(e) => setUserFormPassword(e.target.value)}
                      placeholder={userFormMode === "add" ? "Password" : "Password baru"} />
                  </label>
                  <label className="label-field">
                    <span className="label-field-key">Level</span>
                    <select className="label-field-input" value={userFormLevel}
                      onChange={(e) => setUserFormLevel(e.target.value)}>
                      <option value="operator">Operator</option>
                      <option value="superuser">Superuser</option>
                    </select>
                  </label>
                  {userFormError && <p className="dialog-error">{userFormError}</p>}
                </div>
                <div className="dialog-footer">
                  <button type="button" className="btn-secondary" onClick={() => setUserFormOpen(false)}>Batal</button>
                  <button type="button" className="btn-primary" onClick={handleSaveUser} disabled={userFormSaving}>
                    {userFormSaving ? "Menyimpan..." : "Simpan"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {userDeleteConfirm && (
            <div className="dialog-backdrop" onClick={() => setUserDeleteConfirm(null)}>
              <div className="dialog-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(22rem, calc(100vw - 2rem))" }}>
                <div className="dialog-header">
                  <h2>Hapus User</h2>
                  <button type="button" className="dialog-close" onClick={() => setUserDeleteConfirm(null)}><X size={18} /></button>
                </div>
                <div className="dialog-body">
                  <p style={{ margin: 0, color: "#64748b" }}>Hapus user <strong>{userDeleteConfirm}</strong>? Tindakan ini tidak bisa dibatalkan.</p>
                </div>
                <div className="dialog-footer">
                  <button type="button" className="btn-secondary" onClick={() => setUserDeleteConfirm(null)}>Batal</button>
                  <button type="button" className="aging-setting-remove" onClick={() => handleDeleteUser(userDeleteConfirm)}>Hapus</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DashboardPage({ user }) {
  return (
    <section className="dashboard-scene is-aging">
      <AgingPage enabled user={user} />
    </section>
  );
}

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await loginApi(username, password);
      const token = res?.data?.token;
      const user = res?.data?.user;
      if (token && user) {
        localStorage.setItem("suryajaya_token", token);
        onLogin(user);
      } else {
        setError("Login gagal");
      }
    } catch (err) {
      setError(err.message || "Login gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="brand-block" style={{ justifyContent: "center", marginBottom: "1.5rem" }}>
          <div className="brand-mark" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
          <div>
            <p className="eyebrow">Suryajaya</p>
            <h1>Command Center</h1>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="label-field">
            <span className="label-field-key">Username</span>
            <input
              type="text"
              className="label-field-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoFocus
            />
          </label>
          <label className="label-field">
            <span className="label-field-key">Password</span>
            <input
              type="password"
              className="label-field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
          </label>
          {error && <p className="dialog-error" style={{ margin: 0 }}>{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Masuk..." : "Masuk"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function App() {
  const now = useCommandClock();
  const backgroundAsset = "/background_final.png";
  const [activePage, setActivePage] = useState("focus");
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [customLabels, setCustomLabels] = useState(null);
  const [detailSheetKey, setDetailSheetKey] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const labelsLoadedRef = useRef(false);
  const authenticated = Boolean(user);

  useEffect(() => {
    fetchMe()
      .then((res) => setUser(res?.data || null))
      .catch(() => { clearToken(); setUser(null); })
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogin = (loggedInUser) => setUser(loggedInUser);
  const handleLogout = () => { clearToken(); setUser(null); };

  const { data, error, loading, isRefreshing, lastUpdated, stale } = useDashboardData(authenticated ? activePage : null);

  const overview = data?.overviewMetrics;

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    if (labelsLoadedRef.current) return;
    labelsLoadedRef.current = true;

    fetchLabelSettings()
      .then((res) => setCustomLabels(res?.data?.labels || null))
      .catch(() => setCustomLabels(null));
  }, [authenticated]);

  const defaultLabels = { grosir: "Grosir", keepStocks: "Keep Stocks", kom: "KOM Stocks", brc: "BRC Stocks", cabang: "Cabang Stocks" };
  const resolvedLabels = { ...defaultLabels, ...(customLabels || {}) };

  const handleCardClick = useCallback((valueKey) => {
    setDetailSheetKey(valueKey);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      // Ignore fullscreen API errors and keep the dashboard usable.
    }
  };

  if (authLoading) {
    return (
      <main className="login-shell">
        <div className="detail-sheet-loading">Memuat...</div>
      </main>
    );
  }

  if (!authenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="dashboard-frame">
        <div className={`dashboard-surface ${activePage === "focus" ? "is-focus-page" : "is-dashboard-page"}`}>
          <header className="top-nav">
            <div className="brand-block">
              <div className="brand-mark" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div>
                <h1>Command Center Stock Monitor</h1>
              </div>
            </div>

            <PageTabs activePage={activePage} onChange={setActivePage} />

            <div className="nav-side">
              <span className="user-badge" title={`Level: ${user?.level || "operator"}`}>
                {user?.username}
                <button type="button" className="user-logout-btn" onClick={handleLogout} aria-label="Logout" title="Logout">
                  <LogOut size={12} />
                </button>
              </span>
              <button
                type="button"
                className="icon-button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              {/* <GlowBadge value={formatClock(now)} tone="glass" /> */}
              {/* <GlowBadge
                value={loading ? "Memuat" : isRefreshing ? "Sync..." : formatRelativeFreshness(lastUpdated)}
                tone={stale ? "amber" : "lime"}
              /> */}
            </div>
          </header>

          {activePage === "focus" ? (
            <FocusTopStatusBar
              apiStatus={data?.apiStatus || "offline"}
              stale={stale}
              error={error}
              lastUpdated={lastUpdated}
            />
          ) : null}

          {activePage === "focus" ? (
            <FocusPage
              backgroundAsset={backgroundAsset}
              locations={data?.locationGroups}
              keepStock={data?.keepStock}
              buckets={data?.bucketGroups}
              labels={customLabels}
              onCardClick={handleCardClick}
            />
          ) : activePage === "settings" ? (
            <SettingsPage />
          ) : (
            <DashboardPage user={user} />
          )}

          {detailSheetKey && (
            <StockDetailSheet
              sheetKey={detailSheetKey}
              label={resolvedLabels[detailSheetKey] || detailSheetKey}
              onClose={() => setDetailSheetKey(null)}
            />
          )}
        </div>
      </div>
    </main>
  );
}
