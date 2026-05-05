function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getPagination(query, defaults = {}) {
  const page = toPositiveNumber(query.page, defaults.page || 1);
  const limit = Math.min(toPositiveNumber(query.limit, defaults.limit || 20), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

function round3(value) {
  return Number(Number(value || 0).toFixed(3));
}

function parseYmdDate(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateToYmd(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function calculateAgeDays(tglLastBeli, asOfDate = formatDateToYmd()) {
  const lastBeliDate = parseYmdDate(tglLastBeli);
  const asOf = parseYmdDate(asOfDate);

  if (!lastBeliDate || !asOf) {
    return null;
  }

  const diffMs = asOf.getTime() - lastBeliDate.getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
}

function parseCommaSeparatedList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveBranchDatabases({
  requestedDbs,
  defaultDbs = [],
  availableDbs = [],
  excludedDbs = []
}) {
  const requestedList = parseCommaSeparatedList(requestedDbs);
  const baseList = requestedList.length
    ? requestedList
    : (availableDbs.length ? availableDbs : defaultDbs);
  const excluded = new Set(excludedDbs);
  const available = new Set(availableDbs);
  const resolved = [];
  const seen = new Set();

  for (const dbName of baseList) {
    if (!dbName || seen.has(dbName) || excluded.has(dbName)) {
      continue;
    }

    if (availableDbs.length && !available.has(dbName)) {
      throw new Error(`Branch database not found: ${dbName}`);
    }

    seen.add(dbName);
    resolved.push(dbName);
  }

  return resolved;
}

function buildStringDateMatch(startDate, endDate) {
  const match = {};

  if (startDate) {
    match.$gte = startDate;
  }

  if (endDate) {
    match.$lte = endDate;
  }

  return Object.keys(match).length ? match : null;
}

function buildJsDateMatch(startDate, endDate) {
  const match = {};

  if (startDate) {
    match.$gte = new Date(`${startDate}T00:00:00.000Z`);
  }

  if (endDate) {
    match.$lte = new Date(`${endDate}T23:59:59.999Z`);
  }

  return Object.keys(match).length ? match : null;
}

function normalizeTransferStatus(item) {
  if (item.status_terima === true) {
    return "received";
  }

  if (item.status_valid === true) {
    return "validated";
  }

  return "pending";
}

function classifyBarangPosition(item) {
  const kodeToko = String(item.kode_toko || "");
  const kodeTokoCabang = String(item.kode_toko_cabang || "");

  if (/KOM/i.test(kodeToko)) {
    return "KOM";
  }

  if (/BRC/i.test(kodeToko) || kodeTokoCabang === "BRC") {
    return "BRC";
  }

  return "CABANG";
}

const DEFAULT_AGING_BUCKETS = [
  { key: "age_1_30", label: "1-30 Hari", min_age: 0, max_age: 30 },
  { key: "age_31_60", label: "31-60 Hari", min_age: 31, max_age: 60 },
  { key: "age_61_90", label: "61-90 Hari", min_age: 61, max_age: 90 },
  { key: "age_91_120", label: "91-120 Hari", min_age: 91, max_age: 120 },
  { key: "age_121_plus", label: ">120 Hari", min_age: 121, max_age: null }
];

function normalizeAgingBuckets(inputBuckets = DEFAULT_AGING_BUCKETS) {
  const source = Array.isArray(inputBuckets) && inputBuckets.length ? inputBuckets : DEFAULT_AGING_BUCKETS;

  return source.map((bucket, index) => {
    const minAge = Number(bucket?.min_age);
    const maxAge = bucket?.max_age === null || bucket?.max_age === undefined || bucket?.max_age === ""
      ? null
      : Number(bucket.max_age);

    return {
      key: String(bucket?.key || `bucket_${index + 1}`),
      label: String(bucket?.label || `Bucket ${index + 1}`),
      min_age: Number.isFinite(minAge) ? minAge : (index === 0 ? 0 : 1),
      max_age: Number.isFinite(maxAge) ? maxAge : null
    };
  });
}

function classifyAgeBucket(ageDays, buckets = DEFAULT_AGING_BUCKETS) {
  if (!Number.isFinite(Number(ageDays))) {
    return null;
  }

  const normalizedBuckets = normalizeAgingBuckets(buckets);
  const age = Number(ageDays);

  return normalizedBuckets.find((bucket) => {
    if (age < bucket.min_age) {
      return false;
    }

    if (bucket.max_age === null) {
      return true;
    }

    return age <= bucket.max_age;
  }) || null;
}

module.exports = {
  getPagination,
  round3,
  parseYmdDate,
  formatDateToYmd,
  calculateAgeDays,
  parseCommaSeparatedList,
  resolveBranchDatabases,
  buildStringDateMatch,
  buildJsDateMatch,
  normalizeTransferStatus,
  classifyBarangPosition,
  DEFAULT_AGING_BUCKETS,
  normalizeAgingBuckets,
  classifyAgeBucket
};
