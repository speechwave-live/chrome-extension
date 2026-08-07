const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "..");

// Runs one independent cleanup step. If it throws, the error is logged and
// returned (not re-thrown) so the caller can move on to the remaining
// cleanup steps instead of aborting teardown early — e.g. if e2e_mode_off
// fails, dev_mode_off must still run so DEV_MODE doesn't get left on.
async function runStep(name, fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    console.error(`globalTeardown: step "${name}" failed:`, err);
    return err;
  }
}

module.exports = async function globalTeardown() {
  const errors = [];

  const closeServerError = await runStep("close fixture server", async () => {
    const server = globalThis.__speechwaveFixtureServer;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  if (closeServerError) errors.push(closeServerError);

  const e2eModeOffError = await runStep("e2e_mode_off", async () => {
    execFileSync(path.join(ROOT, "bin", "e2e_mode_off"), { stdio: "inherit" });
  });
  if (e2eModeOffError) errors.push(e2eModeOffError);

  if (process.env.SPEECHWAVE_E2E_DEV_MODE_WAS_ON === "0") {
    const devModeOffError = await runStep("dev_mode_off", async () => {
      execFileSync(path.join(ROOT, "bin", "dev_mode_off"), { stdio: "inherit" });
    });
    if (devModeOffError) errors.push(devModeOffError);
  }

  if (errors.length > 0) {
    throw new Error(
      `globalTeardown: ${errors.length} step(s) failed (see logs above): ` +
        errors.map((e) => e.message).join("; ")
    );
  }
};
