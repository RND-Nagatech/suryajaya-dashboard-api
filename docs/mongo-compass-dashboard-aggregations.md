# Mongo Compass Aggregations - Dashboard (Page 1 & Page 2)

Dokumen ini berisi pipeline yang disalin dari logic backend saat ini (`src/dashboardService.js`) supaya hasil recheck di Mongo Compass sama dengan API.

## Mapping DB dan Collection
- **Grosir DB**: `grosir-suryajaya`
- **Pusat DB**: `db_suryajaya_pusat`
- Collection:
  - `tm_stock_barang` (grosir stock)
  - `tt_kirim_stock` (transfer grosir -> pusat)
  - `tt_terima_suplier` (keep stocks)
  - `tm_barang` (stok pusat/cabang & aging source)
  - `dashboard_aging_jobs` (metadata aging job)
  - `dashboard_aging_job_branches` (snapshot result per DB cabang)

---

## Page 1

## 1) Overview - Grosir Stock Summary
DB: `grosir-suryajaya`  
Collection: `tm_stock_barang`

```json
[
  {
    "$group": {
      "_id": null,
      "total_qty": { "$sum": { "$ifNull": ["$total_qty", 0] } },
      "total_bruto": { "$sum": { "$ifNull": ["$total_bruto", 0] } },
      "total_gross": { "$sum": { "$ifNull": ["$total_gross", 0] } },
      "total_netto": { "$sum": { "$ifNull": ["$total_netto", 0] } }
    }
  }
]
```

## 2) Overview - Transfer Pending Summary
DB: `grosir-suryajaya`  
Collection: `tt_kirim_stock`

```json
[
  { "$match": { "status_terima": false } },
  {
    "$addFields": {
      "total_qty_doc": {
        "$sum": {
          "$map": {
            "input": { "$ifNull": ["$detail_barang", []] },
            "as": "detail",
            "in": { "$toDouble": { "$ifNull": ["$$detail.qty", 0] } }
          }
        }
      }
    }
  },
  {
    "$group": {
      "_id": null,
      "total_doc": { "$sum": 1 },
      "total_qty": { "$sum": "$total_qty_doc" },
      "total_bruto": { "$sum": { "$ifNull": ["$total_bruto", 0] } },
      "total_netto": { "$sum": { "$ifNull": ["$total_netto", 0] } }
    }
  }
]
```

## 3) Overview - Transfer Received Summary
DB: `grosir-suryajaya`  
Collection: `tt_kirim_stock`

```json
[
  { "$match": { "status_terima": true } },
  {
    "$addFields": {
      "total_qty_doc": {
        "$sum": {
          "$map": {
            "input": { "$ifNull": ["$detail_barang", []] },
            "as": "detail",
            "in": { "$toDouble": { "$ifNull": ["$$detail.qty", 0] } }
          }
        }
      }
    }
  },
  {
    "$group": {
      "_id": null,
      "total_doc": { "$sum": 1 },
      "total_qty": { "$sum": "$total_qty_doc" },
      "total_bruto": { "$sum": { "$ifNull": ["$total_bruto", 0] } },
      "total_netto": { "$sum": { "$ifNull": ["$total_netto", 0] } }
    }
  }
]
```

## 4) Overview/Page1 - Keep Stocks Summary (quick)
DB: `db_suryajaya_pusat`  
Collection: `tt_terima_suplier`

```json
[
  {
    "$project": {
      "qty_real": {
        "$subtract": [
          { "$ifNull": ["$qty", 0] },
          { "$ifNull": ["$qty_input", 0] }
        ]
      },
      "berat_real": {
        "$subtract": [
          { "$ifNull": ["$berat", 0] },
          { "$ifNull": ["$berat_input", 0] }
        ]
      }
    }
  },
  {
    "$group": {
      "_id": null,
      "total_doc": { "$sum": 1 },
      "total_qty_real": { "$sum": "$qty_real" },
      "total_berat_real": { "$sum": "$berat_real" }
    }
  }
]
```

## 5) Keep Stocks Endpoint (`/dashboard/pusat/keep-stocks`)
DB: `db_suryajaya_pusat`  
Collection: `tt_terima_suplier`

Catatan filter opsional dari API:
- `tanggal` range (`start_date`, `end_date`)
- `no_terima`
- `kode_toko_cabang`
- `type`
- default `show_zero=false` -> filter `qty_real > 0` atau `berat_real > 0`

### 5a) Summary
```json
[
  { "$match": {} },
  {
    "$addFields": {
      "qty_real": {
        "$subtract": [
          { "$ifNull": ["$qty", 0] },
          { "$ifNull": ["$qty_input", 0] }
        ]
      },
      "berat_real": {
        "$subtract": [
          { "$ifNull": ["$berat", 0] },
          { "$ifNull": ["$berat_input", 0] }
        ]
      }
    }
  },
  {
    "$match": {
      "$or": [
        { "qty_real": { "$gt": 0 } },
        { "berat_real": { "$gt": 0 } }
      ]
    }
  },
  {
    "$group": {
      "_id": null,
      "total_doc": { "$sum": 1 },
      "total_qty": { "$sum": { "$ifNull": ["$qty", 0] } },
      "total_qty_input": { "$sum": { "$ifNull": ["$qty_input", 0] } },
      "total_qty_real": { "$sum": "$qty_real" },
      "total_berat": { "$sum": { "$ifNull": ["$berat", 0] } },
      "total_berat_input": { "$sum": { "$ifNull": ["$berat_input", 0] } },
      "total_berat_real": { "$sum": "$berat_real" }
    }
  }
]
```

### 5b) Per tanggal (saat `include_details=true`)
```json
[
  { "$match": {} },
  {
    "$addFields": {
      "qty_real": {
        "$subtract": [
          { "$ifNull": ["$qty", 0] },
          { "$ifNull": ["$qty_input", 0] }
        ]
      },
      "berat_real": {
        "$subtract": [
          { "$ifNull": ["$berat", 0] },
          { "$ifNull": ["$berat_input", 0] }
        ]
      }
    }
  },
  {
    "$match": {
      "$or": [
        { "qty_real": { "$gt": 0 } },
        { "berat_real": { "$gt": 0 } }
      ]
    }
  },
  {
    "$group": {
      "_id": "$tanggal",
      "total_doc": { "$sum": 1 },
      "total_qty_real": { "$sum": "$qty_real" },
      "total_berat_real": { "$sum": "$berat_real" }
    }
  },
  {
    "$project": {
      "_id": 0,
      "tanggal": "$_id",
      "total_doc": 1,
      "total_qty_real": 1,
      "total_berat_real": { "$round": ["$total_berat_real", 3] }
    }
  },
  { "$sort": { "tanggal": -1 } }
]
```

## 6) Grosir Stocks (`/dashboard/grosir/stocks`)
DB: `grosir-suryajaya`  
Collection: `tm_stock_barang`

Default exclude lokasi:
- `PUSAT`, `HANCUR`, `REV`, `DEFAULT`

### 6a) Summary
```json
[
  {
    "$match": {
      "$and": [
        { "kode_lokasi": { "$nin": ["PUSAT", "HANCUR", "REV", "DEFAULT"] } }
      ]
    }
  },
  {
    "$group": {
      "_id": null,
      "total_row": { "$sum": 1 },
      "total_qty": { "$sum": { "$ifNull": ["$total_qty", 0] } },
      "total_bruto": { "$sum": { "$ifNull": ["$total_bruto", 0] } },
      "total_gross": { "$sum": { "$ifNull": ["$total_gross", 0] } },
      "total_netto": { "$sum": { "$ifNull": ["$total_netto", 0] } },
      "total_berat_atribut": { "$sum": { "$ifNull": ["$total_berat_atribut", 0] } }
    }
  }
]
```

### 6b) Per lokasi
```json
[
  {
    "$match": {
      "$and": [
        { "kode_lokasi": { "$nin": ["PUSAT", "HANCUR", "REV", "DEFAULT"] } }
      ]
    }
  },
  {
    "$group": {
      "_id": "$kode_lokasi",
      "total_qty": { "$sum": { "$ifNull": ["$total_qty", 0] } },
      "total_bruto": { "$sum": { "$ifNull": ["$total_bruto", 0] } },
      "total_gross": { "$sum": { "$ifNull": ["$total_gross", 0] } },
      "total_netto": { "$sum": { "$ifNull": ["$total_netto", 0] } }
    }
  },
  {
    "$project": {
      "_id": 0,
      "kode_lokasi": "$_id",
      "total_qty": 1,
      "total_bruto": { "$round": ["$total_bruto", 3] },
      "total_gross": { "$round": ["$total_gross", 3] },
      "total_netto": { "$round": ["$total_netto", 3] }
    }
  },
  { "$sort": { "total_netto": -1, "kode_lokasi": 1 } }
]
```

## 7) Transfers (`/dashboard/grosir-to-pusat/transfers`)
DB: `grosir-suryajaya`  
Collection: `tt_kirim_stock`

Gunakan `status_terima=false` untuk pending, `true` untuk received.

### 7a) Summary
```json
[
  { "$match": { "status_terima": false } },
  {
    "$addFields": {
      "total_qty_doc": {
        "$sum": {
          "$map": {
            "input": { "$ifNull": ["$detail_barang", []] },
            "as": "detail",
            "in": { "$toDouble": { "$ifNull": ["$$detail.qty", 0] } }
          }
        }
      },
      "tanggal_output": {
        "$cond": [{ "$eq": ["$status_terima", true] }, "$terima_date", "$validate_date"]
      }
    }
  },
  {
    "$group": {
      "_id": null,
      "total_doc": { "$sum": 1 },
      "total_qty": { "$sum": "$total_qty_doc" },
      "total_bruto": { "$sum": { "$ifNull": ["$total_bruto", 0] } },
      "total_netto": { "$sum": { "$ifNull": ["$total_netto", 0] } },
      "last_tanggal_output": { "$max": "$tanggal_output" }
    }
  }
]
```

### 7b) Per tanggal
```json
[
  { "$match": { "status_terima": false } },
  {
    "$addFields": {
      "total_qty_doc": {
        "$sum": {
          "$map": {
            "input": { "$ifNull": ["$detail_barang", []] },
            "as": "detail",
            "in": { "$toDouble": { "$ifNull": ["$$detail.qty", 0] } }
          }
        }
      }
    }
  },
  {
    "$group": {
      "_id": "$tanggal",
      "total_doc": { "$sum": 1 },
      "total_qty": { "$sum": "$total_qty_doc" },
      "total_bruto": { "$sum": { "$ifNull": ["$total_bruto", 0] } },
      "total_netto": { "$sum": { "$ifNull": ["$total_netto", 0] } }
    }
  },
  {
    "$project": {
      "_id": 0,
      "tanggal": "$_id",
      "total_doc": 1,
      "total_qty": 1,
      "total_bruto": { "$round": ["$total_bruto", 3] },
      "total_netto": { "$round": ["$total_netto", 3] }
    }
  },
  { "$sort": { "tanggal": -1 } }
]
```

## 8) KOM/BRC/Cabang Stocks (sumber metric page 1)
DB: `db_suryajaya_pusat`  
Collection: `tm_barang`

### 8a) KOM summary
```json
[
  {
    "$match": {
      "stock_on_hand": 1,
      "kode_toko": { "$regex": "KOM", "$options": "i" }
    }
  },
  {
    "$group": {
      "_id": null,
      "total_doc": { "$sum": 1 },
      "total_stock_on_hand": { "$sum": { "$ifNull": ["$stock_on_hand", 0] } },
      "total_berat_netto": { "$sum": { "$ifNull": ["$berat_asli", 0] } },
      "total_berat_bulat": { "$sum": { "$ifNull": ["$berat", 0] } },
      "total_berat_bruto": { "$sum": { "$ifNull": ["$berat_bruto", 0] } }
    }
  }
]
```

### 8b) BRC summary
```json
[
  {
    "$match": {
      "stock_on_hand": 1,
      "kode_toko": { "$regex": "BRC", "$options": "i" }
    }
  },
  {
    "$group": {
      "_id": null,
      "total_doc": { "$sum": 1 },
      "total_stock_on_hand": { "$sum": { "$ifNull": ["$stock_on_hand", 0] } },
      "total_berat_netto": { "$sum": { "$ifNull": ["$berat_asli", 0] } },
      "total_berat_bulat": { "$sum": { "$ifNull": ["$berat", 0] } },
      "total_berat_bruto": { "$sum": { "$ifNull": ["$berat_bruto", 0] } }
    }
  }
]
```

### 8c) Cabang summary
```json
[
  {
    "$match": {
      "stock_on_hand": 1,
      "kode_gudang": "TOKO",
      "kode_toko": { "$not": /KOM|BRC/i }
    }
  },
  {
    "$group": {
      "_id": null,
      "total_group": { "$addToSet": "$kode_toko" },
      "total_doc": { "$sum": 1 },
      "total_stock_on_hand": { "$sum": { "$ifNull": ["$stock_on_hand", 0] } },
      "total_berat": { "$sum": { "$ifNull": ["$berat", 0] } }
    }
  },
  {
    "$project": {
      "_id": 0,
      "total_group": { "$size": "$total_group" },
      "total_doc": 1,
      "total_stock_on_hand": 1,
      "total_berat": { "$round": ["$total_berat", 3] }
    }
  }
]
```

---

## Page 2 (Aging)

## 9) Aging Job Snapshot per DB Cabang (core process)
DB cabang: `<db_cabang>`  
Collection: `tm_barang`

Backend memakai `find` dengan filter berikut:
```json
{ "stock_on_hand": 1 }
```

Untuk cek jumlah kandidat raw:
```json
[
  { "$match": { "stock_on_hand": 1 } },
  { "$count": "total" }
]
```

Untuk cek distribusi umur + bucket (contoh `as_of_date = "2026-05-01"`):
```json
[
  { "$match": { "stock_on_hand": 1, "tgl_last_beli": { "$regex": "^\\d{4}-\\d{2}-\\d{2}$" } } },
  {
    "$addFields": {
      "umur_barang": {
        "$dateDiff": {
          "startDate": { "$dateFromString": { "dateString": "$tgl_last_beli", "format": "%Y-%m-%d" } },
          "endDate": { "$dateFromString": { "dateString": "2026-05-01", "format": "%Y-%m-%d" } },
          "unit": "day"
        }
      }
    }
  },
  { "$match": { "umur_barang": { "$gte": 0 } } },
  {
    "$addFields": {
      "bucket_key": {
        "$switch": {
          "branches": [
            { "case": { "$and": [{ "$gte": ["$umur_barang", 0] }, { "$lte": ["$umur_barang", 30] }] }, "then": "age_1_30" },
            { "case": { "$and": [{ "$gte": ["$umur_barang", 31] }, { "$lte": ["$umur_barang", 60] }] }, "then": "age_31_60" },
            { "case": { "$and": [{ "$gte": ["$umur_barang", 61] }, { "$lte": ["$umur_barang", 90] }] }, "then": "age_61_90" },
            { "case": { "$and": [{ "$gte": ["$umur_barang", 91] }, { "$lte": ["$umur_barang", 120] }] }, "then": "age_91_120" },
            { "case": { "$gte": ["$umur_barang", 121] }, "then": "age_121_plus" }
          ],
          "default": null
        }
      }
    }
  },
  { "$match": { "bucket_key": { "$ne": null } } },
  {
    "$group": {
      "_id": "$bucket_key",
      "total_doc": { "$sum": 1 },
      "total_stock_on_hand": { "$sum": { "$ifNull": ["$stock_on_hand", 0] } },
      "total_berat": { "$sum": { "$ifNull": ["$berat", 0] } }
    }
  },
  { "$sort": { "_id": 1 } }
]
```

## 10) Aging - Data cabang bucket aktif
DB: `db_suryajaya_pusat`  
Collection: `dashboard_aging_job_branches`

Contoh:
- `job_id = "69f4c6d1150368c5c4601785"`
- `bucket = "age_1_30"`

```json
[
  {
    "$match": {
      "job_id": "69f4c6d1150368c5c4601785",
      "bucket_summaries.key": "age_1_30"
    }
  },
  {
    "$project": {
      "_id": 0,
      "job_id": 1,
      "db_name": 1,
      "kode_cabang": 1,
      "status": 1,
      "bucket_summaries": 1,
      "error": 1,
      "updated_at": 1
    }
  }
]
```

Untuk search (kode cabang atau db_name):
```json
[
  {
    "$match": {
      "job_id": "69f4c6d1150368c5c4601785",
      "$or": [
        { "kode_cabang": { "$regex": "db_", "$options": "i" } },
        { "db_name": { "$regex": "db_", "$options": "i" } }
      ]
    }
  }
]
```

## 11) Aging - Detail item bucket + branch
DB cabang (sesuai `db_name` row terpilih)  
Collection: `tm_barang`

Contoh bucket `1-30 Hari` (`as_of_date = "2026-05-01"`):
- min = 0, max = 30  
- date range: `tgl_last_beli` between `as_of_date - 30` and `as_of_date`

```json
[
  {
    "$match": {
      "stock_on_hand": 1,
      "tgl_last_beli": { "$gte": "2026-04-01", "$lte": "2026-05-01" }
    }
  },
  {
    "$group": {
      "_id": null,
      "total_doc": { "$sum": 1 },
      "total_stock_on_hand": { "$sum": { "$ifNull": ["$stock_on_hand", 0] } },
      "total_berat": { "$sum": { "$ifNull": ["$berat", 0] } },
      "total_berat_asli": { "$sum": { "$ifNull": ["$berat_asli", 0] } },
      "total_berat_bruto": { "$sum": { "$ifNull": ["$berat_bruto", 0] } }
    }
  }
]
```

## 12) Aging - Summary by dept (untuk donut cabang)
DB cabang  
Collection: `tm_barang`

```json
[
  {
    "$match": {
      "stock_on_hand": 1,
      "tgl_last_beli": { "$gte": "2026-04-01", "$lte": "2026-05-01" }
    }
  },
  {
    "$group": {
      "_id": { "$ifNull": ["$kode_dept", "UNMAPPED"] },
      "total_doc": { "$sum": 1 },
      "total_stock_on_hand": { "$sum": { "$ifNull": ["$stock_on_hand", 0] } },
      "total_berat": { "$sum": { "$ifNull": ["$berat", 0] } },
      "total_berat_asli": { "$sum": { "$ifNull": ["$berat_asli", 0] } },
      "total_berat_bruto": { "$sum": { "$ifNull": ["$berat_bruto", 0] } }
    }
  },
  { "$sort": { "total_berat": -1, "_id": 1 } }
]
```

## 13) Aging - Detail item list (paged)
DB cabang  
Collection: `tm_barang`

Untuk list page:
```json
[
  {
    "$match": {
      "stock_on_hand": 1,
      "tgl_last_beli": { "$gte": "2026-04-01", "$lte": "2026-05-01" }
    }
  },
  { "$sort": { "tgl_last_beli": 1, "kode_barcode": 1 } },
  { "$skip": 0 },
  { "$limit": 8 },
  {
    "$project": {
      "_id": 0,
      "stock_on_hand": 1,
      "kode_barcode": 1,
      "nama_barang": 1,
      "nama_item": 1,
      "nama": 1,
      "kode_gudang": 1,
      "kode_group": 1,
      "kode_toko": 1,
      "kode_dept": 1,
      "tgl_last_beli": 1,
      "berat": 1,
      "berat_asli": 1,
      "berat_bruto": 1
    }
  }
]
```

---

## Tips Recheck Cepat
- Jika ingin cocokkan 1:1 dengan API, pakai:
  - `stock_on_hand: 1` (bukan `> 0`) untuk endpoint barang bucket/aging saat ini.
  - date range bucket pakai `as_of_date` dari dokumen job di `dashboard_aging_jobs`.
- Untuk lihat kenapa DB tidak muncul di list cabang aktif:
  - cek `dashboard_aging_job_branches` by `job_id` + `db_name`,
  - jika `status=failed`, baca field `error`.
