function checkFireworksTrigger(inFlight, emoji, { minCount, minPercent }) {
  const count = inFlight[emoji] || 0;
  const total = Object.values(inFlight).reduce((a, b) => a + b, 0);
  const percent = total > 0 ? count / total : 0;
  return count >= minCount && percent >= minPercent;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { checkFireworksTrigger };
} else {
  window.JoyconfFireworks = { checkFireworksTrigger };
}
