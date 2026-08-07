const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "..");

module.exports = async function globalTeardown() {
  const server = globalThis.__speechwaveFixtureServer;
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  execFileSync(path.join(ROOT, "bin", "e2e_mode_off"), { stdio: "inherit" });

  if (process.env.SPEECHWAVE_E2E_DEV_MODE_WAS_ON === "0") {
    execFileSync(path.join(ROOT, "bin", "dev_mode_off"), { stdio: "inherit" });
  }
};
