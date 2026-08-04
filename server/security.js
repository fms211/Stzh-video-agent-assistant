const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function loadJwtSecret() {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) {
    if (configured.length < 32) {
      throw new Error("JWT_SECRET must contain at least 32 characters");
    }
    return configured;
  }

  const dataDir = process.env.STZH_DATA_DIR || __dirname;
  fs.mkdirSync(dataDir, { recursive: true });
  const secretPath = path.join(dataDir, ".jwt-secret");

  if (fs.existsSync(secretPath)) {
    const saved = fs.readFileSync(secretPath, "utf8").trim();
    if (saved.length >= 64) return saved;
  }

  const generated = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(secretPath, generated, { encoding: "utf8", mode: 0o600 });
  return generated;
}

module.exports = { loadJwtSecret };
