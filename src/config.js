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
    branchAgingDbName: process.env.BRANCH_AGING_DB_NAME || "r22a",
    branchAgingConcurrency: Number(process.env.BRANCH_AGING_CONCURRENCY || 6),
    branchAgingDbTimeoutMs: Number(process.env.BRANCH_AGING_DB_TIMEOUT_MS || 45000),
    excludedBranchDbNames: [
      "a",
      "admin",
      "b",
      "config",
      "db_buku_besar",
      "db_dashboard",
      "db_member_suryajaya",
      "db_member_suyajaya",
      "db_payroll_suryajaya",
      "db_rpc_member",
      "db_suryajaya_password_changer_logs",
      "db_suryajaya_produksi",
      "db_syarifah",
      "db_trial_suryajaya_produksi",
      "qc_rpc_suryajaya",
      "test",
      "tp",
      "trial_2",
      "trial_bukit_mas",
      "grosir_suryajaya",
      "grosir-suryajaya",
      "gsj",
      "local"
    ],
    collections: {
      grosirStock: process.env.GROSIR_STOCK_COLLECTION || "tm_stock_barang",
      grosirTransfer: process.env.GROSIR_TRANSFER_COLLECTION || "tt_kirim_stock",
      pusatKeepStock: process.env.PUSAT_KEEP_STOCK_COLLECTION || "tt_terima_suplier",
      pusatBarang: process.env.PUSAT_BARANG_COLLECTION || "tm_barang",
      branchBarang: process.env.BRANCH_BARANG_COLLECTION || "tm_barang",
      branchSystem: process.env.BRANCH_SYSTEM_COLLECTION || "tp_system",
      branchAgingSettings: process.env.BRANCH_AGING_SETTINGS_COLLECTION || "dashboard_aging_settings",
      branchAgingJobs: process.env.BRANCH_AGING_JOBS_COLLECTION || "dashboard_aging_jobs",
      branchAgingJobBranches: process.env.BRANCH_AGING_JOB_BRANCHES_COLLECTION || "dashboard_aging_job_branches",
      labelSettings: process.env.LABEL_SETTINGS_COLLECTION || "dashboard_label_settings",
      users: process.env.USERS_COLLECTION || "dashboard_users",
      groupMaster: process.env.GROUP_MASTER_COLLECTION || "tm_group"
    }
  };
}

module.exports = {
  getConfig
};
