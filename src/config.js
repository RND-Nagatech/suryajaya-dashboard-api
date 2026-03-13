const requiredEnv = [
  "GROSIR_MONGO_URI",
  "PUSAT_MONGO_URI"
];

function ensureEnv() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
}

function getConfig() {
  ensureEnv();

  return {
    port: Number(process.env.PORT || 3301),
    grosirMongoUri: process.env.GROSIR_MONGO_URI,
    pusatMongoUri: process.env.PUSAT_MONGO_URI,
    grosirDbName: process.env.GROSIR_DB_NAME || "grosir-suryajaya",
    pusatDbName: process.env.PUSAT_DB_NAME || "db_suryajaya_pusat",
    collections: {
      grosirStock: process.env.GROSIR_STOCK_COLLECTION || "tm_stock_barang",
      grosirTransfer: process.env.GROSIR_TRANSFER_COLLECTION || "tt_kirim_stock",
      pusatKeepStock: process.env.PUSAT_KEEP_STOCK_COLLECTION || "tt_terima_suplier",
      pusatBarang: process.env.PUSAT_BARANG_COLLECTION || "tm_barang"
    }
  };
}

module.exports = {
  getConfig
};
