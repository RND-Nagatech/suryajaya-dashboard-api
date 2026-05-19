import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { useAgingStocks } from "../hooks/useAgingStocks";
import { fetchGroups, verifySuperuserPassword } from "../lib/api";
import {
  formatCompactNumber,
  formatInteger,
  formatMetric,
  formatTimestamp
} from "../lib/formatters";
import { AlertTriangle, Sparkles, Target, TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "../lib/firebase";
import { Encryptor } from '../lib/encryptor'

const COLORS = ["#22c55e", "#84cc16", "#facc15", "#fb923c", "#ef4444"];
const encryptor = new Encryptor();

function hexToRgb(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return null;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function getBucketTone(bucketKey) {
  switch (bucketKey) {
    case "age_1_30":
      return "green";
    case "age_31_60":
      return "lime";
    case "age_61_90":
      return "yellow";
    case "age_91_120":
      return "orange";
    case "age_121_plus":
      return "red";
    default:
      return "glass";
  }
}

function getBucketColor(bucket, index) {
  return bucket?.color || COLORS[index % COLORS.length];
}

function formatPercent(value) {
  return `${new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 1
  }).format(Number(value || 0))}%`;
}

function ObscuredWeight({ value, unit, visible, onToggle, className }) {
  return (
    <span className={`obscured-value ${className || ""}`}>
      {visible ? (
        <span>{formatMetric(value, unit)}</span>
      ) : (
        <span>{"***"} {unit || "gr"}</span>
      )}
      <button type="button" className="obscured-toggle" onClick={onToggle} aria-label={visible ? "Sembunyikan" : "Tampilkan"}>
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </span>
  );
}

function AgingMetricTile({ label, value, meta, tone = "glass", icon: Icon, iconColor: iconColorProp }) {
  return (
    <article className={`aging-metric-tile tone-${tone}`}>
      <div className="aging-metric-tile-head">
        <span>{label}</span>
        {Icon ? <Icon size={16} strokeWidth={2.25} aria-hidden="true" color={iconColorProp} /> : null}
      </div>
      <strong>{value}</strong>
      <small>{meta}</small>
    </article>
  );
}

function AgingMetricStrip({ summary, totalWeight, totalDoc, totalSoh, dominantBucket, branchCount, weightVisible, onToggleWeight }) {
  const dominantShare = totalWeight > 0 && dominantBucket ? (Number(dominantBucket.total_berat || 0) / totalWeight) * 100 : 0;
  const dominantTone = dominantBucket ? `tone-${getBucketTone(dominantBucket.key)}` : "tone-glass";

  return (
    <section className="aging-metric-strip">
      <AgingMetricTile
        label="Total Berat"
        value={<ObscuredWeight value={summary.total_berat || 0} unit="gr" visible={weightVisible} onToggle={onToggleWeight} />}
        meta="Akumulasi seluruh bucket aging"
        tone="lime"
        icon={TrendingUp}
      />
      <AgingMetricTile
        label="Total SOH"
        value={formatCompactNumber(totalSoh || summary.total_stock_on_hand || 0)}
        meta="Stock on hand terhitung"
        tone="glass"
        icon={Sparkles}
      />
      <AgingMetricTile
        label="Total Doc"
        value={formatCompactNumber(totalDoc || summary.total_doc || 0)}
        meta="Dokumen aging yang diproses"
        tone="cyan"
        icon={Target}
      />
      <AgingMetricTile
        label="Bucket Dominan"
        value={dominantBucket?.label || "-"}
        meta={`${formatPercent(dominantShare)} dari total · ${formatInteger(branchCount || 0)} cabang`}
        tone={dominantTone.replace("tone-", "")}
        icon={AlertTriangle}
        iconColor={dominantBucket?.color || (dominantBucket ? COLORS[Math.max(0, ["age_1_30", "age_31_60", "age_61_90", "age_91_120", "age_121_plus"].indexOf(dominantBucket.key)) % COLORS.length] : undefined)}
      />
    </section>
  );
}

function BranchDeptDistributionCard({ selectedBranchCode, deptBreakdown, totalWeightOverride = null }) {
  const normalized = (deptBreakdown || []).map((entry) => ({
    name: entry.kode_dept || "UNMAPPED",
    value: Number(entry.total_berat || 0),
    total_doc: Number(entry.total_doc || 0),
    total_stock_on_hand: Number(entry.total_stock_on_hand || 0)
  })).filter((entry) => entry.value > 0);

  const totalWeightRaw = normalized.reduce((sum, entry) => sum + entry.value, 0);
  const totalWeight = Number.isFinite(Number(totalWeightOverride))
    ? Number(totalWeightOverride)
    : totalWeightRaw;
  const topJenis = [...normalized].sort((a, b) => b.value - a.value)[0] || null;

  return (
    <GlassCard className="chart-card aging-chart-card aging-distribution-card">
      <div className="aging-chart-head">
        <div>
          <p className="eyebrow">Infographic cabang</p>
          <h4>Distribusi kode dept · {selectedBranchCode || "-"}</h4>
        </div>
        <span>{formatMetric(totalWeight, "gr")}</span>
      </div>

      {normalized.length === 0 ? (
        <article className="aging-empty aging-ranking-empty">
          <strong>Belum ada data jenis</strong>
          <small>Pilih cabang dari panel tengah untuk melihat distribusi kode dept.</small>
        </article>
      ) : (
        <div className="aging-distribution-layout">
          <div className="donut-wrapper aging-donut-wrap">
            <ResponsiveContainer width="100%" height={248}>
              <PieChart>
                <Pie
                  data={normalized}
                  dataKey="value"
                  innerRadius={70}
                  outerRadius={112}
                  paddingAngle={3}
                  cornerRadius={8}
                  stroke="rgba(255,255,255,0.92)"
                  strokeWidth={1}
                >
                  {normalized.map((entry, index) => (
                    <Cell key={entry.name || index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            <div className="donut-center">
              <strong>{formatMetric(totalWeight, "gr")}</strong>
              <small>{selectedBranchCode || "-"} total berat</small>
            </div>
          </div>

          <div className="aging-legend-list">
            {normalized.slice(0, 7).map((entry, index) => {
              const share = totalWeight > 0 ? (entry.value / totalWeight) * 100 : 0;
              return (
                <div key={entry.name} className="aging-legend-row">
                  <span className="aging-legend-dot" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <div className="aging-legend-copy">
                    <strong>{entry.name}</strong>
                    <small>{formatInteger(entry.total_doc)} dok · {formatInteger(entry.total_stock_on_hand)} soh</small>
                  </div>
                  <span className="aging-legend-share">{formatPercent(share)}</span>
                </div>
              );
            })}
            {topJenis ? (
              <div className="aging-legend-row is-active tone-lime">
                <span className="aging-legend-dot" style={{ backgroundColor: "rgba(132, 204, 22, 0.95)" }} />
                <div className="aging-legend-copy">
                  <strong>Dominan: {topJenis.name}</strong>
                  <small>{formatMetric(topJenis.value, "gr")}</small>
                </div>
                <span className="aging-legend-share">{formatPercent((topJenis.value / Math.max(totalWeight, 1)) * 100)}</span>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function AgingDistributionCard({ buckets, totalWeight, activeBucketKey, weightVisible, onToggleWeight }) {
  const bucketData = buckets.map((bucket) => ({
    name: bucket.label,
    value: Number(bucket.total_berat || 0),
    color: bucket.color
  }));
  const dominantBucket = [...buckets].sort((left, right) => Number(right.total_berat || 0) - Number(left.total_berat || 0))[0] || null;
  const dominantShare = totalWeight > 0 && dominantBucket ? (Number(dominantBucket.total_berat || 0) / totalWeight) * 100 : 0;

  return (
    <GlassCard className="chart-card aging-chart-card aging-distribution-card">
      <div className="aging-chart-head">
        <div>
          <p className="eyebrow">Infographic</p>
          <h4>Distribusi nilai per aging bucket</h4>
        </div>
        <span>{formatMetric(totalWeight || 0, "gr")}</span>
      </div>

      <div className="aging-distribution-layout">
        <div className="donut-wrapper aging-donut-wrap">
          <ResponsiveContainer width="100%" height={258}>
            <PieChart>
              <Pie
                data={bucketData}
                dataKey="value"
                innerRadius={74}
                outerRadius={114}
                paddingAngle={4}
                cornerRadius={8}
                stroke="rgba(255,255,255,0.92)"
                strokeWidth={1}
              >
                {bucketData.map((entry, index) => (
                  <Cell key={entry.name || index} fill={getBucketColor(entry, index)} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div className="donut-center">
            <strong><ObscuredWeight value={totalWeight || 0} unit="gr" visible={weightVisible} onToggle={onToggleWeight} /></strong>
            <small>Total nilai stok</small>
          </div>
        </div>

        <div className="aging-distribution-copy">
          <p className="aging-chart-kicker">Bucket dominan</p>
          <strong>{dominantBucket?.label || "Belum ada bucket"}</strong>
          <span>{formatPercent(dominantShare)} dari total nilai stok</span>
          <p>
            Fokus visual dibangun dari kontribusi masing-masing bucket agar operator bisa langsung melihat area aging yang paling berat.
          </p>

          <div className="aging-legend-list">
            {buckets.map((bucket, index) => {
              const share = totalWeight > 0 ? (Number(bucket.total_berat || 0) / totalWeight) * 100 : 0;
              const active = bucket.key === activeBucketKey;

              const bucketRgb = hexToRgb(getBucketColor(bucket, index));
              return (
                <div
                  key={bucket.key}
                  className={`aging-legend-row ${active ? "is-active" : ""} tone-${getBucketTone(bucket.key)}`}
                  style={bucketRgb ? { "--bucket-rgb": bucketRgb } : undefined}
                >
                  <span
                    className="aging-legend-dot"
                    style={{ backgroundColor: getBucketColor(bucket, index) }}
                    aria-hidden="true"
                  />
                  <div className="aging-legend-copy">
                    <strong>{bucket.label}</strong>
                    <small>{formatInteger(bucket.total_doc || 0)} dok · {formatInteger(bucket.branch_count || 0)} cabang</small>
                  </div>
                  <span className="aging-legend-share">{formatPercent(share)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function AgingBranchRankingCard({ branches, pagination, selectedBucketLabel }) {
  const rankedBranches = [...branches].sort((left, right) => Number(right.total_berat || 0) - Number(left.total_berat || 0));
  const topBranches = rankedBranches.slice(0, 5);
  const maxWeight = topBranches[0]?.total_berat || 0;

  return (
    <GlassCard className="chart-card aging-chart-card aging-ranking-card">
      <div className="aging-chart-head">
        <div>
          <p className="eyebrow">Cabang bucket aktif</p>
          <h4>Top cabang pada halaman ini</h4>
        </div>
        <span>
          {selectedBucketLabel ? `${selectedBucketLabel} · ` : ""}
          {formatInteger(pagination?.total || branches.length)} cabang
        </span>
      </div>

      <div className="aging-rank-list">
        {topBranches.length === 0 ? (
          <article className="aging-empty aging-ranking-empty">
            <strong>Belum ada cabang untuk ditampilkan</strong>
            <small>Pilih bucket atau tunggu hasil query cabang aktif selesai dimuat.</small>
          </article>
        ) : (
          topBranches.map((branch, index) => {
            const share = maxWeight > 0 ? (Number(branch.total_berat || 0) / maxWeight) * 100 : 0;

            return (
              <div key={`${branch.db_name || "db"}-${branch.kode_cabang}`} className="aging-rank-row">
                <div className="aging-rank-index">{String(index + 1).padStart(2, "0")}</div>
                <div className="aging-rank-body">
                  <div className="aging-rank-copy">
                    <strong>{branch.kode_cabang || "-"}</strong>
                    <small>{formatInteger(branch.total_doc || 0)} dok · {formatInteger(branch.total_stock_on_hand || 0)} soh</small>
                  </div>
                  <div className="aging-rank-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(8, share)}%` }} />
                  </div>
                </div>
                <div className="aging-rank-meta">
                  <strong>{formatMetric(branch.total_berat || 0, "gr")}</strong>
                  <small>{branch.status || "completed"}</small>
                </div>
              </div>
            );
          })
        )}
      </div>
    </GlassCard>
  );
}

function AgingInsightCard({ totalWeight, dominantBucket, topBranch, jobStatus, lastSynced }) {
  const dominantShare = totalWeight > 0 && dominantBucket ? (Number(dominantBucket.total_berat || 0) / totalWeight) * 100 : 0;
  const branchShare = totalWeight > 0 && topBranch ? (Number(topBranch.total_berat || 0) / totalWeight) * 100 : 0;
  const dominantTone = getBucketTone(dominantBucket?.key);

  const recommendation = dominantBucket?.key === "age_120_plus"
    ? "Prioritaskan sellout, retur, dan follow-up stok tua di atas 120 hari."
    : dominantBucket?.key === "age_1_30"
      ? "Perputaran sehat. Jaga replenishment dan pantau cabang dengan akumulasi tertinggi."
      : "Pantau bucket dominan dan cabang terbesar agar aging tidak bergeser ke bucket tua.";

  return (
    <GlassCard className="chart-card aging-chart-card aging-insight-card">
      <div className="aging-chart-head">
        <div>
          <p className="eyebrow">Insight & rekomendasi</p>
          <h4>Fokus analisis singkat</h4>
        </div>
        <span>{jobStatus || "completed"}</span>
      </div>

      <div className="aging-insight-stack">
        <article
          className={`aging-insight-item tone-${dominantTone}`}
          style={dominantBucket?.color && hexToRgb(dominantBucket.color) ? { "--bucket-rgb": hexToRgb(dominantBucket.color) } : undefined}
        >
          <Target size={18} strokeWidth={2.2} aria-hidden="true" />
          <div>
            <span>Bucket fokus</span>
            <strong>{dominantBucket?.label || "-"}</strong>
            <small>{formatPercent(dominantShare)} dari total nilai stok</small>
          </div>
        </article>

        <article className="aging-insight-item tone-cyan">
          <TrendingUp size={18} strokeWidth={2.2} aria-hidden="true" />
          <div>
            <span>Cabang terbesar</span>
            <strong>{topBranch?.kode_cabang || "-"}</strong>
            <small>{formatPercent(branchShare)} kontribusi di halaman aktif</small>
          </div>
        </article>

        <article className="aging-insight-item tone-amber">
          <Sparkles size={18} strokeWidth={2.2} aria-hidden="true" />
          <div>
            <span>Action</span>
            <strong>{recommendation}</strong>
            <small>Sinkron terakhir {formatTimestamp(lastSynced)}</small>
          </div>
        </article>
      </div>
    </GlassCard>
  );
}

function AgingProgressBar({ value }) {
  return (
    <div className="aging-progress-bar" aria-label={`Progress ${value}%`}>
      <div className="aging-progress-fill" style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
    </div>
  );
}

function AgingBucketCard({ bucket, active, onClick, weightVisible, onToggleWeight }) {
  const share = Number(bucket.share || 0);
  const tone = bucket.tone || "glass";
  const bucketRgb = hexToRgb(bucket.color);

  return (
    <button
      type="button"
      className={`aging-bucket-card tone-${tone} ${active ? "is-active" : ""}`}
      style={bucketRgb ? { "--bucket-rgb": bucketRgb } : undefined}
      onClick={onClick}
    >
      <div className="aging-bucket-head">
        <span className="aging-bucket-label">{bucket.label}</span>
        <span className="aging-bucket-share">{formatPercent(share)}</span>
      </div>
      <strong><ObscuredWeight value={bucket.total_berat || 0} unit="gr" visible={weightVisible} onToggle={onToggleWeight} /></strong>
      <small>{formatInteger(bucket.total_doc || 0)} dok | {formatInteger(bucket.branch_count || 0)} cabang</small>
    </button>
  );
}

function AgingSettingRow({ bucket, index, onChange, onRemove, removable, errorMessage }) {
  return (
    <div className="aging-setting-row-wrap">
      <div className="aging-setting-row">
        <span className="aging-setting-index">{String(index + 1).padStart(2, "0")}</span>
        <input
          type="text"
          value={bucket.label}
          onChange={(event) => onChange(index, "label", event.target.value)}
          className="aging-setting-input"
        />
        <input
          type="number"
          min="0"
          value={bucket.min_age}
          onChange={(event) => onChange(index, "min_age", event.target.value)}
          className="aging-setting-input aging-setting-number"
        />
        <input
          type="number"
          min="0"
          value={bucket.max_age === null ? "" : bucket.max_age}
          onChange={(event) => onChange(index, "max_age", event.target.value)}
          className="aging-setting-input aging-setting-number"
          placeholder="null"
        />
        <input
          type="color"
          value={bucket.color || "#84cc16"}
          onChange={(event) => onChange(index, "color", event.target.value)}
          className="settings-color-input"
          title="Warna bucket"
        />
        <button
          type="button"
          className="aging-setting-remove"
          onClick={() => onRemove(index)}
          disabled={!removable}
          title={removable ? "Hapus bucket" : "Minimal 2 bucket"}
        >
          Hapus
        </button>
      </div>
      {errorMessage ? <small className="aging-setting-error">{errorMessage}</small> : null}
    </div>
  );
}

function BranchRow({ branch, active, onClick }) {
  return (
    <button type="button" className={`aging-branch-row ${active ? "is-active" : ""}`} onClick={onClick}>
      <div>
        <strong>{branch.kode_cabang}</strong>
        <small>
          {branch.db_name || "-"} · {formatInteger(branch.total_doc || 0)} dok | {formatInteger(branch.total_stock_on_hand || 0)} soh
          {branch.status === "failed" && branch.error ? ` · ${branch.error}` : ""}
        </small>
      </div>
      <div className="aging-branch-metrics">
        <strong>{formatMetric(branch.total_berat || 0, "gr")}</strong>
        <small>{branch.status}</small>
      </div>
    </button>
  );
}

function AgingPager({ pagination, page, loading, onPrev, onNext, label }) {
  const total = pagination?.total || 0;
  const limit = pagination?.limit || 0;
  const totalPages = pagination?.total_pages || 0;
  const start = total > 0 ? ((page - 1) * limit) + 1 : 0;
  const end = total > 0 ? Math.min(page * limit, total) : 0;

  return (
    <div className="aging-pager">
      <div className="aging-pager-copy">
        <strong>{label}</strong>
        <small>{loading ? "Memuat..." : `${start}-${end} dari ${formatInteger(total)}`}</small>
      </div>
      <div className="aging-pager-controls">
        <button
          type="button"
          className="aging-pager-btn"
          onClick={onPrev}
          disabled={loading || page <= 1}
        >
          Prev
        </button>
        <span>
          {formatInteger(page)} / {formatInteger(totalPages || 0)}
        </span>
        <button
          type="button"
          className="aging-pager-btn"
          onClick={onNext}
          disabled={loading || !pagination?.has_more}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function AgingSearchInput({ value, onChange, placeholder }) {
  return (
    <input
      type="search"
      className="aging-search-input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
    />
  );
}

function ItemRow({ item }) {
  return (
    <ItemRowContent item={item} />
  );
}

function ItemRowContent({ item, onBarcodeClick }) {
  return (
    <article className="aging-item-row">
      <div className="aging-item-main">
        {onBarcodeClick ? (
          <button
            type="button"
            className="aging-barcode-btn"
            onClick={() => onBarcodeClick(item)}
            title="Lihat detail barang"
          >
            {item.kode_barcode || "-"}
          </button>
        ) : (
          <strong>{item.kode_barcode || "-"}</strong>
        )}
        <small>{item.kode_group || "-"} | {item.kode_dept || "-"}</small>
      </div>
      <div className="aging-item-meta">
        <span>{item.umur_barang ?? "-"} hari</span>
        <strong>{formatMetric(item.berat || 0, "gr")}</strong>
      </div>
    </article>
  );
}

async function getImageUrlByBarcode(barcode) {
  const value = String(barcode || "").trim();
  if (!value) {
    return null;
  }

  const candidates = [
    `NSIPIC/SURYAJAYA/foto_produk/${value}.jpg`,
  ];

  for (const path of candidates) {
    try {
      const url = await getDownloadURL(ref(storage, path));
      if (url) {
        return url;
      }
    } catch (error) {
      // Try next candidate path.
    }
  }

  return null;
}

export function AgingPage({ enabled, user }) {
  const isSuperuser = user?.level === "superuser";
  const [weightVisible, setWeightVisible] = useState(isSuperuser);
  const [superuserPromptOpen, setSuperuserPromptOpen] = useState(false);
  const [superuserPassword, setSuperuserPassword] = useState("");
  const [superuserError, setSuperuserError] = useState("");
  const [groupList, setGroupList] = useState([]);
  const [itemGroupFilter, setItemGroupFilter] = useState("");

  useEffect(() => {
    if (!enabled) return;
    fetchGroups()
      .then((res) => setGroupList(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setGroupList([]));
  }, [enabled]);

  const handleToggleWeight = () => {
    if (weightVisible) {
      setWeightVisible(false);
    } else if (isSuperuser) {
      setWeightVisible(true);
    } else {
      setSuperuserPromptOpen(true);
      setSuperuserPassword("");
      setSuperuserError("");
    }
  };

  const handleVerifySuperuser = async () => {
    setSuperuserError("");
    try {
      await verifySuperuserPassword(superuserPassword);
      setSuperuserPromptOpen(false);
      setWeightVisible(true);
    } catch {
      setSuperuserError("Password superuser salah");
    }
  };
  const aging = useAgingStocks(enabled, itemGroupFilter);
  const [draftBuckets, setDraftBuckets] = useState([]);
  const [excludedDatabasesDraft, setExcludedDatabasesDraft] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExcludePasswordOpen, setIsExcludePasswordOpen] = useState(false);
  const [isExcludeDialogOpen, setIsExcludeDialogOpen] = useState(false);
  const [excludePassword, setExcludePassword] = useState("");
  const [excludePasswordError, setExcludePasswordError] = useState("");
  const [bucketErrors, setBucketErrors] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedItemImage, setSelectedItemImage] = useState("");
  const [selectedItemLoadingImage, setSelectedItemLoadingImage] = useState(false);
  const isJobComplete = aging.latestJob?.status === "completed";
  const excludeDialogPassword = import.meta.env.VITE_AGING_EXCLUDE_PASSWORD || "suryajaya-aging";

  useEffect(() => {
    if (aging.settings?.buckets?.length) {
      setDraftBuckets(
        aging.settings.buckets.map((bucket) => ({
          key: bucket.key,
          label: bucket.label,
          min_age: bucket.min_age,
          max_age: bucket.max_age,
          color: bucket.color || COLORS[0]
        }))
      );
    }
    setExcludedDatabasesDraft(Array.isArray(aging.settings?.excluded_databases) ? aging.settings.excluded_databases : []);
    setBucketErrors([]);
  }, [aging.settings]);

  const displayedBuckets = aging.latestJob?.buckets?.length
    ? aging.latestJob.buckets
    : draftBuckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      min_age: Number(bucket.min_age || 0),
      max_age: bucket.max_age === "" ? null : (bucket.max_age === null ? null : Number(bucket.max_age)),
      total_doc: 0,
      total_stock_on_hand: 0,
      total_berat: 0,
      branch_count: 0
    }));

  const selectedBucket = displayedBuckets.find((bucket) => bucket.key === aging.selectedBucketKey) || displayedBuckets[0] || null;
  const selectedBranch = aging.branches.find(
    (branch) =>
      branch.kode_cabang === aging.selectedBranchCode &&
      branch.db_name === aging.selectedBranchDbName
  ) || null;
  const totalBucketWeight = displayedBuckets.reduce((total, bucket) => total + Number(bucket.total_berat || 0), 0);
  const totalBucketDoc = displayedBuckets.reduce((total, bucket) => total + Number(bucket.total_doc || 0), 0);
  const totalBucketSoh = displayedBuckets.reduce((total, bucket) => total + Number(bucket.total_stock_on_hand || 0), 0);
  const settingsBucketMap = new Map((aging.settings?.buckets || []).map((b) => [b.key, b]));
  const bucketCards = displayedBuckets.map((bucket) => {
    const settingsBucket = settingsBucketMap.get(bucket.key);
    return {
      ...bucket,
      color: settingsBucket?.color || bucket.color,
      tone: getBucketTone(bucket.key),
      share: totalBucketWeight > 0 ? (Number(bucket.total_berat || 0) / totalBucketWeight) * 100 : 0
    };
  });
  const dominantBucket = [...displayedBuckets].sort((left, right) => Number(right.total_berat || 0) - Number(left.total_berat || 0))[0] || null;
  const topBranchPreview = [...aging.branches].sort((left, right) => Number(right.total_berat || 0) - Number(left.total_berat || 0))[0] || null;

  const buildBucketKey = (label, index) => {
    const slug = String(label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return `age_${slug || `bucket_${index + 1}`}`;
  };

  const validateBucketDrafts = (inputBuckets) => {
    const errors = [];
    const sorted = [...inputBuckets]
      .map((bucket, index) => ({ ...bucket, index }))
      .sort((left, right) => Number(left.min_age || 0) - Number(right.min_age || 0));

    const keySet = new Set();

    sorted.forEach((bucket, sortedIndex) => {
      const label = String(bucket.label || "").trim();
      const minAge = Number(bucket.min_age);
      const maxAge = bucket.max_age === "" || bucket.max_age === null ? null : Number(bucket.max_age);

      if (!label) {
        errors[bucket.index] = "Label wajib diisi.";
        return;
      }

      if (!Number.isFinite(minAge) || minAge < 0) {
        errors[bucket.index] = "Min age harus angka >= 0.";
        return;
      }

      if (maxAge !== null && (!Number.isFinite(maxAge) || maxAge < minAge)) {
        errors[bucket.index] = "Max age harus >= min age atau kosong.";
        return;
      }

      const key = bucket.key || buildBucketKey(label, bucket.index);
      if (keySet.has(key)) {
        errors[bucket.index] = "Key bucket duplikat. Ubah label agar unik.";
        return;
      }
      keySet.add(key);

      if (sortedIndex === 0) {
        if (minAge > 1) {
          errors[bucket.index] = "Bucket pertama harus dimulai dari 0 atau 1.";
        }
        return;
      }

      const previous = sorted[sortedIndex - 1];
      const prevMax = previous.max_age === "" || previous.max_age === null ? null : Number(previous.max_age);
      if (prevMax === null) {
        errors[bucket.index] = "Hanya bucket terakhir yang boleh punya max kosong.";
        return;
      }
      if (minAge <= prevMax) {
        errors[bucket.index] = `Min harus lebih besar dari max bucket sebelumnya (${prevMax}).`;
      }
    });

    const last = sorted[sorted.length - 1];
    if (last) {
      const lastMax = last.max_age === "" || last.max_age === null ? null : Number(last.max_age);
      if (lastMax !== null) {
        errors[last.index] = "Bucket terakhir harus punya max kosong (null).";
      }
    }

    return errors;
  };

  const handleBucketChange = (index, field, value) => {
    setDraftBuckets((current) =>
      current.map((bucket, bucketIndex) => {
        if (bucketIndex !== index) {
          return bucket;
        }

        const nextValue = field === "label"
          ? value
          : (value === "" ? null : Number(value));
        const nextLabel = field === "label" ? value : bucket.label;

        return {
          ...bucket,
          [field]: nextValue,
          key: buildBucketKey(nextLabel, bucketIndex)
        };
      })
    );
  };

  const handleSaveSettings = async () => {
    const nextErrors = validateBucketDrafts(draftBuckets);
    setBucketErrors(nextErrors);
    if (nextErrors.some(Boolean)) {
      return;
    }

    await aging.saveSettings({
      buckets: draftBuckets,
      resetAfterSave: true
    });
    setIsSettingsOpen(false);
  };

  const handleAddBucket = () => {
    setDraftBuckets((current) => {
      const sorted = [...current].sort((left, right) => Number(left.min_age || 0) - Number(right.min_age || 0));
      const last = sorted[sorted.length - 1];
      const lastMin = Number(last?.min_age || 0);
      const fallbackMin = Number.isFinite(lastMin) ? lastMin + 1 : 1;
      return [
        ...current,
        {
          key: buildBucketKey(`Bucket ${current.length + 1}`, current.length),
          label: `Bucket ${current.length + 1}`,
          min_age: fallbackMin,
          max_age: null,
          color: COLORS[current.length % COLORS.length]
        }
      ];
    });
  };

  const handleRemoveBucket = (index) => {
    setDraftBuckets((current) => {
      if (current.length <= 2) {
        return current;
      }
      return current.filter((_, bucketIndex) => bucketIndex !== index);
    });
  };

  const toggleExcludedDatabase = (dbName) => {
    setExcludedDatabasesDraft((current) => {
      if (current.includes(dbName)) {
        return current.filter((item) => item !== dbName);
      }

      return [...current, dbName];
    });
  };

  const handleOpenExcludeDialog = () => {
    setExcludePassword("");
    setExcludePasswordError("");
    setIsExcludePasswordOpen(true);
  };

  const handleVerifyExcludePassword = () => {
    if (excludePassword !== excludeDialogPassword) {
      setExcludePasswordError("Password salah.");
      return;
    }
    setExcludePasswordError("");
    setIsExcludePasswordOpen(false);
    setIsExcludeDialogOpen(true);
  };

  const handleSaveExcludedDatabases = async () => {
    await aging.saveSettings({
      excludedDatabases: excludedDatabasesDraft
    });
    setIsExcludeDialogOpen(false);
  };

  const progressValue = aging.latestJob?.progress?.percent || 0;
  const summary = aging.latestJob?.summary_totals || {
    total_doc: 0,
    total_stock_on_hand: 0,
    total_berat: 0
  };
  const branchLimit = aging.branchPagination?.limit || aging.branchPageSize || 0;
  const itemLimit = aging.itemPagination?.limit || aging.itemPageSize || 0;

  useEffect(() => {
    if (!selectedItem?.kode_barcode) {
      setSelectedItemImage("");
      setSelectedItemLoadingImage(false);
      return;
    }

    let cancelled = false;
    setSelectedItemLoadingImage(true);
    setSelectedItemImage("");

    getImageUrlByBarcode(selectedItem.kode_barcode)
      .then((url) => {
        if (!cancelled) {
          setSelectedItemImage(url || "");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSelectedItemLoadingImage(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedItem?.kode_barcode]);

  return (
    <section className="aging-shell">
      {isJobComplete ? (
        <div className="aging-compact-toolbar">
          <div className="aging-compact-copy">
            <p className="eyebrow">Aging Complete</p>
            <strong>{formatTimestamp(aging.lastSynced)}</strong>
            <small>
              {aging.latestJob?.progress?.processed || 0} / {aging.latestJob?.progress?.total || 0} database processed
            </small>
          </div>
          <div className="aging-status-actions">
            <button type="button" className="aging-action-btn" onClick={handleToggleWeight} title={weightVisible ? "Sembunyikan berat" : "Tampilkan berat"}>
              {weightVisible ? <><EyeOff size={14} /> Berat</> : <><Eye size={14} /> Berat</>}
            </button>
            <button type="button" className="aging-action-btn" onClick={() => aging.refreshJob()}>
              {aging.isStarting ? "Starting..." : "Refresh Job"}
            </button>
            <button
              type="button"
              className="aging-action-btn is-primary"
              onClick={() => setIsSettingsOpen(true)}
            >
              Aging Setting
            </button>
          </div>
        </div>
      ) : (
        <GlassCard className="aging-status-card">
          <div className="aging-status-head">
            <div>
              <p className="eyebrow">Aging Analysis</p>
              <h2>Cabang Aging Stocks</h2>
              <p className="aging-subtitle">
                Snapshot bucket aging, progres job, dan drilldown cabang ke barang.
              </p>
            </div>
            <div className="aging-status-actions">
              <button type="button" className="aging-action-btn" onClick={handleToggleWeight} title={weightVisible ? "Sembunyikan berat" : "Tampilkan berat"}>
                {weightVisible ? <><EyeOff size={14} /> Berat</> : <><Eye size={14} /> Berat</>}
              </button>
              <button type="button" className="aging-action-btn" onClick={() => aging.refreshJob()}>
                {aging.isStarting ? "Starting..." : "Refresh Job"}
              </button>
              <button
                type="button"
                className="aging-action-btn is-primary"
                onClick={() => setIsSettingsOpen(true)}
              >
                Aging Setting
              </button>
            </div>
          </div>

          <div className="aging-progress-block">
            <div className="aging-progress-meta">
              <strong>{aging.latestJob ? aging.latestJob.status : "idle"}</strong>
              <span>
                {aging.latestJob?.progress?.processed || 0} / {aging.latestJob?.progress?.total || 0} database processed
              </span>
            </div>
            <AgingProgressBar value={progressValue} />
            <div className="aging-summary-grid">
              <div>
                <span>Total Doc</span>
                <strong>{formatCompactNumber(summary.total_doc || 0)}</strong>
              </div>
              <div>
                <span>Total SOH</span>
                <strong>{formatCompactNumber(summary.total_stock_on_hand || 0)}</strong>
              </div>
              <div>
                <span>Total Berat</span>
                <strong>{formatMetric(summary.total_berat || 0, "gr")}</strong>
              </div>
              <div>
                <span>Last Sync</span>
                <strong>{formatTimestamp(aging.lastSynced)}</strong>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {isJobComplete && !aging.selectedBranchCode ? (
        <AgingMetricStrip
          summary={summary}
          totalWeight={totalBucketWeight}
          totalDoc={totalBucketDoc}
          totalSoh={totalBucketSoh}
          dominantBucket={dominantBucket}
          branchCount={aging.branchPagination?.total || aging.branches.length}
          weightVisible={weightVisible}
          onToggleWeight={handleToggleWeight}
        />
      ) : null}

      <section
        className="aging-bucket-grid"
        style={{ gridTemplateColumns: `repeat(${bucketCards.length || 1}, minmax(0, 1fr))` }}
      >
        {bucketCards.map((bucket) => (
          <AgingBucketCard
            key={bucket.key}
            bucket={bucket}
            active={bucket.key === aging.selectedBucketKey}
            weightVisible={weightVisible}
            onToggleWeight={handleToggleWeight}
            onClick={() => {
              aging.setBranchPage(1);
              aging.setItemPage(1);
              aging.setBranchSearch("");
              aging.setItemSearch("");
              aging.setSelectedBucketKey(bucket.key);
              aging.setSelectedBranchCode("");
              aging.setSelectedBranchDbName("");
            }}
          />
        ))}
      </section>

      <section className="aging-drilldown-grid aging-workspace-grid">
        {selectedBranch?.kode_cabang ? (
          <BranchDeptDistributionCard
            selectedBranchCode={selectedBranch?.kode_cabang}
            deptBreakdown={aging.deptBreakdown}
            totalWeightOverride={selectedBranch?.total_berat ?? null}
          />
        ) : (
          <AgingDistributionCard
            buckets={displayedBuckets}
            totalWeight={totalBucketWeight}
            activeBucketKey={aging.selectedBucketKey}
            weightVisible={weightVisible}
            onToggleWeight={handleToggleWeight}
          />
        )}

        <GlassCard className="aging-panel">
          <div className="panel-head">
            <div className="aging-panel-title">
              <p className="eyebrow">Cabang bucket aktif</p>
              <h3>{selectedBucket?.label || "Pilih bucket aging"}</h3>
              <AgingSearchInput
                value={aging.branchSearch}
                onChange={(value) => aging.setBranchSearch(value)}
                placeholder="Cari kode cabang atau db_name"
              />
            </div>
            <AgingPager
              label={aging.branchLoading ? "Memuat cabang..." : "Cabang bucket ini"}
              pagination={aging.branchPagination}
              page={aging.branchPage}
              loading={aging.branchLoading}
              onPrev={() => aging.setBranchPage((page) => Math.max(1, page - 1))}
              onNext={() => aging.setBranchPage((page) => page + 1)}
            />
          </div>
          <div className="aging-panel-meta">
            <span>
              Menampilkan {formatInteger(aging.branches.length)} dari {formatInteger(aging.branchPagination?.total || 0)} cabang
            </span>
            <span>
              Ukuran halaman {formatInteger(branchLimit)} cabang
            </span>
          </div>

          <div className="aging-panel-scroll">
            {aging.branches.length === 0 ? (
              <article className="aging-empty">
                <strong>Belum ada cabang untuk bucket ini</strong>
                <small>{aging.error || "Tunggu job selesai atau pilih bucket lain."}</small>
              </article>
            ) : (
              aging.branches.map((branch) => (
                <BranchRow
                  key={`${branch.db_name || "db"}-${branch.kode_cabang}`}
                  branch={branch}
                  active={
                    branch.kode_cabang === aging.selectedBranchCode &&
                    branch.db_name === aging.selectedBranchDbName
                  }
                  onClick={() => {
                    aging.setItemPage(1);
                    aging.setSelectedBranchCode(branch.kode_cabang);
                    aging.setSelectedBranchDbName(branch.db_name || "");
                    aging.setItemSearch("");
                  }}
                />
              ))
            )}
          </div>
        </GlassCard>

        <GlassCard className="aging-panel">
          <div className="panel-head">
            <div className="aging-panel-title">
              <p className="eyebrow">Detail Barang</p>
              <h3>{selectedBranch?.kode_cabang || "Pilih cabang untuk detail barang"}</h3>
              <AgingSearchInput
                value={aging.itemSearch}
                onChange={(value) => aging.setItemSearch(value)}
                placeholder="Cari barcode atau kode toko"
              />
              <div className="aging-group-filter">
                <select
                  className="aging-setting-input"
                  value={itemGroupFilter}
                  onChange={(e) => { setItemGroupFilter(e.target.value); aging.setItemPage(1); }}
                >
                  <option value="">Semua kode group</option>
                  {groupList.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>
            </div>
            <AgingPager
              label={aging.itemLoading ? "Memuat barang..." : "Barang cabang ini"}
              pagination={aging.itemPagination}
              page={aging.itemPage}
              loading={aging.itemLoading}
              onPrev={() => aging.setItemPage((page) => Math.max(1, page - 1))}
              onNext={() => aging.setItemPage((page) => page + 1)}
            />
          </div>
          <div className="aging-panel-meta">
            <span>
              Menampilkan {formatInteger(aging.items.length)} dari {formatInteger(aging.itemPagination?.total || 0)} barang
            </span>
            <span>
              Ukuran halaman {formatInteger(itemLimit)} barang
            </span>
          </div>

          <div className="aging-panel-scroll">
            {aging.items.length === 0 ? (
              <article className="aging-empty">
                <strong>Belum ada item untuk cabang ini</strong>
                <small>{aging.error || "Pilih cabang untuk melihat breakdown barang."}</small>
              </article>
            ) : (
              aging.items.map((item) => (
                <ItemRowContent
                  key={`${item.kode_barcode}-${item.kode_baki}`}
                  item={item}
                  onBarcodeClick={(clickedItem) => setSelectedItem(clickedItem)}
                />
              ))
            )}
          </div>
        </GlassCard>
      </section>

      {isSettingsOpen ? (
        <div
          className="aging-modal-backdrop"
          role="presentation"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div className="aging-modal-shell" role="presentation" onClick={(event) => event.stopPropagation()}>
            <GlassCard className="aging-modal" tone="default">
              <div className="aging-settings-head">
                <div>
                  <p className="eyebrow">Aging Settings</p>
                  <h3>Atur bucket range aging</h3>
                </div>
                <span>Edit range dan simpan ke Mongo</span>
              </div>

              <div className="aging-setting-header">
                <span>#</span>
                <span>Label</span>
                <span>Min</span>
                <span>Max</span>
                <span>Warna</span>
                <span>Aksi</span>
              </div>

              <div className="aging-setting-list">
                {draftBuckets.map((bucket, index) => (
                  <AgingSettingRow
                    key={bucket.key || index}
                    bucket={bucket}
                    index={index}
                    onChange={handleBucketChange}
                    onRemove={handleRemoveBucket}
                    removable={draftBuckets.length > 2}
                    errorMessage={bucketErrors[index]}
                  />
                ))}
              </div>

              <div className="aging-settings-tools">
                <button type="button" className="aging-action-btn" onClick={handleAddBucket}>
                  Tambah Bucket
                </button>
                <button type="button" className="aging-action-btn" onClick={handleOpenExcludeDialog}>
                  Exclude Database Aging
                </button>
                <small>{formatInteger(excludedDatabasesDraft.length)} database di-exclude</small>
              </div>

              <div className="aging-modal-actions">
                <button type="button" className="aging-action-btn" onClick={() => setIsSettingsOpen(false)}>
                  Close
                </button>
                <button
                  type="button"
                  className="aging-action-btn is-primary"
                  onClick={handleSaveSettings}
                  disabled={aging.isSaving}
                >
                  {aging.isSaving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {isExcludePasswordOpen ? (
        <div className="aging-modal-backdrop" role="presentation" onClick={() => setIsExcludePasswordOpen(false)}>
          <div className="aging-modal-shell aging-auth-shell" role="presentation" onClick={(event) => event.stopPropagation()}>
            <GlassCard className="aging-modal aging-auth-modal" tone="default">
              <div className="aging-settings-head">
                <div>
                  <p className="eyebrow">Akses Terbatas</p>
                  <h3>Masukkan password</h3>
                </div>
                <span>Diperlukan untuk membuka Exclude Database Aging</span>
              </div>
              <input
                type="password"
                className="aging-setting-input"
                placeholder="Password"
                value={excludePassword}
                onChange={(event) => setExcludePassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleVerifyExcludePassword();
                  }
                }}
              />
              {excludePasswordError ? <small className="aging-setting-error">{excludePasswordError}</small> : null}
              <div className="aging-modal-actions">
                <button type="button" className="aging-action-btn" onClick={() => setIsExcludePasswordOpen(false)}>
                  Close
                </button>
                <button type="button" className="aging-action-btn is-primary" onClick={handleVerifyExcludePassword}>
                  Buka
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {isExcludeDialogOpen ? (
        <div className="aging-modal-backdrop" role="presentation" onClick={() => setIsExcludeDialogOpen(false)}>
          <div className="aging-modal-shell" role="presentation" onClick={(event) => event.stopPropagation()}>
            <GlassCard className="aging-modal" tone="default">
              <div className="aging-settings-head">
                <div>
                  <p className="eyebrow">Exclude Database Aging</p>
                  <h3>Pilih database yang ingin di-exclude</h3>
                </div>
                <span>{formatInteger(excludedDatabasesDraft.length)} database di-exclude</span>
              </div>
              <div className="aging-db-settings-list">
                {(aging.settings?.available_databases || []).length === 0 ? (
                  <small>Daftar database belum tersedia.</small>
                ) : (
                  (aging.settings?.available_databases || []).map((dbName) => (
                    <label key={dbName} className="aging-db-item">
                      <input
                        type="checkbox"
                        checked={excludedDatabasesDraft.includes(dbName)}
                        onChange={() => toggleExcludedDatabase(dbName)}
                      />
                      <span>{dbName}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="aging-modal-actions">
                <button type="button" className="aging-action-btn" onClick={() => setIsExcludeDialogOpen(false)}>
                  Close
                </button>
                <button
                  type="button"
                  className="aging-action-btn is-primary"
                  onClick={handleSaveExcludedDatabases}
                  disabled={aging.isSaving}
                >
                  {aging.isSaving ? "Saving..." : "Save Exclude"}
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {selectedItem ? (
        <div
          className="aging-modal-backdrop"
          role="presentation"
          onClick={() => setSelectedItem(null)}
        >
          <div className="aging-modal-shell" role="presentation" onClick={(event) => event.stopPropagation()}>
            <div className="aging-item-modal">
              <div className="aging-item-modal-head">
                <div>
                  <p className="eyebrow">Detail Barang</p>
                  <h3>{encryptor.doDecrypt(selectedItem.nama_barang) || "Nama barang belum tersedia"}</h3>
                </div>
                <button type="button" className="aging-action-btn" onClick={() => setSelectedItem(null)}>
                  Close
                </button>
              </div>

              <div className="aging-item-modal-grid">
                <div className="aging-item-modal-image">
                  {selectedItemLoadingImage ? (
                    <div className="aging-image-placeholder">Memuat gambar...</div>
                  ) : selectedItemImage ? (
                    <img src={selectedItemImage} alt={selectedItem.nama_barang || selectedItem.kode_barcode || "Barang"} />
                  ) : (
                    <div className="aging-image-placeholder">Gambar tidak ditemukan di Firebase</div>
                  )}
                </div>

                <div className="aging-item-modal-info">
                  <div><span>Barcode</span><strong>{selectedItem.kode_barcode || "-"}</strong></div>
                  <div><span>Nama</span><strong>{encryptor.doDecrypt(selectedItem.nama_barang) || "-"}</strong></div>
                  <div><span>Kode Dept</span><strong>{selectedItem.kode_dept || "-"}</strong></div>
                  <div><span>Kode Group</span><strong>{selectedItem.kode_group || "-"}</strong></div>
                  <div><span>Kode Baki</span><strong>{selectedItem.kode_baki || "-"}</strong></div>
                  <div><span>Kode Gudang</span><strong>{selectedItem.kode_gudang || "-"}</strong></div>
                  <div><span>Stock On Hand</span><strong>{formatInteger(selectedItem.stock_on_hand || 0)}</strong></div>
                  <div><span>Berat</span><strong>{formatMetric(selectedItem.berat || 0, "gr")}</strong></div>
                  <div><span>Berat Asli</span><strong>{formatMetric(selectedItem.berat_asli || 0, "gr")}</strong></div>
                  <div><span>Berat Bruto</span><strong>{formatMetric(selectedItem.berat_bruto || 0, "gr")}</strong></div>
                  <div><span>Umur Barang</span><strong>{selectedItem.umur_barang ?? "-"} hari</strong></div>
                  <div><span>Tgl Last Beli</span><strong>{selectedItem.tgl_last_beli || "-"}</strong></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {superuserPromptOpen && (
        <div className="superuser-password-overlay" onClick={() => setSuperuserPromptOpen(false)}>
          <div className="superuser-password-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Password Superuser</h3>
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.84rem" }}>Diperlukan password superuser untuk melihat nilai berat.</p>
            <input
              type="password"
              className="aging-setting-input"
              placeholder="Password superuser"
              value={superuserPassword}
              onChange={(e) => setSuperuserPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleVerifySuperuser(); }}
              autoFocus
            />
            {superuserError && <small className="aging-setting-error">{superuserError}</small>}
            <div className="aging-modal-actions">
              <button type="button" className="aging-action-btn" onClick={() => setSuperuserPromptOpen(false)}>Batal</button>
              <button type="button" className="aging-action-btn is-primary" onClick={handleVerifySuperuser}>Verifikasi</button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
