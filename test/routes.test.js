const test = require("node:test");
const assert = require("node:assert/strict");

const { createRoutes } = require("../src/routes");

test("createRoutes registers cabang aging stocks endpoint", () => {
  const service = {
    getOverview: async () => ({}),
    getGrosirStocks: async () => ({}),
    getTransfers: async () => ({}),
    getKeepStocks: async () => ({}),
    getKomStocks: async () => ({}),
    getBrcStocks: async () => ({}),
    getCabangStocks: async () => ({}),
    getCabangAgingStocks: async () => ({})
  };

  const router = createRoutes(service);
  const routePaths = router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  assert.ok(routePaths.includes("/dashboard/cabang/aging-stocks"));
});
