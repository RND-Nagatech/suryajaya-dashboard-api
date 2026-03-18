const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateAgeDays,
  resolveBranchDatabases
} = require("../src/utils");

test("calculateAgeDays returns 0 when dates are the same", () => {
  assert.equal(calculateAgeDays("2026-03-18", "2026-03-18"), 0);
});

test("calculateAgeDays returns full-day difference without off-by-one", () => {
  assert.equal(calculateAgeDays("2026-03-15", "2026-03-18"), 3);
  assert.equal(calculateAgeDays("2025-12-19", "2026-03-18"), 89);
});

test("resolveBranchDatabases uses all available non-excluded databases when no dbs are requested", () => {
  assert.deepEqual(
    resolveBranchDatabases({
      requestedDbs: "",
      defaultDbs: [],
      availableDbs: ["g3", "g5", "admin", "db_suryajaya_pusat", "local"],
      excludedDbs: ["admin", "local"]
    }),
    ["g3", "g5", "db_suryajaya_pusat"]
  );
});

test("resolveBranchDatabases trims requested values and removes duplicates", () => {
  assert.deepEqual(
    resolveBranchDatabases({
      requestedDbs: " g3, g5, g3, ",
      defaultDbs: [],
      availableDbs: ["g3", "g5", "db_suryajaya_pusat"],
      excludedDbs: []
    }),
    ["g3", "g5"]
  );
});

test("resolveBranchDatabases throws when a requested database does not exist", () => {
  assert.throws(
    () =>
      resolveBranchDatabases({
        requestedDbs: "g3,g9",
        defaultDbs: [],
        availableDbs: ["g3", "g5"],
        excludedDbs: []
      }),
    /Branch database not found: g9/
  );
});
