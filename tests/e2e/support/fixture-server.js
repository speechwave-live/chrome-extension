const http = require("http");
const fs = require("fs");
const path = require("path");
const { FIXTURE_PORT } = require("./constants");

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");
const ROUTES = {
  "/": "slides.html",
  "/windowed-slide.html": "windowed-slide.html",
  "/slide-frame.html": "slide-frame.html",
};

function startFixtureServer() {
  const pages = new Map(
    Object.entries(ROUTES).map(([route, file]) => [
      route,
      fs.readFileSync(path.join(FIXTURES_DIR, file)),
    ])
  );

  const server = http.createServer((req, res) => {
    const html = pages.get(req.url) || pages.get("/");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(FIXTURE_PORT, "localhost", () => resolve(server));
  });
}

module.exports = { startFixtureServer };
