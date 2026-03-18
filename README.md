# Suryajaya Dashboard API

Backend terpisah untuk dashboard Suryajaya. Project ini hanya `read-only` dan tugasnya meng-aggregate data dari:

- database grosir
- database pusat

Frontend cukup `GET` ke API ini, tanpa query langsung ke Mongo. Semua endpoint dashboard mengembalikan data summary, bukan list item detail.

## Sumber data

API ini membaca collection berikut:

- Grosir stock: `tm_stock_barang`
- Grosir kirim ke pusat: `tt_kirim_stock`
- Keep stock pusat: `tt_terima_suplier`
- Stock barang pusat: `tm_barang`

Catatan:

- Jika source stock grosir ternyata finalnya `tm_stock_barang_card`, cukup ubah env `GROSIR_STOCK_COLLECTION`.

## Endpoint

### 1. Health

- `GET /api/v1/health`

### 2. Overview dashboard

- `GET /api/v1/dashboard/overview`

Output ringkas:

- total stock grosir
- total transfer belum diterima pusat
- total transfer sudah diterima pusat
- total keep stock pusat real
- total stock `KOM`
- total stock `BRC`
- jumlah group stock cabang

### 3. Stock grosir summary

- `GET /api/v1/dashboard/grosir/stocks`

Query optional:

- `kode_lokasi`
- `kode_jenis`
- `search`

Output:

- total row
- total qty
- total bruto
- total gross
- total netto
- total berat atribut
- rekap per `kode_lokasi`

### 4. Kirim grosir ke pusat

- `GET /api/v1/dashboard/grosir-to-pusat/transfers`

Query optional:

- `status=pending|received`
- `kode_toko`
- `kode_lokasi`
- `start_date`
- `end_date`
- `search`

Output:

- total dokumen transfer
- total qty transfer
- total bruto
- total netto
- tanggal output terakhir
- rekap per tanggal

Aturan:

- `pending` berarti `status_terima=false`
- `received` berarti `status_terima=true`

### 5. Keep stock pusat real

- `GET /api/v1/dashboard/pusat/keep-stocks`

Query optional:

- `start_date`
- `end_date`
- `no_terima`
- `kode_toko_cabang`
- `type`
- `show_zero=true|false`

Rumus:

- `qty_real = qty - qty_input`
- `berat_real = berat - berat_input`

Output:

- total dokumen
- total qty
- total qty input
- total qty real
- total berat
- total berat input
- total berat real
- rekap per tanggal

### 6. Stock baki KOM summary

- `GET /api/v1/dashboard/pusat/kom-stocks`

Query optional:

- `start_date`
- `end_date`
- `kode_group`
- `kode_dept`
- `kode_toko`

Filter utama:

- `tm_barang.stock_on_hand = 1`
- `tm_barang.kode_toko` mengandung `KOM`

Output:

- total dokumen
- total stock on hand
- total berat
- total berat asli
- total berat bruto
- rekap per `kode_toko`

### 7. Stock baki BRC summary

- `GET /api/v1/dashboard/pusat/brc-stocks`

Query optional:

- `start_date`
- `end_date`
- `kode_group`
- `kode_dept`
- `kode_toko`

Filter utama:

- `tm_barang.stock_on_hand = 1`
- `tm_barang.kode_toko` mengandung `BRC`

Output:

- total dokumen
- total stock on hand
- total berat
- total berat asli
- total berat bruto
- rekap per `kode_toko`

### 8. Stock cabang

- `GET /api/v1/dashboard/pusat/cabang-stocks`

Query optional:

- `start_date`
- `end_date`
- `kode_toko`

Filter utama:

- `tm_barang.stock_on_hand = 1`
- `tm_barang.kode_gudang = "TOKO"`
- exclude `kode_toko` yang mengandung `KOM`
- exclude `kode_toko` yang mengandung `BRC`
- hasil digrouping by `kode_toko`

Output:

- total group cabang
- total dokumen
- total stock on hand
- total berat
- rekap per `kode_toko`

### 9. Aging stock cabang

- `GET /api/v1/dashboard/cabang/aging-stocks`

Query optional:

- `dbs` optional; kalau tidak dikirim, endpoint akan ambil semua database cabang yang tersedia selain yang ada di exclude list

Aturan:

- source data dari collection `tm_barang` di database cabang
- identitas grup cabang ditampilkan sebagai `kode_cabang`, dengan nilai diambil dari `tp_system.kode_toko`
- default source adalah semua database cabang non-excluded
- filter utama `stock_on_hand = 1`
- `umur_barang` dihitung dari `tgl_last_beli` sampai tanggal request diproses
- hasil digrouping by `tp_system.kode_toko`

Output:

- `as_of_date`
- `selected_databases`
- summary per `kode_cabang`
- `items` berisi field barang, dengan `kode_toko` item ditampilkan sebagai `kode_baki`, plus `umur_barang`

## Cara jalan

### 1. Install dependency

```bash
npm install
```

### 2. Buat `.env`

Contoh minimal:

```env
PORT=3301

GROSIR_MONGO_URI=mongodb://...
PUSAT_MONGO_URI=mongodb://...

GROSIR_DB_NAME=grosir-suryajaya
PUSAT_DB_NAME=db_suryajaya_pusat

GROSIR_STOCK_COLLECTION=tm_stock_barang
GROSIR_TRANSFER_COLLECTION=tt_kirim_stock
PUSAT_KEEP_STOCK_COLLECTION=tt_terima_suplier
PUSAT_BARANG_COLLECTION=tm_barang
```

### 3. Run

```bash
npm run dev
```

atau

```bash
npm start
```

## Struktur project

```text
src/
  config.js
  db.js
  dashboardService.js
  routes.js
  server.js
```

## Postman

Import file ini ke Postman:

- [Suryajaya Dashboard API.postman_collection.json](/Users/aandiyanti/Documents/RnD/suryajaya-dashboard-api/postman/Suryajaya%20Dashboard%20API.postman_collection.json)

## Catatan implementasi

- Project ini sengaja dibuat sederhana supaya FE cepat integrasi.
- Semua endpoint saat ini `GET`, `read-only`, dan belum memakai auth.
- Jika nanti perlu security, paling mudah tambahkan middleware token di `src/routes.js`.
- Credential Mongo jangan di-hardcode ke source code; simpan di `.env`.
# suryajaya-dashboard-api
