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

  return router;
}

module.exports = {
  createRoutes
};
