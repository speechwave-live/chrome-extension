const { execFileSync } = require("child_process");
const path = require("path");

const SPEECHWAVE_ROOT = path.join(__dirname, "..", "..", "..", "..", "speechwave");

function parseKeyValueOutput(output) {
  const result = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^(\w+)=(.*)$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function seedTalk(email) {
  const output = execFileSync(
    "mix",
    ["run", "scripts/manual_tests/seed_active_session.exs", email],
    { cwd: SPEECHWAVE_ROOT, encoding: "utf8" }
  );
  const result = parseKeyValueOutput(output);
  // `mix run` in the dev environment interleaves Ecto debug query logging
  // into stdout alongside the script's key=value output, so verify parsing
  // actually found the fields we need instead of trusting an empty/partial
  // result silently — mirroring the safety net `fetchApiKey` uses above.
  const requiredFields = ["talk_slug", "email", "talk_id", "session_id"];
  const missing = requiredFields.filter((field) => !result[field]);
  if (missing.length > 0) {
    throw new Error(
      `seedTalk: missing expected field(s) [${missing.join(", ")}] in output:\n${output}`
    );
  }
  return result;
}

function fetchApiKey(email) {
  const output = execFileSync(
    "mix",
    [
      "run",
      "-e",
      `IO.puts(Speechwave.Accounts.get_user_by_email(${JSON.stringify(email)}).api_key)`,
    ],
    { cwd: SPEECHWAVE_ROOT, encoding: "utf8" }
  );
  // `mix run -e` in the dev environment interleaves Ecto debug query
  // logging into stdout alongside the IO.puts output, so pull the hex key
  // out with a regex instead of trusting the whole output is clean.
  const match = output.match(/\b[0-9a-f]{64}\b/i);
  if (!match) {
    throw new Error(`fetchApiKey: no 64-char hex API key found in output:\n${output}`);
  }
  return match[0];
}

function cleanupTestUser() {
  execFileSync("mix", ["run", "scripts/manual_tests/cleanup_manual_test_users.exs"], {
    cwd: SPEECHWAVE_ROOT,
    stdio: "inherit",
  });
}

module.exports = { seedTalk, fetchApiKey, cleanupTestUser };
