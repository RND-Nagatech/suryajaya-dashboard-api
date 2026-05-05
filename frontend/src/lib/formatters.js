const compactFormatter = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  maximumFractionDigits: 1
});

const decimalFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 3
});

const integerFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0
});

const timestampFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const clockFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

export function formatCompactNumber(value) {
  return compactFormatter.format(Number(value || 0));
}

export function formatInteger(value) {
  return integerFormatter.format(Number(value || 0));
}

export function formatDecimal(value) {
  return decimalFormatter.format(Number(value || 0));
}

export function formatMetric(value, unit) {
  const number = Math.abs(Number(value || 0)) >= 1000
    ? formatCompactNumber(value)
    : formatDecimal(value);

  return unit ? `${number} ${unit}` : number;
}

export function formatTimestamp(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return timestampFormatter.format(date);
}

export function formatClock(date) {
  return clockFormatter.format(date);
}

export function formatRelativeFreshness(lastUpdated) {
  if (!lastUpdated) {
    return "Menunggu sinkronisasi";
  }

  const diffMs = Date.now() - new Date(lastUpdated).getTime();
  const diffSeconds = Math.max(Math.round(diffMs / 1000), 0);

  if (diffSeconds < 10) {
    return "Baru";
  }

  if (diffSeconds < 60) {
    return `${diffSeconds} dtk lalu`;
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} mnt lalu`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours} jam lalu`;
}
