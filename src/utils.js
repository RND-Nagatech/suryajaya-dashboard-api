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
  buildStringDateMatch,
  buildJsDateMatch,
  normalizeTransferStatus,
  classifyBarangPosition
};
