const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { startFixtureServer } = require("./fixture-server");

const ROOT = path.join(__dirname, "..", "..", "..");
const PITCHFORK_DAEMON = "speechwave/web";

function ensureDevServerRunning() {
  let running = false;
  try {
    const output = execFileSync("pitchfork", ["status", PITCHFORK_DAEMON, "--json"], {
      encoding: "utf8",
    });
    running = JSON.parse(output).status === "running";
  } catch {
    running = false;
  }

  if (!running) {
    execFileSync("pitchfork", ["start", PITCHFORK_DAEMON], { stdio: "inherit" });
  }
}

function ensureDevModeOn() {
  const backgroundJs = fs.readFileSync(path.join(ROOT, "background", "background.js"), "utf8");
  const wasAlreadyOn = /^const DEV_MODE = true;/m.test(backgroundJs);
  process.env.SPEECHWAVE_E2E_DEV_MODE_WAS_ON = wasAlreadyOn ? "1" : "0";

  if (!wasAlreadyOn) {
    execFileSync(path.join(ROOT, "bin", "dev_mode_on"), { stdio: "inherit" });
  }
}

module.exports = async function globalSetup() {
  ensureDevServerRunning();
  ensureDevModeOn();
  execFileSync(path.join(ROOT, "bin", "e2e_mode_on"), { stdio: "inherit" });

  globalThis.__speechwaveFixtureServer = await startFixtureServer();
};
