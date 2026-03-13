require("dotenv").config();

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

  app.use(cors());
  app.use(helmet());
  app.use(express.json());
  app.use("/api/v1", createRoutes(service));

  app.use((error, req, res, next) => {
    res.status(500).json({
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
