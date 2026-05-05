import { useEffect, useState } from "react";
import { GlassCard } from "./components/GlassCard";
import { AgingPage } from "./components/AgingPage";
import { useDashboardData } from "./hooks/useDashboardData";
import {
  formatClock,
  formatInteger,
  formatMetric,
  formatRelativeFreshness,
  formatTimestamp
} from "./lib/formatters";

const PAGE_TABS = [
  { id: "focus", label: "Page 1" },
  { id: "dashboard", label: "Page 2" }
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
      <span>{label}</span>
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

function FocusMetricCard({ point, metric }) {
  return (
    <GlassCard className="focus-value-card" tone="default">
      <div className="focus-card-topline">
        <p>{point.label}</p>
      </div>
      <strong>{metric.value}</strong>
      <small>{metric.meta}</small>
    </GlassCard>
  );
}

function FocusPage({ backgroundAsset, locations, keepStock, buckets }) {
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

        {FOCUS_POINTS.map((point) => (
          <div key={point.id}>
            <button
              type="button"
              className={`focus-pin focus-pin-${point.id}`}
              style={point.pointStyle}
              aria-label={point.label}
            />
            <div className="focus-card-wrap" style={point.cardStyle}>
              <FocusMetricCard point={point} metric={focusMetrics[point.valueKey]} />
            </div>
          </div>
        ))}

      </div>
    </section>
  );
}

function DashboardPage() {
  return (
    <section className="dashboard-scene is-aging">
      <AgingPage enabled />
    </section>
  );
}

export default function App() {
  const now = useCommandClock();
  const backgroundAsset = "/background_final.png";
  const [activePage, setActivePage] = useState("focus");
  const { data, error, loading, isRefreshing, lastUpdated, stale } = useDashboardData(activePage);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  const overview = data?.overviewMetrics;

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
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
                <p className="eyebrow">Suryajaya</p>
                <h1>Command Center Stock Monitor</h1>
              </div>
            </div>

            <PageTabs activePage={activePage} onChange={setActivePage} />

            <div className="nav-side">
              <button
                type="button"
                className={`fullscreen-toggle ${isFullscreen ? "is-active" : ""}`}
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
              <GlowBadge label="Jam" value={formatClock(now)} tone="glass" />
              <GlowBadge
                label="Refresh"
                value={loading ? "Memuat" : isRefreshing ? "Sync..." : formatRelativeFreshness(lastUpdated)}
                tone={stale ? "amber" : "lime"}
              />
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
            />
          ) : (
            <DashboardPage />
          )}
        </div>
      </div>
    </main>
  );
}
