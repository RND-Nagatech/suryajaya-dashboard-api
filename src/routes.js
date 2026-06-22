const express = require("express");

function createRoutes(service) {
  const router = express.Router();

  router.get("/dashboard/groups", async (req, res, next) => {
    try {
      res.json(await service.listGroups());
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/exclude-groups", async (req, res, next) => {
    try {
      res.json(await service.getExcludeGroupSettings());
    } catch (error) {
      next(error);
    }
  });

  router.put("/dashboard/exclude-groups", async (req, res, next) => {
    try {
      res.json(await service.updateExcludeGroupSettings(req.body));
    } catch (error) {
      next(error);
    }
  });

  router.get("/users", async (req, res, next) => {
    try {
      res.json(await service.listUsers());
    } catch (error) {
      next(error);
    }
  });

  router.post("/users", async (req, res, next) => {
    try {
      res.status(201).json(await service.createUser(req.body));
    } catch (error) {
      next(error);
    }
  });

  router.put("/users/:username", async (req, res, next) => {
    try {
      res.json(await service.updateUser(req.params.username, req.body));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/users/:username", async (req, res, next) => {
    try {
      res.json(await service.deleteUser(req.params.username));
    } catch (error) {
      next(error);
    }
  });

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
      res.json(await service.getOverview({ ...req.query, branch_databases: req.user?.branch_databases }));
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

  router.get("/dashboard/pusat/kom-stocks/items", async (req, res, next) => {
    try {
      res.json(await service.getKomStockItems(req.query));
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

  router.get("/dashboard/pusat/brc-stocks/items", async (req, res, next) => {
    try {
      res.json(await service.getBrcStockItems(req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/pusat/cabang-stocks", async (req, res, next) => {
    try {
      res.json(await service.getCabangStocks({ ...req.query, branch_databases: req.user?.branch_databases }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/pusat/cabang-stocks/items", async (req, res, next) => {
    try {
      res.json(await service.getCabangStockItems(req.query));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/cabang/aging-stocks", async (req, res, next) => {
    try {
      res.json(await service.getCabangAgingStatus({ ...req.query, branch_databases: req.user?.branch_databases }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/labels", async (req, res, next) => {
    try {
      res.json(await service.getLabelSettings());
    } catch (error) {
      next(error);
    }
  });

  router.put("/dashboard/labels", async (req, res, next) => {
    try {
      res.json(await service.updateLabelSettings(req.body));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/cabang/aging-stocks/settings", async (req, res, next) => {
    try {
      res.json(await service.getCabangAgingSettings(req.user?.branch_databases));
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
      res.status(202).json(await service.createCabangAgingJob({ ...(req.body || req.query), branch_databases: req.user?.branch_databases }));
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
