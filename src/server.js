require("dotenv").config();

const { signToken, authMiddleware } = require("./auth");
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

  await mongoConnections.connect();

  const app = express();
  const service = new DashboardService(mongoConnections.getDbs(), config);

  await service.seedDefaultUser();

  app.use(cors());
  app.use(helmet());
  app.use(express.json());

  app.post("/api/v1/auth/login", async (req, res, next) => {
    try {
      res.json(await service.login(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/health", async (req, res) => {
    res.json({ ok: true, service: "suryajaya-dashboard-api" });
  });

  app.use("/api/v1", authMiddleware(service.usersCollection()));

  app.get("/api/v1/auth/me", async (req, res) => {
    res.json({ data: req.user || null });
  });

  app.post("/api/v1/auth/verify-superuser", async (req, res, next) => {
    try {
      res.json(await service.verifySuperuser(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/v1", createRoutes(service));

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
