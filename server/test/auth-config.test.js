const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("JWT secret is generated instead of using the legacy hard-coded fallback", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stzh-auth-config-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["-e", "process.stdout.write(require('./routes/auth.js').JWT_SECRET)"],
      {
        cwd: path.resolve(__dirname, ".."),
        env: {
          ...process.env,
          JWT_SECRET: "",
          STZH_DATA_DIR: dataDir,
        },
        encoding: "utf8",
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.notEqual(result.stdout, "stzh-secret-key-change-in-production");
    assert.ok(result.stdout.length >= 64);
    assert.equal(fs.existsSync(path.join(dataDir, ".jwt-secret")), true);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
