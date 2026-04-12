const { checkFireworksTrigger } = require("../lib/fireworks");

const opts = { minCount: 5, minPercent: 0.4 };

describe("checkFireworksTrigger", () => {
  test("returns true when count and percent both exceed thresholds", () => {
    // count=6, total=8, percent=0.75 — both pass
    expect(checkFireworksTrigger({ "❤️": 6, "👍": 2 }, "❤️", opts)).toBe(true);
  });

  test("returns false when count is below minCount", () => {
    // count=4, total=5, percent=0.8 — count fails
    expect(checkFireworksTrigger({ "❤️": 4, "👍": 1 }, "❤️", opts)).toBe(false);
  });

  test("returns false when percent is below minPercent", () => {
    // count=6, total=26, percent=0.23 — percent fails
    expect(checkFireworksTrigger({ "❤️": 6, "👍": 20 }, "❤️", opts)).toBe(false);
  });

  test("returns false when emoji is not in flight", () => {
    expect(checkFireworksTrigger({ "👍": 10 }, "❤️", opts)).toBe(false);
  });

  test("returns false when inFlight is empty", () => {
    expect(checkFireworksTrigger({}, "❤️", opts)).toBe(false);
  });

  test("percent is relative to all in-flight emoji types combined", () => {
    // count=5, total=15, percent=0.33 — below 0.4 threshold
    expect(checkFireworksTrigger({ "❤️": 5, "👍": 5, "🔥": 5 }, "❤️", opts)).toBe(false);
  });

  test("returns true at exactly the thresholds", () => {
    // count=5, total=12, percent=0.41 — both pass at boundary
    expect(checkFireworksTrigger({ "❤️": 5, "👍": 7 }, "❤️", opts)).toBe(true);
  });

  test("returns true when percent is exactly at minPercent boundary", () => {
    // count=10, total=25, percent=0.4 exactly — both pass at boundary
    expect(checkFireworksTrigger({ "❤️": 10, "👍": 15 }, "❤️", opts)).toBe(true);
  });
});
