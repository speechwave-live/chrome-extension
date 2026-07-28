const DEFAULT_REMOTE_CONFIG = {
  settings: { overlay_size_percent: 20, fireworks_enabled: true },
  tuning: {
    default_overlay_size_percent: 20,
    min_overlay_size_percent: 10,
    overlay_margin_px: 8,
    emoji_font_size_ratio: 0.14,
    firework_font_size_ratio: 0.12,
    firework_center_x_ratio: 0.5,
    firework_center_y_ratio: 0.5,
    firework_spread_min_ratio: 0.375,
    firework_spread_range_ratio: 0.25,
    emoji_rise_ratio: 0.3,
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DEFAULT_REMOTE_CONFIG };
} else {
  globalThis.DEFAULT_REMOTE_CONFIG = DEFAULT_REMOTE_CONFIG;
}
