const fs = require("fs");
const path = require("path");
const { getSlide } = require("../adapters/google_slides");

function loadFixture(name) {
  const fixturePath = path.join(__dirname, "fixtures", name);
  return fs.readFileSync(fixturePath, "utf-8");
}

describe("Google Slides adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = loadFixture("google_slides_dom.html");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("returns the current slide number from the a11y element", () => {
    expect(getSlide()).toBe(3);
  });

  test("returns 0 when the slide indicator element is absent", () => {
    document.body.innerHTML = "<div>no slides here</div>";
    expect(getSlide()).toBe(0);
  });

  test("returns 0 when the aria-label does not contain a valid slide number", () => {
    const el = document.querySelector(".punch-viewer-svgpage-a11yelement");
    el.setAttribute("aria-label", "Slide of something");
    expect(getSlide()).toBe(0);
  });
});
