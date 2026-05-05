const express = require("express");

function createRoutes(service) {
  const router = express.Router();

  router.get("/health", async (req, res, next) => {
    try {
      res.json({
        ok: true,
        service: "suryajaya-dashboard-api"
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/overview", async (req, res, next) => {
    try {
      res.json(await service.getOverview(req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/grosir/stocks", async (req, res, next) => {
    try {
      res.json(await service.getGrosirStocks(req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/grosir-to-pusat/transfers", async (req, res, next) => {
    try {
      res.json(await service.getTransfers(req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/pusat/keep-stocks", async (req, res, next) => {
    try {
      res.json(await service.getKeepStocks(req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/pusat/kom-stocks", async (req, res, next) => {
    try {
      res.json(await service.getKomStocks(req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/pusat/brc-stocks", async (req, res, next) => {
    try {
      res.json(await service.getBrcStocks(req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/pusat/cabang-stocks", async (req, res, next) => {
    try {
      res.json(await service.getCabangStocks(req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/cabang/aging-stocks", async (req, res, next) => {
    try {
      res.json(await service.getCabangAgingStatus(req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/cabang/aging-stocks/settings", async (req, res, next) => {
    try {
      res.json(await service.getCabangAgingSettings());
    } catch (error) {
      next(error);
    }
  });

  router.put("/dashboard/cabang/aging-stocks/settings", async (req, res, next) => {
    try {
      res.json(await service.updateCabangAgingSettings(req.body));
    } catch (error) {
      next(error);
    }
  });

  router.post("/dashboard/cabang/aging-stocks/jobs", async (req, res, next) => {
    try {
      res.status(202).json(await service.createCabangAgingJob(req.body || req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/cabang/aging-stocks/jobs/:jobId", async (req, res, next) => {
    try {
      res.json(await service.getCabangAgingJob({ job_id: req.params.jobId }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/cabang/aging-stocks/jobs/:jobId/buckets/:bucket/branches", async (req, res, next) => {
    try {
      res.json(await service.getCabangAgingJobBranches({
        ...req.query,
        job_id: req.params.jobId,
        bucket: req.params.bucket
      }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/cabang/aging-stocks/jobs/:jobId/buckets/:bucket/branches/:kode_cabang/items", async (req, res, next) => {
    try {
      res.json(await service.getCabangAgingJobItems({
        ...req.query,
        job_id: req.params.jobId,
        bucket: req.params.bucket,
        kode_cabang: req.params.kode_cabang
      }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createRoutes
};
