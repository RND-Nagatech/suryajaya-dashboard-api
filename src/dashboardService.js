const {
  round3,
  buildStringDateMatch,
  buildJsDateMatch,
  calculateAgeDays,
  formatDateToYmd,
  resolveBranchDatabases
} = require("./utils");

class DashboardService {
  constructor(dbs, config) {
    this.grosirDb = dbs.grosirDb;
    this.pusatDb = dbs.pusatDb;
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

  shouldIncludeDetails(query) {
    return String(query.include_details || "true").toLowerCase() !== "false";
  }

  async getOverview(query) {
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
        {
          $match: {
            stock_on_hand: 1,
            kode_toko: { $regex: "KOM", $options: "i" }
          }
        },
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
        {
          $match: {
            stock_on_hand: 1,
            kode_toko: { $regex: "BRC", $options: "i" }
          }
        },
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
        {
          $match: {
            stock_on_hand: 1,
            kode_gudang: "TOKO",
            kode_toko: {
              $not: /KOM|BRC/i
            }
          }
        },
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

    if (query.kode_toko) {
      match.kode_toko = query.kode_toko;
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
    const availableDbs = this.listBranchDbNames ? await this.listBranchDbNames() : [];
    const selectedDatabases = resolveBranchDatabases({
      requestedDbs: query.dbs,
      defaultDbs: [],
      availableDbs,
      excludedDbs: this.config.excludedBranchDbNames
    });

    const branches = await Promise.all(
      selectedDatabases.map(async (dbName) => {
        const barangCollection = this.branchBarangCollection(dbName);
        const systemCollection = this.branchSystemCollection(dbName);
        const [docs, systemDoc] = await Promise.all([
          barangCollection.find(
            { stock_on_hand: 1 },
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

  async getBarangByBucket(query) {
    const match = {
      stock_on_hand: 1
    };
    const includeDetails = this.shouldIncludeDetails(query);

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
