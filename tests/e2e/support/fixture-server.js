const http = require("http");
const fs = require("fs");
const path = require("path");
const { FIXTURE_PORT } = require("./constants");

const FIXTURE_FILE = path.join(__dirname, "..", "fixtures", "slides.html");

function startFixtureServer() {
  const html = fs.readFileSync(FIXTURE_FILE);
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(FIXTURE_PORT, "localhost", () => resolve(server));
  });
}

module.exports = { startFixtureServer };
