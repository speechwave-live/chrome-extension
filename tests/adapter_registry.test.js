const fs = require("fs");
const path = require("path");
const { getAdapter } = require("../adapters/index");

describe("adapter registry", () => {
  test("returns Google Slides adapter that reads slide number from the DOM", () => {
    const fixture = fs.readFileSync(
      path.join(__dirname, "fixtures", "google_slides_dom.html"),
      "utf-8"
    );
    document.body.innerHTML = fixture;
    const adapter = getAdapter(
      "https://docs.google.com/presentation/d/abc123/edit"
    );
    expect(adapter.getSlide()).toBe(3);
    document.body.innerHTML = "";
  });

  test("returns fallback adapter for unknown URLs", () => {
    const adapter = getAdapter("https://example.com/my-slides");
    expect(adapter.getSlide()).toBe(0);
  });

  test("fallback adapter always returns 0", () => {
    const adapter = getAdapter("https://slides.com/user/deck");
    expect(adapter.getSlide()).toBe(0);
  });
});
