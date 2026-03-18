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
  classifyBarangPosition
};
