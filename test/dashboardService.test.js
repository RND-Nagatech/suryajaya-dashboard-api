const test = require("node:test");
const assert = require("node:assert/strict");

const { DashboardService } = require("../src/dashboardService");

function createCollection(docs) {
  return {
    find(filter, options = {}) {
      const filteredDocs = docs
        .filter((doc) => {
          if (filter.stock_on_hand === undefined) {
            return true;
          }

          return doc.stock_on_hand === filter.stock_on_hand;
        })
        .map((doc) => {
          if (!options.projection) {
            return { ...doc };
          }

          const projected = {};
          for (const [key, include] of Object.entries(options.projection)) {
            if (include === 1) {
              projected[key] = doc[key];
            }
          }

          return projected;
        });

      return {
        async toArray() {
          return filteredDocs;
        }
      };
    },
    async findOne(filter = {}, options = {}) {
      const docsWithProjection = docs
        .filter(() => {
          return Object.keys(filter).length === 0;
        })
        .map((doc) => {
          if (!options.projection) {
            return { ...doc };
          }

          const projected = {};
          for (const [key, include] of Object.entries(options.projection)) {
            if (include === 1) {
              projected[key] = doc[key];
            }
          }

          return projected;
        });

      return docsWithProjection[0] || null;
    }
  };
}

function createService(branchDataByDb) {
  const collections = new Map(
    Object.entries(branchDataByDb).map(([dbName, data]) => [
      dbName,
      {
        tm_barang: createCollection(data.tm_barang || []),
        tp_system: createCollection(data.tp_system || [])
      }
    ])
  );

  const mockCollection = {
    findOne: async () => null,
    find: () => ({ sort: () => ({ toArray: async () => [] }) }),
    aggregate: () => ({ toArray: async () => [] }),
    countDocuments: async () => 0,
    insertOne: async () => ({}),
    updateOne: async () => ({}),
    deleteOne: async () => ({})
  };

  return new DashboardService(
    {
      grosirDb: { collection: () => mockCollection },
      pusatDb: { collection: () => mockCollection },
      getBranchDb: (dbName) => ({
        collection: (collectionName) =>
          collections.get(dbName)?.[collectionName] || createCollection([])
      }),
      listBranchDbNames: async () => Array.from(collections.keys())
    },
    {
      excludedBranchDbNames: ["admin", "local"],
      collections: {
        pusatBarang: "tm_barang",
        branchSystem: "tp_system"
      }
    }
  );
}

test("getCabangAgingStocks groups per branch using tp_system.kode_toko and sorts all returned items by umur_barang", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-03-18T10:00:00.000Z") });

  const service = createService({
    g3: {
      tp_system: [
        {
          kode_toko: "G3"
        }
      ],
      tm_barang: [
        {
          stock_on_hand: 1,
          kode_barcode: "B-002",
          kode_gudang: "TOKO",
          kode_group: "375",
          kode_toko: "G3-A41",
          kode_dept: "CC37",
          tgl_last_beli: "2026-03-10",
          berat: 3.3,
          berat_asli: 3.2,
          berat_bruto: 3.4
        },
        {
          stock_on_hand: 1,
          kode_barcode: "B-001",
          kode_gudang: "TOKO",
          kode_group: "375",
          kode_toko: "G3-A11",
          kode_dept: "CC37",
          tgl_last_beli: "2025-12-19",
          berat: 1.4,
          berat_asli: 1.3,
          berat_bruto: 1.5
        },
        {
          stock_on_hand: 0,
          kode_barcode: "B-999",
          kode_gudang: "TOKO",
          kode_group: "375",
          kode_toko: "G3-Z99",
          kode_dept: "CC37",
          tgl_last_beli: "2024-01-01",
          berat: 9,
          berat_asli: 9,
          berat_bruto: 9
        }
      ]
    },
    g5: {
      tp_system: [
        {
          kode_toko: "G5"
        }
      ],
      tm_barang: [
        {
          stock_on_hand: 1,
          kode_barcode: "A-200",
          kode_gudang: "TOKO",
          kode_group: "RUPA2",
          kode_toko: "G5-KTG75",
          kode_dept: "KTG75",
          tgl_last_beli: "2023-06-25",
          berat: 0,
          berat_asli: 0,
          berat_bruto: 0
        },
        {
          stock_on_hand: 1,
          kode_barcode: "A-100",
          kode_gudang: "TOKO",
          kode_group: "RUPA2",
          kode_toko: "G5-KTG60",
          kode_dept: "KTG60",
          tgl_last_beli: "2023-06-25",
          berat: 1.1111,
          berat_asli: 1.2222,
          berat_bruto: 1.3333
        }
      ]
    }
  });

  const result = await service.getCabangAgingStocks({
    dbs: "g3,g5"
  });

  assert.equal(result.data.as_of_date, "2026-03-18");
  assert.deepEqual(result.data.selected_databases, ["g3", "g5"]);
  assert.equal(result.data.branches.length, 2);

  assert.deepEqual(result.data.branches[0], {
    kode_cabang: "G3",
    as_of_date: "2026-03-18",
    total_doc: 2,
    total_stock_on_hand: 2,
    total_berat: 4.7,
    total_berat_asli: 4.5,
    total_berat_bruto: 4.9,
    items: [
      {
        stock_on_hand: 1,
        kode_barcode: "B-001",
        kode_gudang: "TOKO",
        kode_group: "375",
        kode_baki: "G3-A11",
        kode_dept: "CC37",
        tgl_last_beli: "2025-12-19",
        berat: 1.4,
        berat_asli: 1.3,
        berat_bruto: 1.5,
        umur_barang: 89
      },
      {
        stock_on_hand: 1,
        kode_barcode: "B-002",
        kode_gudang: "TOKO",
        kode_group: "375",
        kode_baki: "G3-A41",
        kode_dept: "CC37",
        tgl_last_beli: "2026-03-10",
        berat: 3.3,
        berat_asli: 3.2,
        berat_bruto: 3.4,
        umur_barang: 8
      }
    ]
  });

  assert.deepEqual(result.data.branches[1], {
    kode_cabang: "G5",
    as_of_date: "2026-03-18",
    total_doc: 2,
    total_stock_on_hand: 2,
    total_berat: 1.111,
    total_berat_asli: 1.222,
    total_berat_bruto: 1.333,
    items: [
      {
        stock_on_hand: 1,
        kode_barcode: "A-100",
        kode_gudang: "TOKO",
        kode_group: "RUPA2",
        kode_baki: "G5-KTG60",
        kode_dept: "KTG60",
        tgl_last_beli: "2023-06-25",
        berat: 1.1111,
        berat_asli: 1.2222,
        berat_bruto: 1.3333,
        umur_barang: 997
      },
      {
        stock_on_hand: 1,
        kode_barcode: "A-200",
        kode_gudang: "TOKO",
        kode_group: "RUPA2",
        kode_baki: "G5-KTG75",
        kode_dept: "KTG75",
        tgl_last_beli: "2023-06-25",
        berat: 0,
        berat_asli: 0,
        berat_bruto: 0,
        umur_barang: 997
      }
    ]
  });
});

test("getCabangAgingStocks falls back to database name when tp_system.kode_toko is missing", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-03-18T10:00:00.000Z") });

  const service = createService({
    g9: {
      tp_system: [
        {
          kode_toko: ""
        }
      ],
      tm_barang: [
        {
          stock_on_hand: 1,
          kode_barcode: "X-001",
          kode_gudang: "TOKO",
          kode_group: "111",
          kode_toko: "G9-A01",
          kode_dept: "CC11",
          tgl_last_beli: "2026-03-01",
          berat: 2,
          berat_asli: 1.9,
          berat_bruto: 2.1
        }
      ]
    }
  });

  const result = await service.getCabangAgingStocks({
    dbs: "g9"
  });

  assert.equal(result.data.branches[0].kode_cabang, "g9");
  assert.equal(result.data.branches[0].items[0].kode_baki, "G9-A01");
});
