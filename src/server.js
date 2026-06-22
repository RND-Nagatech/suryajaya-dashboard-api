require("dotenv").config();

const { signToken, authMiddleware } = require("./auth");
const { connectCache, cacheMiddlewareShort, cacheMiddlewareLong, invalidateKeys } = require("./cache");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { getConfig } = require("./config");
const { MongoConnections } = require("./db");
const { DashboardService } = require("./dashboardService");
const { createRoutes } = require("./routes");

async function bootstrap() {
  const config = getConfig();
  const mongoConnections = new MongoConnections(config);

  await Promise.all([
    mongoConnections.connect(),
    connectCache()
  ]);

  const app = express();
  const service = new DashboardService(mongoConnections.getDbs(), config);

  await service.seedDefaultUser();

  app.use(cors());
  app.use(helmet());
  app.use(express.json());

  // --- Public endpoints (no auth) ---
  app.post("/api/v1/auth/login", async (req, res, next) => {
    try {
      res.json(await service.login(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/health", (req, res) => {
    res.json({ ok: true, service: "suryajaya-dashboard-api" });
  });

  // --- Auth middleware ---
  app.use("/api/v1", authMiddleware(service.usersCollection()));

  // --- Auth endpoints ---
  app.get("/api/v1/auth/me", (req, res) => {
    res.json({ data: req.user || null });
  });

  app.post("/api/v1/auth/verify-superuser", async (req, res, next) => {
    try {
      res.json(await service.verifySuperuser(req.body));
    } catch (error) {
      next(error);
    }
  });

  // --- Cached read endpoints (Tier 2: 30s TTL) ---
  const cache30 = cacheMiddlewareShort();
  app.get("/api/v1/dashboard/overview", cache30, async (req, res, next) => {
    try {
      res.json(await service.getOverview({ ...req.query, branch_databases: req.user?.branch_databases }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/dashboard/grosir/stocks", cache30, async (req, res, next) => {
    try {
      res.json(await service.getGrosirStocks(req.query));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/dashboard/grosir-to-pusat/transfers", cache30, async (req, res, next) => {
    try {
      res.json(await service.getTransfers(req.query));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/dashboard/pusat/keep-stocks", cache30, async (req, res, next) => {
    try {
      res.json(await service.getKeepStocks(req.query));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/dashboard/pusat/kom-stocks", cache30, async (req, res, next) => {
    try {
      res.json(await service.getKomStocks(req.query));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/dashboard/pusat/brc-stocks", cache30, async (req, res, next) => {
    try {
      res.json(await service.getBrcStocks(req.query));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/dashboard/pusat/cabang-stocks", cache30, async (req, res, next) => {
    try {
      res.json(await service.getCabangStocks({ ...req.query, branch_databases: req.user?.branch_databases }));
    } catch (error) {
      next(error);
    }
  });

  // --- Cached read endpoints (Tier 3: 5min TTL) ---
  const cache5m = cacheMiddlewareLong();
  app.get("/api/v1/dashboard/labels", cache5m, async (req, res, next) => {
    try {
      res.json(await service.getLabelSettings());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/dashboard/cabang/aging-stocks/settings", cache5m, async (req, res, next) => {
    try {
      res.json(await service.getCabangAgingSettings(req.user?.branch_databases));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/dashboard/groups", cache5m, async (req, res, next) => {
    try {
      res.json(await service.listGroups());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/dashboard/exclude-groups", cache5m, async (req, res, next) => {
    try {
      res.json(await service.getExcludeGroupSettings());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/users", cache5m, async (req, res, next) => {
    try {
      res.json(await service.listUsers());
    } catch (error) {
      next(error);
    }
  });

  // --- Mutating endpoints with cache invalidation ---
  app.put("/api/v1/dashboard/labels", async (req, res, next) => {
    try {
      const result = await service.updateLabelSettings(req.body);
      await invalidateKeys("cache:/api/v1/dashboard/labels*");
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/v1/dashboard/cabang/aging-stocks/settings", async (req, res, next) => {
    try {
      const result = await service.updateCabangAgingSettings(req.body);
      await invalidateKeys("cache:/api/v1/dashboard/cabang/aging-stocks*");
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/v1/dashboard/exclude-groups", async (req, res, next) => {
    try {
      const result = await service.updateExcludeGroupSettings(req.body);
      await invalidateKeys("cache:/api/v1/dashboard/overview*", "cache:/api/v1/dashboard/pusat/*");
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/dashboard/cabang/aging-stocks/jobs", async (req, res, next) => {
    try {
      const result = await service.createCabangAgingJob({ ...(req.body || req.query), branch_databases: req.user?.branch_databases });
      await invalidateKeys("cache:/api/v1/dashboard/cabang/aging-stocks*");
      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/users", async (req, res, next) => {
    try {
      const result = await service.createUser(req.body);
      await invalidateKeys("cache:/api/v1/users*");
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/v1/users/:username", async (req, res, next) => {
    try {
      const result = await service.updateUser(req.params.username, req.body);
      await invalidateKeys("cache:/api/v1/users*");
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/v1/users/:username", async (req, res, next) => {
    try {
      const result = await service.deleteUser(req.params.username);
      await invalidateKeys("cache:/api/v1/users*");
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // --- Non-cached routes (detail items, aging drilldown, job status) ---
  app.use("/api/v1", createRoutes(service));

  // --- Error handler ---
  app.use((error, req, res, next) => {
    const status = Number(error.statusCode || error.status || 500);
    res.status(status).json({
      message: error.message || "Internal server error"
    });
  });

  const server = app.listen(config.port, () => {
    console.log(`Suryajaya dashboard API running on port ${config.port}`);
  });

  const shutdown = async () => {
    await mongoConnections.close();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
