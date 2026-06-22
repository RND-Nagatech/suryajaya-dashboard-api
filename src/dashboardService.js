const { ObjectId } = require("mongodb");
const {
  getPagination,
  round3,
  buildStringDateMatch,
  buildJsDateMatch,
  calculateAgeDays,
  parseYmdDate,
  formatDateToYmd,
  resolveBranchDatabases,
  DEFAULT_AGING_BUCKETS,
  normalizeAgingBuckets,
  classifyAgeBucket
} = require("./utils");

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function shiftYmdDate(value, deltaDays) {
  if (!value || !Number.isFinite(deltaDays)) {
    return null;
  }

  const base = value instanceof Date
    ? new Date(value.getTime())
    : new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);

  if (Number.isNaN(base.getTime())) {
    return null;
  }

  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function withTimeout(operation, timeoutMs, label = "operation") {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return operation;
  }

  let timeoutHandle = null;
  const guarded = Promise.resolve(operation)
    .then((value) => ({ ok: true, value }))
    .catch((error) => ({ ok: false, error }));

  const timeout = new Promise((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({
        ok: false,
        error: new Error(`${label} timeout after ${timeoutMs}ms`)
      });
    }, timeoutMs);
  });

  const result = await Promise.race([guarded, timeout]);
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

class DashboardService {
  constructor(dbs, config) {
    this.grosirDb = dbs.grosirDb;
    this.pusatDb = dbs.pusatDb;
    this.dashboardDb = dbs.dashboardDb || null;
    this.getBranchDb = dbs.getBranchDb;
    this.listBranchDbNames = dbs.listBranchDbNames;
    this.config = config;
  }

  grosirStockCollection() {
    return this.grosirDb.collection(this.config.collections.grosirStock);
  }

  grosirTransferCollection() {
    return this.grosirDb.collection(this.config.collections.grosirTransfer);
  }

  pusatKeepCollection() {
    return this.pusatDb.collection(this.config.collections.pusatKeepStock);
  }

  pusatBarangCollection() {
    return this.pusatDb.collection(this.config.collections.pusatBarang);
  }

  branchBarangCollection(dbName) {
    return this.getBranchDb(dbName).collection(this.config.collections.branchBarang);
  }

  branchSystemCollection(dbName) {
    return this.getBranchDb(dbName).collection(this.config.collections.branchSystem);
  }

  agingSettingsCollection() {
    return this.pusatDb.collection(this.config.collections.branchAgingSettings);
  }

  labelSettingsCollection() {
    return this.pusatDb.collection(this.config.collections.labelSettings);
  }

  usersCollection() {
    return this.pusatDb.collection(this.config.collections.users);
  }

  groupMasterCollection() {
    return this.pusatDb.collection(this.config.collections.groupMaster);
  }

  async getExcludedGroups() {
    const doc = await this.labelSettingsCollection().findOne({ _id: "aging_exclude_groups" });
    return Array.isArray(doc?.groups) ? doc.groups : [];
  }

  async buildExcludeGroupFilter() {
    const excluded = await this.getExcludedGroups();
    if (!excluded.length) return null;
    return { kode_group: { $nin: excluded } };
  }

  /**
   * Resolve the effective list of branch databases for a user.
   * If userBranchDatabases is non-empty, returns only those that exist
   * in available databases. If empty/null/undefined, returns all available.
   */
  async getEffectiveBranchDatabases(userBranchDatabases) {
    const allDbs = this.listBranchDbNames ? await this.listBranchDbNames() : [];
    const normalizedAll = [...new Set((allDbs || []).map((item) => String(item || "").trim()).filter(Boolean))].sort();

    if (!Array.isArray(userBranchDatabases) || !userBranchDatabases.length) {
      return normalizedAll;
    }

    const normalizedUser = [...new Set(userBranchDatabases.map((item) => String(item || "").trim()).filter(Boolean))].sort();
    return normalizedUser.filter((db) => normalizedAll.includes(db));
  }

  /**
   * Build a mapping from branch database name → kode_toko, with in-memory cache.
   * Returns: { [dbName]: kode_toko, ... }
   */
  async getBranchKodeTokoMapping() {
    if (this._branchKodeTokoCache) return this._branchKodeTokoCache;

    const allDbs = this.listBranchDbNames ? await this.listBranchDbNames() : [];
    const mapping = Object.create(null);

    const results = await Promise.allSettled(
      allDbs.map((dbName) =>
        this.branchSystemCollection(dbName)
          .findOne({}, { projection: { _id: 0, kode_toko: 1 }, maxTimeMS: 5000 })
          .then((doc) => ({ dbName, kode_toko: doc?.kode_toko ? String(doc.kode_toko).trim() : null }))
      )
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value?.kode_toko) {
        mapping[result.value.dbName] = result.value.kode_toko;
      }
    }

    this._branchKodeTokoCache = mapping;
    return mapping;
  }

  /**
   * Resolve the list of kode_toko values the user is allowed to access.
   * If userBranchDatabases is empty/null → returns null (no filter).
   * Otherwise returns the intersection of mapped kode_toko values.
   */
  async getAllowedKodeTokoList(userBranchDatabases) {
    if (!Array.isArray(userBranchDatabases) || !userBranchDatabases.length) {
      return null;
    }

    const mapping = await this.getBranchKodeTokoMapping();
    const kodeTokoList = userBranchDatabases
      .map((db) => mapping[String(db || "").trim()] || null)
      .filter(Boolean);

    return kodeTokoList.length ? kodeTokoList : null;
  }

  async listGroups() {
    const docs = await this.groupMasterCollection().find(
      {},
      { projection: { _id: 0, kode_group: 1 } }
    ).sort({ kode_group: 1 }).toArray();

    const groups = [...new Set(docs.map((d) => d.kode_group).filter(Boolean))].sort();
    return { data: groups };
  }

  async getExcludeGroupSettings() {
    const doc = await this.labelSettingsCollection().findOne({ _id: "aging_exclude_groups" });
    return {
      data: {
        excluded_groups: Array.isArray(doc?.groups) ? doc.groups : [],
        updated_at: doc?.updated_at || null
      }
    };
  }

  async updateExcludeGroupSettings(payload) {
    const groups = [...new Set(
      (Array.isArray(payload?.excluded_groups) ? payload.excluded_groups : [])
        .map((g) => String(g || "").trim())
        .filter(Boolean)
    )].sort();

    const now = new Date().toISOString();
    await this.labelSettingsCollection().updateOne(
      { _id: "aging_exclude_groups" },
      { $set: { groups, updated_at: now }, $setOnInsert: { created_at: now } },
      { upsert: true }
    );

    return { data: { excluded_groups: groups, updated_at: now } };
  }

  async login(payload) {
    const username = String(payload?.username || "").trim();
    const password = String(payload?.password || "");

    if (!username || !password) {
      throw createHttpError("Username dan password wajib diisi", 400);
    }

    const { bcrypt, signToken } = require("./auth");

    // Source 1: Check dashboard_users first
    const localUser = await this.usersCollection().findOne({ _id: username });
    if (localUser) {
      const valid = await bcrypt.compare(password, localUser.password);
      if (!valid) {
        throw createHttpError("Username atau password salah", 401);
      }
      const token = signToken({ username: localUser._id, level: localUser.level });
      return {
        data: {
          token,
          user: { username: localUser._id, level: localUser.level || "operator" }
        }
      };
    }

    // Source 2: Check db_dashboard.tm_user
    if (!this.dashboardDb) {
      throw createHttpError("Username atau password salah", 401);
    }

    const { encryptascii, decryptascii } = require("./encryptor");
    const tmUser = await this.dashboardDb.collection("tm_user").findOne({ user_id: username });
    if (!tmUser) {
      throw createHttpError("Username atau password salah", 401);
    }

    if (!tmUser.status_active) {
      throw createHttpError("Akun tidak aktif", 403);
    }

    const valid = await bcrypt.compare(password, tmUser.password);
    if (!valid) {
      throw createHttpError("Username atau password salah", 401);
    }

    // Lookup chain: tm_user.kode_area → decrypt → tm_area_manager.user_id → tm_toko.kode_toko → db_name → decrypt
    const decryptedKodeArea = decryptascii(String(tmUser.kode_area || "").trim());
    console.log("DECRYPTED KODE AREA", decryptedKodeArea);
    
    const areaManagers = await this.dashboardDb.collection("tm_area_manager")
      .find({ user_id: decryptedKodeArea }, { projection: { _id: 0, kode_toko: 1 } })
      .toArray();
    console.log("LIST AREA MANAGER", areaManagers);
    
    const kodeTokoList = [...new Set(areaManagers.map((am) => am.kode_toko).filter(Boolean))];

    let branchDatabases = [];
    if (kodeTokoList.length > 0) {
      const tokos = await this.dashboardDb.collection("tm_cabang")
        .find({ kode_toko: { $in: kodeTokoList } }, { projection: { _id: 0, db_name: 1 } })
        .toArray();

      branchDatabases = [...new Set(
        tokos
          .map((t) => decryptascii(String(t.db_name || "").trim()))
          .filter(Boolean)
      )].sort();
    }

    // Upsert to dashboard_users with branch_databases
    const level = tmUser.level === "AREA MANAGER" ? "superuser" : "operator";
    const now = new Date().toISOString();
    await this.usersCollection().updateOne(
      { _id: username },
      {
        $set: {
          level,
          branch_databases: branchDatabases,
          source: "db_dashboard",
          updated_at: now
        },
        $setOnInsert: {
          password: tmUser.password,
          created_at: now
        }
      },
      { upsert: true }
    );

    const token = signToken({ username, level });
    return {
      data: {
        token,
        user: { username, level, branch_databases: branchDatabases }
      }
    };
  }

  async verifySuperuser(payload) {
    const password = String(payload?.password || "");
    const { verifySuperuserPassword } = require("./auth");
    const valid = await verifySuperuserPassword(password);
    if (!valid) {
      throw createHttpError("Password superuser salah", 403);
    }
    return { data: { ok: true } };
  }

  async seedDefaultUser() {
    const existing = await this.usersCollection().findOne({ _id: "admin" });
    if (existing) return;

    const { bcrypt } = require("./auth");
    const hash = await bcrypt.hash("admin123", 10);
    const now = new Date().toISOString();
    await this.usersCollection().insertOne({
      _id: "admin",
      password: hash,
      level: "superuser",
      created_at: now,
      updated_at: now
    });
    console.log("Default superuser created: admin / admin123");
  }

  async listUsers() {
    const users = await this.usersCollection().find(
      {},
      { projection: { _id: 1, level: 1, created_at: 1, updated_at: 1 } }
    ).sort({ _id: 1 }).toArray();

    return {
      data: users.map((u) => ({
        username: u._id,
        level: u.level || "operator",
        created_at: u.created_at || null,
        updated_at: u.updated_at || null
      }))
    };
  }

  async createUser(payload) {
    const username = String(payload?.username || "").trim();
    const password = String(payload?.password || "");
    const level = payload?.level === "superuser" ? "superuser" : "operator";

    if (!username || !password) {
      throw createHttpError("Username dan password wajib diisi", 400);
    }

    const exists = await this.usersCollection().findOne({ _id: username });
    if (exists) {
      throw createHttpError("Username sudah digunakan", 409);
    }

    const { bcrypt } = require("./auth");
    const hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    await this.usersCollection().insertOne({
      _id: username,
      password: hash,
      level,
      created_at: now,
      updated_at: now
    });

    return { data: { username, level, created_at: now } };
  }

  async updateUser(username, payload) {
    if (!username) {
      throw createHttpError("Username wajib diisi", 400);
    }

    const user = await this.usersCollection().findOne({ _id: username });
    if (!user) {
      throw createHttpError("User tidak ditemukan", 404);
    }

    const update = { updated_at: new Date().toISOString() };
    if (payload?.level) {
      update.level = payload.level === "superuser" ? "superuser" : "operator";
    }
    if (payload?.password) {
      const { bcrypt } = require("./auth");
      update.password = await bcrypt.hash(String(payload.password), 10);
    }

    await this.usersCollection().updateOne({ _id: username }, { $set: update });
    return { data: { username, updated_at: update.updated_at } };
  }

  async deleteUser(username) {
    if (!username) {
      throw createHttpError("Username wajib diisi", 400);
    }
    if (username === "admin") {
      throw createHttpError("Admin user tidak bisa dihapus", 403);
    }

    const result = await this.usersCollection().deleteOne({ _id: username });
    if (result.deletedCount === 0) {
      throw createHttpError("User tidak ditemukan", 404);
    }

    return { data: { username } };
  }

  agingJobsCollection() {
    return this.pusatDb.collection(this.config.collections.branchAgingJobs);
  }

  agingJobBranchesCollection() {
    return this.pusatDb.collection(this.config.collections.branchAgingJobBranches);
  }

  DEFAULT_LABELS = {
    grosir: "Grosir",
    keepStocks: "Keep Stocks",
    kom: "KOM Stocks",
    brc: "BRC Stocks",
    cabang: "Cabang Stocks"
  };

  shouldIncludeDetails(query) {
    return String(query.include_details || "true").toLowerCase() !== "false";
  }

  async getLabelSettings() {
    const doc = await this.labelSettingsCollection().findOne({ _id: "default" });
    return {
      data: {
        labels: {
          grosir: doc?.labels?.grosir || this.DEFAULT_LABELS.grosir,
          keepStocks: doc?.labels?.keepStocks || this.DEFAULT_LABELS.keepStocks,
          kom: doc?.labels?.kom || this.DEFAULT_LABELS.kom,
          brc: doc?.labels?.brc || this.DEFAULT_LABELS.brc,
          cabang: doc?.labels?.cabang || this.DEFAULT_LABELS.cabang
        },
        updated_at: doc?.updated_at || null
      }
    };
  }

  async updateLabelSettings(payload) {
    const labels = payload?.labels;
    if (!labels || typeof labels !== "object") {
      throw createHttpError("Payload labels wajib diisi", 400);
    }

    const allowedKeys = Object.keys(this.DEFAULT_LABELS);
    const sanitized = {};
    for (const key of allowedKeys) {
      const value = labels[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        sanitized[key] = String(value).trim();
      }
    }

    if (!Object.keys(sanitized).length) {
      throw createHttpError("Minimal satu label harus diisi", 400);
    }

    const now = new Date().toISOString();
    const existing = await this.labelSettingsCollection().findOne({ _id: "default" });

    await this.labelSettingsCollection().updateOne(
      { _id: "default" },
      {
        $set: {
          labels: sanitized,
          updated_at: now
        },
        $setOnInsert: {
          created_at: existing?.created_at || now
        }
      },
      { upsert: true }
    );

    return this.getLabelSettings();
  }

  async getOverview(query) {
    const excludeGroupFilter = await this.buildExcludeGroupFilter();
    const allowedKodeToko = await this.getAllowedKodeTokoList(query.branch_databases);
    const komMatch = { stock_on_hand: 1, kode_toko: { $regex: "KOM", $options: "i" } };
    const brcMatch = { stock_on_hand: 1, kode_toko: { $regex: "BRC", $options: "i" } };
    const cabangMatch = {
      stock_on_hand: 1,
      kode_gudang: "TOKO",
      kode_toko: allowedKodeToko
        ? { $not: /KOM|BRC/i, $in: allowedKodeToko }
        : { $not: /KOM|BRC/i }
    };
    if (excludeGroupFilter) {
      Object.assign(komMatch, excludeGroupFilter);
      Object.assign(brcMatch, excludeGroupFilter);
      Object.assign(cabangMatch, excludeGroupFilter);
    }

    const [grosirSummary, transferPending, transferReceived, keepSummary, komSummary, brcSummary, cabangSummary] = await Promise.all([
      this.grosirStockCollection().aggregate([
        {
          $group: {
            _id: null,
            total_qty: { $sum: { $ifNull: ["$total_qty", 0] } },
            total_bruto: { $sum: { $ifNull: ["$total_bruto", 0] } },
            total_gross: { $sum: { $ifNull: ["$total_gross", 0] } },
            total_netto: { $sum: { $ifNull: ["$total_netto", 0] } }
          }
        }
      ]).toArray(),
      this.grosirTransferCollection().aggregate([
        { $match: { status_terima: false } },
        {
          $addFields: {
            total_qty_doc: {
              $sum: {
                $map: {
                  input: { $ifNull: ["$detail_barang", []] },
                  as: "detail",
                  in: { $toDouble: { $ifNull: ["$$detail.qty", 0] } }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            total_doc: { $sum: 1 },
            total_qty: { $sum: "$total_qty_doc" },
            total_bruto: { $sum: { $ifNull: ["$total_bruto", 0] } },
            total_netto: { $sum: { $ifNull: ["$total_netto", 0] } }
          }
        }
      ]).toArray(),
      this.grosirTransferCollection().aggregate([
        { $match: { status_terima: true } },
        {
          $addFields: {
            total_qty_doc: {
              $sum: {
                $map: {
                  input: { $ifNull: ["$detail_barang", []] },
                  as: "detail",
                  in: { $toDouble: { $ifNull: ["$$detail.qty", 0] } }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            total_doc: { $sum: 1 },
            total_qty: { $sum: "$total_qty_doc" },
            total_bruto: { $sum: { $ifNull: ["$total_bruto", 0] } },
            total_netto: { $sum: { $ifNull: ["$total_netto", 0] } }
          }
        }
      ]).toArray(),
      this.pusatKeepCollection().aggregate([
        {
          $project: {
            qty_real: { $subtract: [{ $ifNull: ["$qty", 0] }, { $ifNull: ["$qty_input", 0] }] },
            berat_real: { $subtract: [{ $ifNull: ["$berat", 0] }, { $ifNull: ["$berat_input", 0] }] }
          }
        },
        {
          $group: {
            _id: null,
            total_doc: { $sum: 1 },
            total_qty_real: { $sum: "$qty_real" },
            total_berat_real: { $sum: "$berat_real" }
          }
        }
      ]).toArray(),
      this.pusatBarangCollection().aggregate([
        { $match: komMatch },
        {
          $group: {
            _id: null,
            total_doc: { $sum: 1 },
            total_qty: { $sum: { $ifNull: ["$stock_on_hand", 0] } },
            berat_netto: { $sum: { $ifNull: ["$berat_asli", 0] } },
            berat_bulat: { $sum: { $ifNull: ["$berat", 0] } },
            berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
          }
        }
      ]).toArray(),
      this.pusatBarangCollection().aggregate([
        { $match: brcMatch },
        {
          $group: {
            _id: null,
            total_doc: { $sum: 1 },
            total_qty: { $sum: { $ifNull: ["$stock_on_hand", 0] } },
            berat_netto: { $sum: { $ifNull: ["$berat_asli", 0] } },
            berat_bulat: { $sum: { $ifNull: ["$berat", 0] } },
            berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
          }
        }
      ]).toArray(),
      this.pusatBarangCollection().aggregate([
        { $match: cabangMatch },
        {
          $group: {
            _id: null,
            total_group: { $addToSet: "$kode_toko" },
            total_doc: { $sum: 1 },
            total_qty: { $sum: { $ifNull: ["$stock_on_hand", 0] } },
            berat_netto: { $sum: { $ifNull: ["$berat_asli", 0] } },
            berat_bulat: { $sum: { $ifNull: ["$berat", 0] } },
            berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
          }
        },
        {
          $project: {
            _id: 0,
            total_group: { $size: "$total_group" },
            total_doc: 1,
            total_qty: 1,
            berat_netto: 1,
            berat_bulat: 1,
            berat_bruto: 1
          }
        }
      ]).toArray()
    ]);

    return {
      data: {
        grosir_stock: {
          total_qty: grosirSummary[0]?.total_qty || 0,
          total_bruto: round3(grosirSummary[0]?.total_bruto || 0),
          total_gross: round3(grosirSummary[0]?.total_gross || 0),
          total_netto: round3(grosirSummary[0]?.total_netto || 0)
        },
        transfer_pending: {
          total_doc: transferPending[0]?.total_doc || 0,
          total_qty: transferPending[0]?.total_qty || 0,
          total_bruto: round3(transferPending[0]?.total_bruto || 0),
          total_netto: round3(transferPending[0]?.total_netto || 0)
        },
        transfer_received: {
          total_doc: transferReceived[0]?.total_doc || 0,
          total_qty: transferReceived[0]?.total_qty || 0,
          total_bruto: round3(transferReceived[0]?.total_bruto || 0),
          total_netto: round3(transferReceived[0]?.total_netto || 0)
        },
        pusat_keep_stock: {
          total_doc: keepSummary[0]?.total_doc || 0,
          total_qty_real: keepSummary[0]?.total_qty_real || 0,
          total_berat_real: round3(keepSummary[0]?.total_berat_real || 0)
        },
        kom_stock: {
          total_doc: komSummary[0]?.total_doc || 0,
          total_qty: komSummary[0]?.total_qty || 0,
          berat_netto: round3(komSummary[0]?.berat_netto || 0),
          berat_bulat: round3(komSummary[0]?.berat_bulat || 0),
          berat_bruto: round3(komSummary[0]?.berat_bruto || 0)
        },
        brc_stock: {
          total_doc: brcSummary[0]?.total_doc || 0,
          total_qty: brcSummary[0]?.total_qty || 0,
          berat_netto: round3(brcSummary[0]?.berat_netto || 0),
          berat_bulat: round3(brcSummary[0]?.berat_bulat || 0),
          berat_bruto: round3(brcSummary[0]?.berat_bruto || 0)
        },
        cabang_stock_grouped_count: {
          total_group: cabangSummary[0]?.total_group || 0,
          total_doc: cabangSummary[0]?.total_doc || 0,
          total_qty: cabangSummary[0]?.total_qty || 0,
          berat_netto: round3(cabangSummary[0]?.berat_netto || 0),
          berat_bulat: round3(cabangSummary[0]?.berat_bulat || 0),
          berat_bruto: round3(cabangSummary[0]?.berat_bruto || 0)
        }
      }
    };
  }

  async getGrosirStocks(query) {
    const excludedLokasi = ["PUSAT", "HANCUR", "REV", "DEFAULT"];
    const match = {
      $and: [
        {
          kode_lokasi: { $nin: excludedLokasi }
        }
      ]
    };
    const includeDetails = this.shouldIncludeDetails(query);

    if (query.kode_lokasi) {
      match.$and.push({ kode_lokasi: query.kode_lokasi });
    }

    if (query.kode_jenis) {
      match.kode_jenis = query.kode_jenis;
    }

    if (query.search) {
      match.$or = [
        { kode_lokasi: { $regex: query.search, $options: "i" } },
        { kode_jenis: { $regex: query.search, $options: "i" } }
      ];
    }

    const summaryPromise = this.grosirStockCollection().aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total_row: { $sum: 1 },
          total_qty: { $sum: { $ifNull: ["$total_qty", 0] } },
          total_bruto: { $sum: { $ifNull: ["$total_bruto", 0] } },
          total_gross: { $sum: { $ifNull: ["$total_gross", 0] } },
          total_netto: { $sum: { $ifNull: ["$total_netto", 0] } },
          total_berat_atribut: { $sum: { $ifNull: ["$total_berat_atribut", 0] } }
        }
      }
    ]).toArray();

    const perLokasiPromise = includeDetails
      ? this.grosirStockCollection().aggregate([
        { $match: match },
        {
          $group: {
            _id: "$kode_lokasi",
            total_qty: { $sum: { $ifNull: ["$total_qty", 0] } },
            total_bruto: { $sum: { $ifNull: ["$total_bruto", 0] } },
            total_gross: { $sum: { $ifNull: ["$total_gross", 0] } },
            total_netto: { $sum: { $ifNull: ["$total_netto", 0] } }
          }
        },
        {
          $project: {
            _id: 0,
            kode_lokasi: "$_id",
            total_qty: 1,
            total_bruto: { $round: ["$total_bruto", 3] },
            total_gross: { $round: ["$total_gross", 3] },
            total_netto: { $round: ["$total_netto", 3] }
          }
        },
        { $sort: { total_netto: -1, kode_lokasi: 1 } }
      ]).toArray()
      : Promise.resolve([]);

    const [summary, perLokasi] = await Promise.all([
      summaryPromise,
      perLokasiPromise
    ]);

    return {
      data: {
        total_row: summary[0]?.total_row || 0,
        total_qty: summary[0]?.total_qty || 0,
        total_bruto: round3(summary[0]?.total_bruto || 0),
        total_gross: round3(summary[0]?.total_gross || 0),
        total_netto: round3(summary[0]?.total_netto || 0),
        total_berat_atribut: round3(summary[0]?.total_berat_atribut || 0),
        per_lokasi: perLokasi
      }
    };
  }

  async getTransfers(query) {
    const match = {};
    const includeDetails = this.shouldIncludeDetails(query);
    const dateMatch = buildStringDateMatch(query.start_date, query.end_date);

    if (dateMatch) {
      match.tanggal = dateMatch;
    }

    if (query.status === "pending") {
      match.status_terima = false;
    }

    if (query.status === "received") {
      match.status_terima = true;
    }

    if (query.kode_toko) {
      match.kode_toko = query.kode_toko;
    }

    if (query.kode_lokasi) {
      match.kode_lokasi = query.kode_lokasi;
    }

    if (query.search) {
      match.$or = [
        { no_kirim: { $regex: query.search, $options: "i" } },
        { no_bon: { $regex: query.search, $options: "i" } }
      ];
    }

    const summaryPromise = this.grosirTransferCollection().aggregate([
        { $match: match },
        {
          $addFields: {
            total_qty_doc: {
              $sum: {
                $map: {
                  input: { $ifNull: ["$detail_barang", []] },
                  as: "detail",
                  in: { $toDouble: { $ifNull: ["$$detail.qty", 0] } }
                }
              }
            },
            tanggal_output: {
              $cond: [{ $eq: ["$status_terima", true] }, "$terima_date", "$validate_date"]
            }
          }
        },
        {
          $group: {
            _id: null,
            total_doc: { $sum: 1 },
            total_qty: { $sum: "$total_qty_doc" },
            total_bruto: { $sum: { $ifNull: ["$total_bruto", 0] } },
            total_netto: { $sum: { $ifNull: ["$total_netto", 0] } },
            last_tanggal_output: { $max: "$tanggal_output" }
          }
        }
      ]).toArray();

    const perTanggalPromise = includeDetails
      ? this.grosirTransferCollection().aggregate([
        { $match: match },
        {
          $addFields: {
            total_qty_doc: {
              $sum: {
                $map: {
                  input: { $ifNull: ["$detail_barang", []] },
                  as: "detail",
                  in: { $toDouble: { $ifNull: ["$$detail.qty", 0] } }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: "$tanggal",
            total_doc: { $sum: 1 },
            total_qty: { $sum: "$total_qty_doc" },
            total_bruto: { $sum: { $ifNull: ["$total_bruto", 0] } },
            total_netto: { $sum: { $ifNull: ["$total_netto", 0] } }
          }
        },
        {
          $project: {
            _id: 0,
            tanggal: "$_id",
            total_doc: 1,
            total_qty: 1,
            total_bruto: { $round: ["$total_bruto", 3] },
            total_netto: { $round: ["$total_netto", 3] }
          }
        },
        { $sort: { tanggal: -1 } }
      ]).toArray()
      : Promise.resolve([]);

    const [summary, perTanggal] = await Promise.all([summaryPromise, perTanggalPromise]);

    return {
      data: {
        status: query.status || "all",
        total_doc: summary[0]?.total_doc || 0,
        total_qty: summary[0]?.total_qty || 0,
        total_bruto: round3(summary[0]?.total_bruto || 0),
        total_netto: round3(summary[0]?.total_netto || 0),
        last_tanggal_output: summary[0]?.last_tanggal_output || null,
        per_tanggal: perTanggal
      }
    };
  }

  async getKeepStocks(query) {
    const match = {};
    const includeDetails = this.shouldIncludeDetails(query);
    const dateMatch = buildStringDateMatch(query.start_date, query.end_date);

    if (dateMatch) {
      match.tanggal = dateMatch;
    }

    if (query.no_terima) {
      match.no_terima = query.no_terima;
    }

    if (query.kode_toko_cabang) {
      match.kode_toko_cabang = query.kode_toko_cabang;
    }

    if (query.type) {
      match.type = query.type;
    }

    const showZero = String(query.show_zero || "false").toLowerCase() === "true";

    const basePipeline = [
      { $match: match },
      {
        $addFields: {
          qty_real: { $subtract: [{ $ifNull: ["$qty", 0] }, { $ifNull: ["$qty_input", 0] }] },
          berat_real: { $subtract: [{ $ifNull: ["$berat", 0] }, { $ifNull: ["$berat_input", 0] }] }
        }
      }
    ];

    if (!showZero) {
      basePipeline.push({
        $match: {
          $or: [
            { qty_real: { $gt: 0 } },
            { berat_real: { $gt: 0 } }
          ]
        }
      });
    }

    const summaryPromise = this.pusatKeepCollection().aggregate([
        ...basePipeline,
        {
          $group: {
            _id: null,
            total_doc: { $sum: 1 },
            total_qty: { $sum: { $ifNull: ["$qty", 0] } },
            total_qty_input: { $sum: { $ifNull: ["$qty_input", 0] } },
            total_qty_real: { $sum: "$qty_real" },
            total_berat: { $sum: { $ifNull: ["$berat", 0] } },
            total_berat_input: { $sum: { $ifNull: ["$berat_input", 0] } },
            total_berat_real: { $sum: "$berat_real" }
          }
        }
      ]).toArray();

    const perTanggalPromise = includeDetails
      ? this.pusatKeepCollection().aggregate([
        ...basePipeline,
        {
          $group: {
            _id: "$tanggal",
            total_doc: { $sum: 1 },
            total_qty_real: { $sum: "$qty_real" },
            total_berat_real: { $sum: "$berat_real" }
          }
        },
        {
          $project: {
            _id: 0,
            tanggal: "$_id",
            total_doc: 1,
            total_qty_real: 1,
            total_berat_real: { $round: ["$total_berat_real", 3] }
          }
        },
        { $sort: { tanggal: -1 } }
      ]).toArray()
      : Promise.resolve([]);

    const [summary, perTanggal] = await Promise.all([summaryPromise, perTanggalPromise]);

    return {
      data: {
        total_doc: summary[0]?.total_doc || 0,
        total_qty: summary[0]?.total_qty || 0,
        total_qty_input: summary[0]?.total_qty_input || 0,
        total_qty_real: summary[0]?.total_qty_real || 0,
        total_berat: round3(summary[0]?.total_berat || 0),
        total_berat_input: round3(summary[0]?.total_berat_input || 0),
        total_berat_real: round3(summary[0]?.total_berat_real || 0),
        per_tanggal: perTanggal
      }
    };
  }

  async getKomStocks(query) {
    return await this.getBarangByBucket({
      ...query,
      bucket: "KOM"
    });
  }

  async getBrcStocks(query) {
    return await this.getBarangByBucket({
      ...query,
      bucket: "BRC"
    });
  }

  async getCabangStocks(query) {
    const allowedKodeToko = await this.getAllowedKodeTokoList(query.branch_databases);

    const match = {
      stock_on_hand: 1,
      kode_gudang: "TOKO",
      kode_toko: {
        $not: /KOM|BRC/i
      }
    };

    const inputDateMatch = buildJsDateMatch(query.start_date, query.end_date);
    if (inputDateMatch) {
      match.input_date = inputDateMatch;
    }

    if (allowedKodeToko) {
      match.kode_toko = { $not: /KOM|BRC/i, $in: allowedKodeToko };
    } else if (query.kode_toko) {
      match.kode_toko = query.kode_toko;
    }

    const excludeGroupFilter = await this.buildExcludeGroupFilter();
    if (excludeGroupFilter) {
      Object.assign(match, excludeGroupFilter);
    }

    const includeDetails = this.shouldIncludeDetails(query);
    const groupedPipeline = [
      { $match: match },
      {
        $group: {
          _id: "$kode_toko",
          total_doc: { $sum: 1 },
          total_stock_on_hand: { $sum: { $ifNull: ["$stock_on_hand", 0] } },
          total_berat: { $sum: { $ifNull: ["$berat", 0] } },
          total_berat_asli: { $sum: { $ifNull: ["$berat_asli", 0] } },
          total_berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          kode_toko: "$_id",
          total_doc: 1,
          total_stock_on_hand: 1,
          total_berat: { $round: ["$total_berat", 3] },
          total_berat_asli: { $round: ["$total_berat_asli", 3] },
          total_berat_bruto: { $round: ["$total_berat_bruto", 3] }
        }
      },
      {
        $sort: {
          kode_toko: 1
        }
      }
    ];

    const data = includeDetails
      ? await this.pusatBarangCollection().aggregate(groupedPipeline).toArray()
      : [];

    const summary = includeDetails
      ? {
        total_group: data.length,
        total_doc: data.reduce((acc, item) => acc + item.total_doc, 0),
        total_stock_on_hand: data.reduce((acc, item) => acc + item.total_stock_on_hand, 0),
        total_berat: round3(data.reduce((acc, item) => acc + item.total_berat, 0))
      }
      : (await this.pusatBarangCollection().aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total_group: { $addToSet: "$kode_toko" },
            total_doc: { $sum: 1 },
            total_stock_on_hand: { $sum: { $ifNull: ["$stock_on_hand", 0] } },
            total_berat: { $sum: { $ifNull: ["$berat", 0] } }
          }
        },
        {
          $project: {
            _id: 0,
            total_group: { $size: "$total_group" },
            total_doc: 1,
            total_stock_on_hand: 1,
            total_berat: { $round: ["$total_berat", 3] }
          }
        }
      ]).toArray())[0] || {};

    return {
      data: {
        total_group: summary.total_group || 0,
        total_doc: summary.total_doc || 0,
        total_stock_on_hand: summary.total_stock_on_hand || 0,
        total_berat: round3(summary.total_berat || 0),
        groups: data
      }
    };
  }

  async getCabangAgingStocks(query) {
    const asOfDate = formatDateToYmd();
    const targetDb = String(this.config.branchAgingDbName || "r22a").trim();
    const availableDbs = this.listBranchDbNames ? await this.listBranchDbNames() : [];
    const excludeGroupFilter = await this.buildExcludeGroupFilter();

    if (availableDbs.length && !availableDbs.includes(targetDb)) {
      throw createHttpError(`Branch database not found for aging-stocks: ${targetDb}`, 404);
    }

    const selectedDatabases = [targetDb];

    const barangFilter = { stock_on_hand: 1 };
    if (excludeGroupFilter) {
      Object.assign(barangFilter, excludeGroupFilter);
    }

    const branches = await Promise.all(
      selectedDatabases.map(async (dbName) => {
        const barangCollection = this.branchBarangCollection(dbName);
        const systemCollection = this.branchSystemCollection(dbName);
        const [docs, systemDoc] = await Promise.all([
          barangCollection.find(barangFilter,
            {
              projection: {
                _id: 0,
                stock_on_hand: 1,
                kode_barcode: 1,
                kode_gudang: 1,
                kode_group: 1,
                kode_toko: 1,
                kode_dept: 1,
                tgl_last_beli: 1,
                berat: 1,
                berat_asli: 1,
                berat_bruto: 1
              }
            }
          ).toArray(),
          systemCollection.findOne(
            {},
            {
              projection: {
                _id: 0,
                kode_toko: 1
              }
            }
          )
        ]);
        const branchKodeCabang = String(systemDoc?.kode_toko || "").trim() || dbName;

        const enrichedDocs = docs
          .map((item) => ({
            stock_on_hand: item.stock_on_hand || 0,
            kode_barcode: item.kode_barcode || null,
            kode_gudang: item.kode_gudang || null,
            kode_group: item.kode_group || null,
            kode_baki: item.kode_toko || null,
            kode_dept: item.kode_dept || null,
            tgl_last_beli: item.tgl_last_beli || null,
            berat: item.berat || 0,
            berat_asli: item.berat_asli || 0,
            berat_bruto: item.berat_bruto || 0,
            umur_barang: calculateAgeDays(item.tgl_last_beli, asOfDate)
          }))
          .sort((left, right) => {
            const leftAge = left.umur_barang ?? -1;
            const rightAge = right.umur_barang ?? -1;

            if (rightAge !== leftAge) {
              return rightAge - leftAge;
            }

            return String(left.kode_barcode || "").localeCompare(String(right.kode_barcode || ""));
          });

        return {
          kode_cabang: branchKodeCabang,
          as_of_date: asOfDate,
          total_doc: enrichedDocs.length,
          total_stock_on_hand: enrichedDocs.reduce((acc, item) => acc + (item.stock_on_hand || 0), 0),
          total_berat: round3(enrichedDocs.reduce((acc, item) => acc + (item.berat || 0), 0)),
          total_berat_asli: round3(enrichedDocs.reduce((acc, item) => acc + (item.berat_asli || 0), 0)),
          total_berat_bruto: round3(enrichedDocs.reduce((acc, item) => acc + (item.berat_bruto || 0), 0)),
          items: enrichedDocs
        };
      })
    );

    return {
      data: {
        as_of_date: asOfDate,
        selected_databases: selectedDatabases,
        branches
      }
    };
  }

  serializeAgingSettings(doc) {
    const buckets = normalizeAgingBuckets(doc?.buckets || DEFAULT_AGING_BUCKETS);
    const excludedFromConfig = Array.isArray(this.config.excludedBranchDbNames) ? this.config.excludedBranchDbNames : [];
    const excludedFromSettings = Array.isArray(doc?.excluded_databases) ? doc.excluded_databases : [];
    const excludedDatabaseSet = new Set([
      ...excludedFromConfig.map((item) => String(item || "").trim().toLowerCase()),
      ...excludedFromSettings.map((item) => String(item || "").trim().toLowerCase())
    ]);

    return {
      id: doc?._id || "default",
      buckets,
      excluded_databases: excludedFromSettings,
      effective_excluded_databases: [...excludedDatabaseSet].sort(),
      available_databases: Array.isArray(doc?.available_databases) ? doc.available_databases : [],
      created_at: doc?.created_at || null,
      updated_at: doc?.updated_at || null
    };
  }

  serializeAgingJob(doc) {
    if (!doc) {
      return null;
    }

    const progress = doc.progress || {};
    const total = Number(progress.total || 0);
    const processed = Number(progress.processed || 0);
    const completed = Number(progress.completed || 0);
    const failed = Number(progress.failed || 0);
    const bucketSummary = doc.bucket_summary || {};

    return {
      job_id: String(doc._id),
      type: doc.type || "cabang-aging",
      status: doc.status || "queued",
      as_of_date: doc.as_of_date || null,
      selected_databases: doc.selected_databases || [],
      progress: {
        total,
        processed,
        completed,
        failed,
        percent: total > 0 ? Math.round((processed / total) * 100) : 0
      },
      summary_totals: {
        total_doc: Number(doc.summary_totals?.total_doc || 0),
        total_stock_on_hand: Number(doc.summary_totals?.total_stock_on_hand || 0),
        total_berat: round3(doc.summary_totals?.total_berat || 0),
        total_berat_asli: round3(doc.summary_totals?.total_berat_asli || 0),
        total_berat_bruto: round3(doc.summary_totals?.total_berat_bruto || 0)
      },
      settings_snapshot: normalizeAgingBuckets(doc.settings_snapshot || DEFAULT_AGING_BUCKETS),
      buckets: Object.values(bucketSummary).map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        min_age: bucket.min_age,
        max_age: bucket.max_age,
        color: bucket.color || null,
        total_doc: Number(bucket.total_doc || 0),
        total_stock_on_hand: Number(bucket.total_stock_on_hand || 0),
        total_berat: round3(bucket.total_berat || 0),
        total_berat_asli: round3(bucket.total_berat_asli || 0),
        total_berat_bruto: round3(bucket.total_berat_bruto || 0),
        branch_count: Number(bucket.branch_count || 0)
      })),
      errors: doc.errors || [],
      created_at: doc.created_at || null,
      started_at: doc.started_at || null,
      finished_at: doc.finished_at || null,
      updated_at: doc.updated_at || null,
      last_error: doc.last_error || null
    };
  }

  buildAgingBucketTemplate(buckets = DEFAULT_AGING_BUCKETS) {
    return normalizeAgingBuckets(buckets).reduce((acc, bucket) => {
      acc[bucket.key] = {
        key: bucket.key,
        label: bucket.label,
        min_age: bucket.min_age,
        max_age: bucket.max_age,
        color: bucket.color,
        total_doc: 0,
        total_stock_on_hand: 0,
        total_berat: 0,
        total_berat_asli: 0,
        total_berat_bruto: 0,
        branch_count: 0
      };

      return acc;
    }, {});
  }

  validateAgingBuckets(inputBuckets) {
    const buckets = normalizeAgingBuckets(inputBuckets);

    if (buckets.length < 2) {
      throw createHttpError("Aging settings minimal harus berisi 2 bucket", 400);
    }

    const ordered = [...buckets].sort((left, right) => left.min_age - right.min_age);
    const keySet = new Set();

    ordered.forEach((bucket, index) => {
      if (!bucket.label || !String(bucket.label).trim()) {
        throw createHttpError(`Label aging bucket ke-${index + 1} wajib diisi`, 400);
      }

      if (!bucket.key || !String(bucket.key).trim()) {
        throw createHttpError(`Key aging bucket ke-${index + 1} wajib diisi`, 400);
      }

      if (keySet.has(bucket.key)) {
        throw createHttpError(`Key aging bucket duplikat: ${bucket.key}`, 400);
      }
      keySet.add(bucket.key);

      if (!bucket.color || !/^#[0-9a-fA-F]{6}$/.test(bucket.color)) {
        throw createHttpError(`Warna bucket ke-${index + 1} wajib diisi (format hex #rrggbb)`, 400);
      }

      if (!Number.isFinite(bucket.min_age) || bucket.min_age < 0) {
        throw createHttpError(`Min age bucket ke-${index + 1} tidak valid`, 400);
      }

      if (bucket.max_age !== null && (!Number.isFinite(bucket.max_age) || bucket.max_age < bucket.min_age)) {
        throw createHttpError(`Max age bucket ke-${index + 1} tidak valid`, 400);
      }

      if (index === 0) {
        if (bucket.min_age > 1) {
          throw createHttpError("Bucket pertama harus dimulai dari 0 atau 1", 400);
        }
        return;
      }

      const previous = ordered[index - 1];
      if (previous.max_age === null) {
        throw createHttpError("Hanya bucket terakhir yang boleh memiliki max_age kosong", 400);
      }

      if (bucket.min_age <= previous.max_age) {
        throw createHttpError(
          `Min age bucket ke-${index + 1} harus lebih besar dari max bucket sebelumnya`,
          400
        );
      }
    });

    if (ordered[ordered.length - 1].max_age !== null) {
      throw createHttpError("Bucket terakhir harus memiliki max_age kosong untuk >120 hari", 400);
    }

    return ordered;
  }

  async getCabangAgingSettings(userBranchDatabases) {
    const [doc, availableDbs] = await Promise.all([
      this.agingSettingsCollection().findOne({ _id: "default" }),
      this.getEffectiveBranchDatabases(userBranchDatabases)
    ]);
    const normalizedAvailableDbs = [...new Set((availableDbs || []).map((item) => String(item || "").trim()).filter(Boolean))].sort();

    return {
      data: this.serializeAgingSettings({
        ...(doc || {}),
        available_databases: normalizedAvailableDbs
      })
    };
  }

  async updateCabangAgingSettings(payload) {
    const inputBuckets = Array.isArray(payload) ? payload : payload?.buckets;
    const hasBucketsPayload = Boolean(Array.isArray(inputBuckets));
    const hasExcludedPayload = Boolean(
      payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "excluded_databases")
    );
    const now = new Date().toISOString();
    const existing = await this.agingSettingsCollection().findOne({ _id: "default" });
    const existingBuckets = normalizeAgingBuckets(existing?.buckets || DEFAULT_AGING_BUCKETS);
    const existingExcludedDatabases = Array.isArray(existing?.excluded_databases)
      ? [...new Set(existing.excluded_databases.map((item) => String(item || "").trim()).filter(Boolean))]
      : [];
    const availableDbs = this.listBranchDbNames ? await this.listBranchDbNames() : [];
    const normalizedAvailableDbs = [...new Set((availableDbs || []).map((item) => String(item || "").trim()).filter(Boolean))].sort();
    const buckets = hasBucketsPayload ? this.validateAgingBuckets(inputBuckets) : existingBuckets;
    const excludedDatabases = hasExcludedPayload
      ? [...new Set((Array.isArray(payload?.excluded_databases) ? payload.excluded_databases : []).map((item) => String(item || "").trim()).filter(Boolean))]
      : existingExcludedDatabases;

    await this.agingSettingsCollection().updateOne(
      { _id: "default" },
      {
        $set: {
          buckets,
          excluded_databases: excludedDatabases,
          available_databases: normalizedAvailableDbs,
          updated_at: now
        },
        $setOnInsert: {
          created_at: existing?.created_at || now
        }
      },
      { upsert: true }
    );

    return {
      data: this.serializeAgingSettings({
        _id: "default",
        buckets,
        excluded_databases: excludedDatabases,
        available_databases: normalizedAvailableDbs,
        created_at: existing?.created_at || now,
        updated_at: now
      })
    };
  }

  async getCabangAgingStatus(query = {}) {
    if (query.job_id) {
      return this.getCabangAgingJob({ job_id: query.job_id });
    }

    const [settings, latestJob] = await Promise.all([
      this.getCabangAgingSettings(query.branch_databases),
      this.agingJobsCollection().findOne({}, { sort: { created_at: -1 } })
    ]);

    return {
      data: {
        settings: settings.data,
        latest_job: this.serializeAgingJob(latestJob)
      }
    };
  }

  async createCabangAgingJob(query = {}) {
    const settings = await this.getCabangAgingSettings(query.branch_databases);
    const availableDbs = this.listBranchDbNames ? await this.listBranchDbNames() : [];
    const settingsExcluded = Array.isArray(settings?.data?.excluded_databases) ? settings.data.excluded_databases : [];
    const mergedExcluded = [...new Set([...(this.config.excludedBranchDbNames || []), ...settingsExcluded])];
    const selectedDatabases = resolveBranchDatabases({
      requestedDbs: query.dbs,
      defaultDbs: [],
      availableDbs,
      excludedDbs: mergedExcluded
    });

    // Apply user branch_databases restriction
    if (Array.isArray(query.branch_databases) && query.branch_databases.length) {
      const userDbSet = new Set(query.branch_databases.map((s) => String(s || "").trim()).filter(Boolean));
      const filtered = selectedDatabases.filter((db) => userDbSet.has(db));
      if (!filtered.length) {
        throw createHttpError("Anda tidak memiliki akses ke database cabang manapun", 403);
      }
      selectedDatabases.length = 0;
      selectedDatabases.push(...filtered);
    }

    if (!selectedDatabases.length) {
      throw createHttpError("Tidak ada database cabang yang bisa diproses", 400);
    }

    const jobId = new ObjectId();
    const now = new Date().toISOString();
    const asOfDate = formatDateToYmd();
    const bucketTemplate = this.buildAgingBucketTemplate(settings.data.buckets);

    await this.agingJobsCollection().insertOne({
      _id: jobId,
      type: "cabang-aging",
      status: "queued",
      as_of_date: asOfDate,
      selected_databases: selectedDatabases,
      settings_snapshot: settings.data.buckets,
      summary_totals: {
        total_doc: 0,
        total_stock_on_hand: 0,
        total_berat: 0,
        total_berat_asli: 0,
        total_berat_bruto: 0
      },
      bucket_summary: bucketTemplate,
      progress: {
        total: selectedDatabases.length,
        processed: 0,
        completed: 0,
        failed: 0
      },
      errors: [],
      created_at: now,
      started_at: null,
      finished_at: null,
      updated_at: now,
      last_error: null
    });

    setImmediate(() => {
      void this.runCabangAgingJob(jobId.toHexString(), selectedDatabases, settings.data.buckets).catch(async (error) => {
        const failureTime = new Date().toISOString();
        await this.agingJobsCollection().updateOne(
          { _id: jobId },
          {
            $set: {
              status: "failed",
              last_error: error.message || String(error),
              finished_at: failureTime,
              updated_at: failureTime
            }
          }
        );
      });
    });

    return {
      data: {
        job_id: jobId.toHexString(),
        status: "queued",
        as_of_date: asOfDate,
        selected_databases: selectedDatabases,
        settings: settings.data,
        progress: {
          total: selectedDatabases.length,
          processed: 0,
          completed: 0,
          failed: 0,
          percent: 0
        }
      }
    };
  }

  async getCabangAgingJob(query = {}) {
    const jobId = query.job_id || query.id;
    if (!jobId || !ObjectId.isValid(String(jobId))) {
      throw createHttpError("aging job id tidak valid", 400);
    }

    const job = await this.agingJobsCollection().findOne({ _id: new ObjectId(String(jobId)) });
    if (!job) {
      throw createHttpError("aging job tidak ditemukan", 404);
    }

    return {
      data: this.serializeAgingJob(job)
    };
  }

  async collectAgingBranchSnapshot(dbName, bucketDefinitions, asOfDate) {
    const barangCollection = this.branchBarangCollection(dbName);
    const systemCollection = this.branchSystemCollection(dbName);
    const timeoutMs = Math.max(5000, Number(this.config.branchAgingDbTimeoutMs || 45000));
    const excludeGroupFilter = await this.buildExcludeGroupFilter();
    const barangFilter = { stock_on_hand: 1 };
    if (excludeGroupFilter) {
      Object.assign(barangFilter, excludeGroupFilter);
    }
    const [docs, systemDoc] = await Promise.all([
      withTimeout(
        barangCollection.find(barangFilter,
          {
            maxTimeMS: timeoutMs,
            projection: {
              _id: 0,
              stock_on_hand: 1,
              kode_barcode: 1,
              kode_gudang: 1,
              kode_group: 1,
              kode_toko: 1,
              kode_dept: 1,
              tgl_last_beli: 1,
              berat: 1,
              berat_asli: 1,
              berat_bruto: 1
            }
          }
        ).toArray(),
        timeoutMs + 2000,
        `Aging tm_barang ${dbName}`
      ),
      withTimeout(
        systemCollection.findOne(
          {},
          {
            maxTimeMS: timeoutMs,
            projection: {
              _id: 0,
              kode_toko: 1
            }
          }
        ),
        timeoutMs + 2000,
        `Aging tp_system ${dbName}`
      )
    ]);

    const branchKodeCabang = String(systemDoc?.kode_toko || "").trim() || dbName;
    const bucketSummary = this.buildAgingBucketTemplate(bucketDefinitions);
    const bucketDeptSummary = {};
    for (const bucket of bucketDefinitions) {
      bucketDeptSummary[bucket.key] = {};
    }

    const enrichedDocs = [];
    const asOfParsed = parseYmdDate(asOfDate);
    for (const item of docs) {
      const lastBeliDate = parseYmdDate(item.tgl_last_beli);
      if (!asOfParsed || !lastBeliDate) {
        continue;
      }

      const diffMs = asOfParsed.getTime() - lastBeliDate.getTime();
      if (diffMs < 0) {
        // Exclude future purchase date from aging bucket.
        continue;
      }

      const age = Math.floor(diffMs / 86400000);
      const bucket = classifyAgeBucket(age, bucketDefinitions);
      if (!bucket) {
        continue;
      }

      const normalizedItem = {
        stock_on_hand: item.stock_on_hand || 0,
        kode_barcode: item.kode_barcode || null,
        kode_gudang: item.kode_gudang || null,
        kode_group: item.kode_group || null,
        kode_baki: item.kode_toko || null,
        kode_dept: item.kode_dept || null,
        tgl_last_beli: item.tgl_last_beli || null,
        berat: item.berat || 0,
        berat_asli: item.berat_asli || 0,
        berat_bruto: item.berat_bruto || 0,
        umur_barang: age,
        bucket_key: bucket.key
      };

      enrichedDocs.push(normalizedItem);

      const target = bucketSummary[bucket.key];
      if (!target) {
        continue;
      }

      target.total_doc += 1;
      target.total_stock_on_hand += normalizedItem.stock_on_hand;
      target.total_berat += normalizedItem.berat;
      target.total_berat_asli += normalizedItem.berat_asli;
      target.total_berat_bruto += normalizedItem.berat_bruto;

      const deptKey = normalizedItem.kode_dept || "UNMAPPED";
      if (!bucketDeptSummary[bucket.key][deptKey]) {
        bucketDeptSummary[bucket.key][deptKey] = {
          kode_dept: deptKey,
          total_doc: 0,
          total_stock_on_hand: 0,
          total_berat: 0,
          total_berat_asli: 0,
          total_berat_bruto: 0
        };
      }

      const deptTarget = bucketDeptSummary[bucket.key][deptKey];
      deptTarget.total_doc += 1;
      deptTarget.total_stock_on_hand += normalizedItem.stock_on_hand;
      deptTarget.total_berat += normalizedItem.berat;
      deptTarget.total_berat_asli += normalizedItem.berat_asli;
      deptTarget.total_berat_bruto += normalizedItem.berat_bruto;
    }

    enrichedDocs.sort((left, right) => {
      const leftAge = left.umur_barang ?? -1;
      const rightAge = right.umur_barang ?? -1;

      if (rightAge !== leftAge) {
        return rightAge - leftAge;
      }

      return String(left.kode_barcode || "").localeCompare(String(right.kode_barcode || ""));
    });

    return {
      db_name: dbName,
      kode_cabang: branchKodeCabang,
      as_of_date: asOfDate,
      total_doc: enrichedDocs.length,
      total_stock_on_hand: enrichedDocs.reduce((acc, item) => acc + (item.stock_on_hand || 0), 0),
      total_berat: round3(enrichedDocs.reduce((acc, item) => acc + (item.berat || 0), 0)),
      total_berat_asli: round3(enrichedDocs.reduce((acc, item) => acc + (item.berat_asli || 0), 0)),
      total_berat_bruto: round3(enrichedDocs.reduce((acc, item) => acc + (item.berat_bruto || 0), 0)),
      bucket_summaries: Object.values(bucketSummary).map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        min_age: bucket.min_age,
        max_age: bucket.max_age,
        color: bucket.color || null,
        total_doc: bucket.total_doc,
        total_stock_on_hand: bucket.total_stock_on_hand,
        total_berat: round3(bucket.total_berat),
        total_berat_asli: round3(bucket.total_berat_asli),
        total_berat_bruto: round3(bucket.total_berat_bruto)
      })),
      bucket_dept_summary: Object.entries(bucketDeptSummary).reduce((acc, [bucketKey, deptMap]) => {
        acc[bucketKey] = Object.values(deptMap)
          .map((row) => ({
            kode_dept: row.kode_dept,
            total_doc: row.total_doc,
            total_stock_on_hand: row.total_stock_on_hand,
            total_berat: round3(row.total_berat),
            total_berat_asli: round3(row.total_berat_asli),
            total_berat_bruto: round3(row.total_berat_bruto)
          }))
          .sort((left, right) => Number(right.total_berat || 0) - Number(left.total_berat || 0));
        return acc;
      }, {})
    };
  }

  async runCabangAgingJob(jobId, selectedDatabases, bucketDefinitions) {
    const jobObjectId = new ObjectId(String(jobId));
    const asOfDate = formatDateToYmd();
    const concurrency = Math.max(1, Number(this.config.branchAgingConcurrency || 6));

    await this.agingJobsCollection().updateOne(
      { _id: jobObjectId },
      {
        $set: {
          status: "running",
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          as_of_date: asOfDate
        }
      }
    );

    let cursor = 0;
    const worker = async () => {
      while (true) {
        const currentIndex = cursor;
        cursor += 1;

        if (currentIndex >= selectedDatabases.length) {
          return;
        }

        const dbName = selectedDatabases[currentIndex];
        const processedAt = new Date().toISOString();

        try {
          const branchSnapshot = await this.collectAgingBranchSnapshot(dbName, bucketDefinitions, asOfDate);
          await this.agingJobBranchesCollection().insertOne({
            job_id: jobId,
            status: "completed",
            created_at: processedAt,
            updated_at: processedAt,
            ...branchSnapshot
          });

          const bucketInc = {};
          for (const bucket of branchSnapshot.bucket_summaries) {
            bucketInc[`bucket_summary.${bucket.key}.total_doc`] = bucket.total_doc;
            bucketInc[`bucket_summary.${bucket.key}.total_stock_on_hand`] = bucket.total_stock_on_hand;
            bucketInc[`bucket_summary.${bucket.key}.total_berat`] = bucket.total_berat;
            bucketInc[`bucket_summary.${bucket.key}.total_berat_asli`] = bucket.total_berat_asli;
            bucketInc[`bucket_summary.${bucket.key}.total_berat_bruto`] = bucket.total_berat_bruto;
            bucketInc[`bucket_summary.${bucket.key}.branch_count`] = bucket.total_doc > 0 ? 1 : 0;
          }

          await this.agingJobsCollection().updateOne(
            { _id: jobObjectId },
            {
              $inc: {
                "progress.processed": 1,
                "progress.completed": 1,
                "summary_totals.total_doc": branchSnapshot.total_doc,
                "summary_totals.total_stock_on_hand": branchSnapshot.total_stock_on_hand,
                "summary_totals.total_berat": branchSnapshot.total_berat,
                "summary_totals.total_berat_asli": branchSnapshot.total_berat_asli,
                "summary_totals.total_berat_bruto": branchSnapshot.total_berat_bruto,
                ...bucketInc
              },
              $set: {
                updated_at: processedAt,
                last_error: null
              }
            }
          );
        } catch (error) {
          await this.agingJobBranchesCollection().insertOne({
            job_id: jobId,
            db_name: dbName,
            status: "failed",
            error: error.message || String(error),
            created_at: processedAt,
            updated_at: processedAt
          });

          await this.agingJobsCollection().updateOne(
            { _id: jobObjectId },
            {
              $inc: {
                "progress.processed": 1,
                "progress.failed": 1
              },
              $push: {
                errors: {
                  db_name: dbName,
                  message: error.message || String(error),
                  at: processedAt
                }
              },
              $set: {
                updated_at: processedAt,
                last_error: error.message || String(error)
              }
            }
          );
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const finalJob = await this.agingJobsCollection().findOne({ _id: jobObjectId });
    if (!finalJob) {
      throw createHttpError("aging job hilang saat diproses", 500);
    }

    const finalStatus = finalJob.progress.failed > 0
      ? (finalJob.progress.completed > 0 ? "partial" : "failed")
      : "completed";
    const finishedAt = new Date().toISOString();

    await this.agingJobsCollection().updateOne(
      { _id: jobObjectId },
      {
        $set: {
          status: finalStatus,
          finished_at: finishedAt,
          updated_at: finishedAt
        }
      }
    );
  }

  async getCabangAgingJobBranches(query = {}) {
    const jobId = query.job_id || query.id;
    const bucketKey = query.bucket;
    const search = String(query.search || query.q || "").trim();
    const { page, limit, skip } = getPagination(query, { limit: 8 });

    if (!jobId || !ObjectId.isValid(String(jobId))) {
      throw createHttpError("aging job id tidak valid", 400);
    }

    if (!bucketKey) {
      throw createHttpError("bucket aging wajib diisi", 400);
    }

    const job = await this.agingJobsCollection().findOne({ _id: new ObjectId(String(jobId)) });
    if (!job) {
      throw createHttpError("aging job tidak ditemukan", 404);
    }

    const bucketDefinition = (job.settings_snapshot || []).find((bucket) => bucket.key === bucketKey);
    if (!bucketDefinition) {
      throw createHttpError("bucket aging tidak ditemukan", 404);
    }

    const branchFilter = {
      job_id: String(jobId),
      "bucket_summaries.key": bucketKey
    };

    if (search) {
      const queryRegex = { $regex: escapeRegex(search), $options: "i" };
      branchFilter.$or = [{ kode_cabang: queryRegex }, { db_name: queryRegex }];
      delete branchFilter["bucket_summaries.key"];
    }

    const branches = await this.agingJobBranchesCollection().find(
      branchFilter,
      {
        projection: {
          _id: 0,
          job_id: 1,
          db_name: 1,
          kode_cabang: 1,
          status: 1,
          bucket_summaries: 1,
          total_doc: 1,
          total_stock_on_hand: 1,
          total_berat: 1,
          total_berat_asli: 1,
          total_berat_bruto: 1,
          error: 1,
          updated_at: 1
        }
      }
    ).toArray();

    const mappedBranches = branches
      .map((branch) => {
        const bucket = (branch.bucket_summaries || []).find((item) => item.key === bucketKey);
        const isFailed = branch.status === "failed";
        if (!bucket && !isFailed) {
          return null;
        }

        if (!bucket && isFailed) {
          return {
            db_name: branch.db_name,
            kode_cabang: branch.kode_cabang || branch.db_name,
            status: branch.status,
            error: branch.error || "Gagal memproses cabang",
            total_doc: 0,
            total_stock_on_hand: 0,
            total_berat: 0,
            total_berat_asli: 0,
            total_berat_bruto: 0,
            updated_at: branch.updated_at || null
          };
        }

        return {
          db_name: branch.db_name,
          kode_cabang: branch.kode_cabang,
          status: branch.status,
          error: branch.error || null,
          total_doc: bucket.total_doc,
          total_stock_on_hand: bucket.total_stock_on_hand,
          total_berat: bucket.total_berat,
          total_berat_asli: bucket.total_berat_asli,
          total_berat_bruto: bucket.total_berat_bruto,
          updated_at: branch.updated_at || null
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const rightWeight = Number(right.total_berat || 0);
        const leftWeight = Number(left.total_berat || 0);

        if (rightWeight !== leftWeight) {
          return rightWeight - leftWeight;
        }

        return String(left.kode_cabang || "").localeCompare(String(right.kode_cabang || ""));
      });

    const total = mappedBranches.length;
    const pagedBranches = mappedBranches.slice(skip, skip + limit);

    return {
      data: {
        job_id: String(jobId),
        bucket: bucketDefinition,
        branches: pagedBranches,
        pagination: {
          page,
          limit,
          total,
          total_pages: total > 0 ? Math.ceil(total / limit) : 0,
          has_more: skip + limit < total
        }
      }
    };
  }

  async getCabangAgingJobItems(query = {}) {
    const jobId = query.job_id || query.id;
    const bucketKey = query.bucket;
    const kodeCabang = query.kode_cabang;
    const dbName = query.db_name ? String(query.db_name).trim() : "";
    const search = String(query.search || query.q || "").trim();
    const kodeGroup = String(query.kode_group || "").trim();
    const { page, limit, skip } = getPagination(query, { limit: 8 });

    if (!jobId || !ObjectId.isValid(String(jobId))) {
      throw createHttpError("aging job id tidak valid", 400);
    }

    if (!bucketKey) {
      throw createHttpError("bucket aging wajib diisi", 400);
    }

    if (!kodeCabang) {
      throw createHttpError("kode cabang wajib diisi", 400);
    }

    const job = await this.agingJobsCollection().findOne({ _id: new ObjectId(String(jobId)) });
    if (!job) {
      throw createHttpError("aging job tidak ditemukan", 404);
    }

    const bucketDefinition = (job.settings_snapshot || []).find((bucket) => bucket.key === bucketKey);
    if (!bucketDefinition) {
      throw createHttpError("bucket aging tidak ditemukan", 404);
    }

    const branchFilter = {
      job_id: String(jobId),
      kode_cabang: kodeCabang
    };

    if (dbName) {
      branchFilter.db_name = dbName;
    }

    const branchDoc = await this.agingJobBranchesCollection().findOne(branchFilter);

    if (!branchDoc) {
      throw createHttpError("cabang aging tidak ditemukan", 404);
    }

    const asOfDate = job.as_of_date || formatDateToYmd();
    const snapshotBucket = (branchDoc.bucket_summaries || []).find((bucket) => bucket.key === bucketKey) || null;
    const snapshotDeptBreakdown = Array.isArray(branchDoc.bucket_dept_summary?.[bucketKey])
      ? branchDoc.bucket_dept_summary[bucketKey]
      : null;
    const baseItemMatch = { stock_on_hand: 1 };
    const excludeGroupFilter = await this.buildExcludeGroupFilter();
    if (excludeGroupFilter) {
      Object.assign(baseItemMatch, excludeGroupFilter);
    }
    if (kodeGroup) {
      baseItemMatch.kode_group = kodeGroup;
    }
    const maxAgeDate = bucketDefinition.max_age === null
      ? null
      : shiftYmdDate(asOfDate, -Number(bucketDefinition.max_age || 0));
    const minAgeDate = shiftYmdDate(asOfDate, -Number(bucketDefinition.min_age || 0));

    if (maxAgeDate && minAgeDate) {
      baseItemMatch.tgl_last_beli = {
        $gte: maxAgeDate,
        $lte: minAgeDate
      };
    } else if (minAgeDate) {
      baseItemMatch.tgl_last_beli = {
        $lte: minAgeDate
      };
    }

    const itemMatch = { ...baseItemMatch };

    if (search) {
      itemMatch.$or = [
        { kode_barcode: { $regex: escapeRegex(search), $options: "i" } },
        { kode_toko: { $regex: escapeRegex(search), $options: "i" } },
        { kode_group: { $regex: escapeRegex(search), $options: "i" } },
        { kode_dept: { $regex: escapeRegex(search), $options: "i" } }
      ];
    }

    const collection = this.branchBarangCollection(branchDoc.db_name);
    const [total, summary, deptBreakdown, pagedItems] = await Promise.all([
      collection.countDocuments(itemMatch),
      collection.aggregate([
        { $match: itemMatch },
        {
          $group: {
            _id: null,
            total_stock_on_hand: { $sum: { $ifNull: ["$stock_on_hand", 0] } },
            total_berat: { $sum: { $ifNull: ["$berat", 0] } },
            total_berat_asli: { $sum: { $ifNull: ["$berat_asli", 0] } },
            total_berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
          }
        }
      ]).toArray(),
      collection.aggregate([
        { $match: baseItemMatch },
        {
          $group: {
            _id: { $ifNull: ["$kode_dept", "UNMAPPED"] },
            total_doc: { $sum: 1 },
            total_stock_on_hand: { $sum: { $ifNull: ["$stock_on_hand", 0] } },
            total_berat: { $sum: { $ifNull: ["$berat", 0] } },
            total_berat_asli: { $sum: { $ifNull: ["$berat_asli", 0] } },
            total_berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
          }
        },
        { $sort: { total_berat: -1, _id: 1 } }
      ]).toArray(),
      collection.find(itemMatch, {
        projection: {
          _id: 0,
          stock_on_hand: 1,
          kode_barcode: 1,
          nama_barang: 1,
          nama_item: 1,
          nama: 1,
          kode_gudang: 1,
          kode_group: 1,
          kode_toko: 1,
          kode_dept: 1,
          tgl_last_beli: 1,
          berat: 1,
          berat_asli: 1,
          berat_bruto: 1
        }
      })
        .sort({ tgl_last_beli: 1, kode_barcode: 1 })
        .skip(skip)
        .limit(limit)
        .toArray()
    ]);

    const items = pagedItems.map((item) => ({
      stock_on_hand: item.stock_on_hand || 0,
      kode_barcode: item.kode_barcode || null,
      nama_barang: item.nama_barang || item.nama_item || item.nama || null,
      kode_gudang: item.kode_gudang || null,
      kode_group: item.kode_group || null,
      kode_baki: item.kode_toko || null,
      kode_dept: item.kode_dept || null,
      tgl_last_beli: item.tgl_last_beli || null,
      berat: item.berat || 0,
      berat_asli: item.berat_asli || 0,
      berat_bruto: item.berat_bruto || 0,
      umur_barang: calculateAgeDays(item.tgl_last_beli, asOfDate),
      bucket_key: bucketDefinition.key
    }));

    const useSnapshotAggregate = !search;
    const resolvedTotalDoc = useSnapshotAggregate && snapshotBucket
      ? Number(snapshotBucket.total_doc || 0)
      : total;
    const resolvedTotalSoh = useSnapshotAggregate && snapshotBucket
      ? Number(snapshotBucket.total_stock_on_hand || 0)
      : Number(summary[0]?.total_stock_on_hand || 0);
    const resolvedTotalBerat = useSnapshotAggregate && snapshotBucket
      ? round3(snapshotBucket.total_berat || 0)
      : round3(summary[0]?.total_berat || 0);
    const resolvedTotalBeratAsli = useSnapshotAggregate && snapshotBucket
      ? round3(snapshotBucket.total_berat_asli || 0)
      : round3(summary[0]?.total_berat_asli || 0);
    const resolvedTotalBeratBruto = useSnapshotAggregate && snapshotBucket
      ? round3(snapshotBucket.total_berat_bruto || 0)
      : round3(summary[0]?.total_berat_bruto || 0);
    const resolvedDeptBreakdown = useSnapshotAggregate && snapshotDeptBreakdown
      ? snapshotDeptBreakdown
      : deptBreakdown.map((entry) => ({
        kode_dept: entry._id || "UNMAPPED",
        total_doc: entry.total_doc || 0,
        total_stock_on_hand: entry.total_stock_on_hand || 0,
        total_berat: round3(entry.total_berat || 0),
        total_berat_asli: round3(entry.total_berat_asli || 0),
        total_berat_bruto: round3(entry.total_berat_bruto || 0)
      }));

    return {
      data: {
        job_id: String(jobId),
        bucket: bucketDefinition,
        branch: {
          db_name: branchDoc.db_name,
          kode_cabang: branchDoc.kode_cabang
        },
        total_doc: resolvedTotalDoc,
        total_stock_on_hand: resolvedTotalSoh,
        total_berat: resolvedTotalBerat,
        total_berat_asli: resolvedTotalBeratAsli,
        total_berat_bruto: resolvedTotalBeratBruto,
        summary_by_dept: resolvedDeptBreakdown,
        items,
        pagination: {
          page,
          limit,
          total,
          total_pages: total > 0 ? Math.ceil(total / limit) : 0,
          has_more: skip + limit < total
        }
      }
    };
  }

  async getBrcStockItems(query = {}) {
    const match = {
      stock_on_hand: 1,
      kode_toko: { $regex: "BRC", $options: "i" }
    };

    const inputDateMatch = buildJsDateMatch(query.start_date, query.end_date);
    if (inputDateMatch) {
      match.input_date = inputDateMatch;
    }

    if (query.kode_group) {
      match.kode_group = query.kode_group;
    }

    if (query.kode_dept) {
      match.kode_dept = query.kode_dept;
    }

    if (query.kode_toko) {
      match.kode_toko = query.kode_toko;
    }

    const excludeGroupFilter = await this.buildExcludeGroupFilter();
    if (excludeGroupFilter) {
      Object.assign(match, excludeGroupFilter);
    }

    const search = String(query.search || query.q || "").trim();
    if (search) {
      match.$or = [
        { kode_barcode: { $regex: escapeRegex(search), $options: "i" } },
        { nama_barang: { $regex: escapeRegex(search), $options: "i" } },
        { kode_toko: { $regex: escapeRegex(search), $options: "i" } },
        { kode_group: { $regex: escapeRegex(search), $options: "i" } },
        { kode_dept: { $regex: escapeRegex(search), $options: "i" } }
      ];
    }

    const { page, limit, skip } = getPagination(query, { limit: 10 });

    const [total, summary, perBaki, items] = await Promise.all([
      this.pusatBarangCollection().countDocuments(match),
      this.pusatBarangCollection().aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total_stock_on_hand: { $sum: { $ifNull: ["$stock_on_hand", 0] } },
            total_berat: { $sum: { $ifNull: ["$berat", 0] } },
            total_berat_asli: { $sum: { $ifNull: ["$berat_asli", 0] } },
            total_berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
          }
        }
      ]).toArray(),
      this.pusatBarangCollection().aggregate([
        { $match: match },
        {
          $group: {
            _id: "$kode_toko",
            total_doc: { $sum: 1 },
            total_berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
          }
        },
        {
          $project: {
            _id: 0,
            kode_toko: "$_id",
            total_doc: 1,
            total_berat_bruto: { $round: ["$total_berat_bruto", 3] }
          }
        },
        { $sort: { total_berat_bruto: -1, kode_toko: 1 } }
      ]).toArray(),
      this.pusatBarangCollection().find(match, {
        projection: {
          _id: 0,
          stock_on_hand: 1,
          kode_barcode: 1,
          nama_barang: 1,
          nama_item: 1,
          nama: 1,
          kode_gudang: 1,
          kode_group: 1,
          kode_toko: 1,
          kode_dept: 1,
          tgl_last_beli: 1,
          berat: 1,
          berat_asli: 1,
          berat_bruto: 1
        }
      })
        .sort({ tgl_last_beli: -1, kode_barcode: 1 })
        .skip(skip)
        .limit(limit)
        .toArray()
    ]);

    const mappedItems = items.map((item) => ({
      stock_on_hand: item.stock_on_hand || 0,
      kode_barcode: item.kode_barcode || null,
      nama_barang: item.nama_barang || item.nama_item || item.nama || null,
      kode_gudang: item.kode_gudang || null,
      kode_group: item.kode_group || null,
      kode_baki: item.kode_toko || null,
      kode_dept: item.kode_dept || null,
      tgl_last_beli: item.tgl_last_beli || null,
      berat: item.berat || 0,
      berat_asli: item.berat_asli || 0,
      berat_bruto: item.berat_bruto || 0
    }));

    return {
      data: {
        total_doc: total,
        total_stock_on_hand: summary[0]?.total_stock_on_hand || 0,
        total_berat: round3(summary[0]?.total_berat || 0),
        total_berat_asli: round3(summary[0]?.total_berat_asli || 0),
        total_berat_bruto: round3(summary[0]?.total_berat_bruto || 0),
        per_baki: perBaki,
        items: mappedItems,
        pagination: {
          page,
          limit,
          total,
          total_pages: total > 0 ? Math.ceil(total / limit) : 0,
          has_more: skip + limit < total
        }
      }
    };
  }

  async getKomStockItems(query = {}) {
    const match = {
      stock_on_hand: 1,
      kode_toko: { $regex: "KOM", $options: "i" }
    };

    const inputDateMatch = buildJsDateMatch(query.start_date, query.end_date);
    if (inputDateMatch) {
      match.input_date = inputDateMatch;
    }

    if (query.kode_group) {
      match.kode_group = query.kode_group;
    }

    if (query.kode_dept) {
      match.kode_dept = query.kode_dept;
    }

    if (query.kode_toko) {
      match.kode_toko = query.kode_toko;
    }

    const excludeGroupFilter = await this.buildExcludeGroupFilter();
    if (excludeGroupFilter) {
      Object.assign(match, excludeGroupFilter);
    }

    const search = String(query.search || query.q || "").trim();
    if (search) {
      match.$or = [
        { kode_barcode: { $regex: escapeRegex(search), $options: "i" } },
        { nama_barang: { $regex: escapeRegex(search), $options: "i" } },
        { kode_toko: { $regex: escapeRegex(search), $options: "i" } },
        { kode_group: { $regex: escapeRegex(search), $options: "i" } },
        { kode_dept: { $regex: escapeRegex(search), $options: "i" } }
      ];
    }

    const { page, limit, skip } = getPagination(query, { limit: 10 });

    const [total, summary, perBaki, items] = await Promise.all([
      this.pusatBarangCollection().countDocuments(match),
      this.pusatBarangCollection().aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total_stock_on_hand: { $sum: { $ifNull: ["$stock_on_hand", 0] } },
            total_berat: { $sum: { $ifNull: ["$berat", 0] } },
            total_berat_asli: { $sum: { $ifNull: ["$berat_asli", 0] } },
            total_berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
          }
        }
      ]).toArray(),
      this.pusatBarangCollection().aggregate([
        { $match: match },
        {
          $group: {
            _id: "$kode_toko",
            total_doc: { $sum: 1 },
            total_berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
          }
        },
        {
          $project: {
            _id: 0,
            kode_toko: "$_id",
            total_doc: 1,
            total_berat_bruto: { $round: ["$total_berat_bruto", 3] }
          }
        },
        { $sort: { total_berat_bruto: -1, kode_toko: 1 } }
      ]).toArray(),
      this.pusatBarangCollection().find(match, {
        projection: {
          _id: 0,
          stock_on_hand: 1,
          kode_barcode: 1,
          nama_barang: 1,
          nama_item: 1,
          nama: 1,
          kode_gudang: 1,
          kode_group: 1,
          kode_toko: 1,
          kode_dept: 1,
          tgl_last_beli: 1,
          berat: 1,
          berat_asli: 1,
          berat_bruto: 1
        }
      })
        .sort({ tgl_last_beli: -1, kode_barcode: 1 })
        .skip(skip)
        .limit(limit)
        .toArray()
    ]);

    const mappedItems = items.map((item) => ({
      stock_on_hand: item.stock_on_hand || 0,
      kode_barcode: item.kode_barcode || null,
      nama_barang: item.nama_barang || item.nama_item || item.nama || null,
      kode_gudang: item.kode_gudang || null,
      kode_group: item.kode_group || null,
      kode_baki: item.kode_toko || null,
      kode_dept: item.kode_dept || null,
      tgl_last_beli: item.tgl_last_beli || null,
      berat: item.berat || 0,
      berat_asli: item.berat_asli || 0,
      berat_bruto: item.berat_bruto || 0
    }));

    return {
      data: {
        total_doc: total,
        total_stock_on_hand: summary[0]?.total_stock_on_hand || 0,
        total_berat: round3(summary[0]?.total_berat || 0),
        total_berat_asli: round3(summary[0]?.total_berat_asli || 0),
        total_berat_bruto: round3(summary[0]?.total_berat_bruto || 0),
        per_baki: perBaki,
        items: mappedItems,
        pagination: {
          page,
          limit,
          total,
          total_pages: total > 0 ? Math.ceil(total / limit) : 0,
          has_more: skip + limit < total
        }
      }
    };
  }

  async getCabangStockItems(query = {}) {
    const match = {
      stock_on_hand: 1,
      kode_gudang: "TOKO",
      kode_toko: {
        $not: /KOM|BRC/i
      }
    };

    const inputDateMatch = buildJsDateMatch(query.start_date, query.end_date);
    if (inputDateMatch) {
      match.input_date = inputDateMatch;
    }

    if (query.kode_group) {
      match.kode_group = query.kode_group;
    }

    if (query.kode_dept) {
      match.kode_dept = query.kode_dept;
    }

    if (query.kode_toko) {
      match.kode_toko = query.kode_toko;
    }

    const excludeGroupFilter = await this.buildExcludeGroupFilter();
    if (excludeGroupFilter) {
      Object.assign(match, excludeGroupFilter);
    }

    const search = String(query.search || query.q || "").trim();
    if (search) {
      match.$or = [
        { kode_barcode: { $regex: escapeRegex(search), $options: "i" } },
        { nama_barang: { $regex: escapeRegex(search), $options: "i" } },
        { kode_toko: { $regex: escapeRegex(search), $options: "i" } },
        { kode_group: { $regex: escapeRegex(search), $options: "i" } },
        { kode_dept: { $regex: escapeRegex(search), $options: "i" } }
      ];
    }

    const { page, limit, skip } = getPagination(query, { limit: 10 });

    const [total, summary, perBaki, items] = await Promise.all([
      this.pusatBarangCollection().countDocuments(match),
      this.pusatBarangCollection().aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total_stock_on_hand: { $sum: { $ifNull: ["$stock_on_hand", 0] } },
            total_berat: { $sum: { $ifNull: ["$berat", 0] } },
            total_berat_asli: { $sum: { $ifNull: ["$berat_asli", 0] } },
            total_berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
          }
        }
      ]).toArray(),
      this.pusatBarangCollection().aggregate([
        { $match: match },
        {
          $group: {
            _id: "$kode_toko",
            total_doc: { $sum: 1 },
            total_berat: { $sum: { $ifNull: ["$berat", 0] } },
            total_berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
          }
        },
        {
          $project: {
            _id: 0,
            kode_toko: "$_id",
            total_doc: 1,
            total_berat: { $round: ["$total_berat", 3] },
            total_berat_bruto: { $round: ["$total_berat_bruto", 3] }
          }
        },
        { $sort: { total_berat: -1, kode_toko: 1 } }
      ]).toArray(),
      this.pusatBarangCollection().find(match, {
        projection: {
          _id: 0,
          stock_on_hand: 1,
          kode_barcode: 1,
          nama_barang: 1,
          nama_item: 1,
          nama: 1,
          kode_gudang: 1,
          kode_group: 1,
          kode_toko: 1,
          kode_dept: 1,
          tgl_last_beli: 1,
          berat: 1,
          berat_asli: 1,
          berat_bruto: 1
        }
      })
        .sort({ tgl_last_beli: -1, kode_barcode: 1 })
        .skip(skip)
        .limit(limit)
        .toArray()
    ]);

    const mappedItems = items.map((item) => ({
      stock_on_hand: item.stock_on_hand || 0,
      kode_barcode: item.kode_barcode || null,
      nama_barang: item.nama_barang || item.nama_item || item.nama || null,
      kode_gudang: item.kode_gudang || null,
      kode_group: item.kode_group || null,
      kode_baki: item.kode_toko || null,
      kode_dept: item.kode_dept || null,
      tgl_last_beli: item.tgl_last_beli || null,
      berat: item.berat || 0,
      berat_asli: item.berat_asli || 0,
      berat_bruto: item.berat_bruto || 0
    }));

    return {
      data: {
        total_doc: total,
        total_stock_on_hand: summary[0]?.total_stock_on_hand || 0,
        total_berat: round3(summary[0]?.total_berat || 0),
        total_berat_asli: round3(summary[0]?.total_berat_asli || 0),
        total_berat_bruto: round3(summary[0]?.total_berat_bruto || 0),
        per_baki: perBaki,
        items: mappedItems,
        pagination: {
          page,
          limit,
          total,
          total_pages: total > 0 ? Math.ceil(total / limit) : 0,
          has_more: skip + limit < total
        }
      }
    };
  }

  async getBarangByBucket(query) {
    const match = {
      stock_on_hand: 1
    };
    const includeDetails = this.shouldIncludeDetails(query);
    const excludeGroupFilter = await this.buildExcludeGroupFilter();

    const inputDateMatch = buildJsDateMatch(query.start_date, query.end_date);
    if (inputDateMatch) {
      match.input_date = inputDateMatch;
    }

    if (query.bucket === "KOM") {
      match.kode_toko = { $regex: "KOM", $options: "i" };
    }

    if (query.bucket === "BRC") {
      match.kode_toko = { $regex: "BRC", $options: "i" };
    }

    if (excludeGroupFilter) {
      Object.assign(match, excludeGroupFilter);
    }

    if (query.kode_group) {
      match.kode_group = query.kode_group;
    }

    if (query.kode_dept) {
      match.kode_dept = query.kode_dept;
    }

    if (query.kode_toko) {
      match.kode_toko = query.kode_toko;
    }

    const summaryPromise = this.pusatBarangCollection().aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total_doc: { $sum: 1 },
            total_stock_on_hand: { $sum: { $ifNull: ["$stock_on_hand", 0] } },
            total_berat: { $sum: { $ifNull: ["$berat", 0] } },
            total_berat_asli: { $sum: { $ifNull: ["$berat_asli", 0] } },
            total_berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
          }
        }
      ]).toArray();

    const groupsPromise = includeDetails
      ? this.pusatBarangCollection().aggregate([
        { $match: match },
        {
          $group: {
            _id: "$kode_toko",
            total_doc: { $sum: 1 },
            total_stock_on_hand: { $sum: { $ifNull: ["$stock_on_hand", 0] } },
            total_berat: { $sum: { $ifNull: ["$berat", 0] } },
            total_berat_asli: { $sum: { $ifNull: ["$berat_asli", 0] } },
            total_berat_bruto: { $sum: { $ifNull: ["$berat_bruto", 0] } }
          }
        },
        {
          $project: {
            _id: 0,
            kode_toko: "$_id",
            total_doc: 1,
            total_stock_on_hand: 1,
            total_berat: { $round: ["$total_berat", 3] },
            total_berat_asli: { $round: ["$total_berat_asli", 3] },
            total_berat_bruto: { $round: ["$total_berat_bruto", 3] }
          }
        },
        { $sort: { kode_toko: 1 } }
      ]).toArray()
      : Promise.resolve([]);

    const [summary, groups] = await Promise.all([summaryPromise, groupsPromise]);

    return {
      data: {
        bucket: query.bucket,
        total_doc: summary[0]?.total_doc || 0,
        total_stock_on_hand: summary[0]?.total_stock_on_hand || 0,
        total_berat: round3(summary[0]?.total_berat || 0),
        total_berat_asli: round3(summary[0]?.total_berat_asli || 0),
        total_berat_bruto: round3(summary[0]?.total_berat_bruto || 0),
        per_baki: groups
      }
    };
  }
}

module.exports = {
  DashboardService
};
