// Paste this into DevTools console while a Google Slides presentation is
// open in edit view (NOT in Present mode) to capture a bounded structural
// skeleton of the DOM, for manual review while hunting for the edit-view
// canvas and current-slide-indicator selectors tracked as open questions
// in docs/specs/2026-08-21-google-slides-edit-view-recon-design.md.
//
// After running, use DevTools' `copy(result)` to copy the JSON to your
// clipboard — see docs/manual_tests.md's "Verifying Google Slides edit-view
// DOM structure" section for the full procedure.
//
// NOTE: tests/e2e/capture-script-edit-dom-sanity.spec.js calls
// window.captureGoogleSlidesEditDom() directly after injecting this file
// via a classic <script> tag, so captureGoogleSlidesEditDom must stay a
// top-level `function` declaration — not wrapped in an IIFE, not a
// `const`/arrow function — or it won't attach to `window` and that test
// will fail.
function captureGoogleSlidesEditDom() {
  // Safety valve for the whole walk (top document + any same-origin
  // iframes) — if a page's DOM is too large to fully enumerate, stop and
  // flag it rather than silently returning a partial tree.
  const MAX_NODES = 5000;
  // Global tree-depth cap (from the document/iframe body) so a deeply
  // nested chain of wrapper divs (Google's editor toolbar/menu DOM is
  // notoriously deep) can't blow up the capture.
  const MAX_DEPTH = 20;
  // Once inside an <svg>, Slides renders slide text/shapes as vector
  // paths — a content SVG could otherwise dump thousands of glyph nodes.
  // Stop descending after this many levels past the <svg> tag itself.
  const MAX_SVG_DEPTH = 2;
  // For a node with more children than this (counted per side), record
  // only the first/last N plus a count of the rest — keeps a many-slide
  // filmstrip from dumping every thumbnail.
  const MAX_CHILDREN_SHOWN = 10;

  function findCanvasContainer() {
    const el = document.getElementById("canvas-container");
    if (!el) {
      return { found: false, tagName: null, className: null, rect: null };
    }
    const r = el.getBoundingClientRect();
    return {
      found: true,
      tagName: el.tagName,
      // getAttribute, not .className — if el turns out to be an SVG
      // element, .className returns an SVGAnimatedString, not a plain
      // string, and JSON-serializing it silently produces {}. Same
      // precaution the present-mode capture script documents.
      className: el.getAttribute("class"),
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
    };
  }

  function borderStyleOf(el) {
    const cs = getComputedStyle(el);
    const style = {};
    // Check borderStyle (which correctly serializes per-side, e.g. "none
    // none none solid"), not the border shorthand — cs.border is only
    // non-empty when all four sides are identical, so it silently drops
    // one-sided borders (e.g. a left accent bar, a common "selected"
    // indicator pattern). It also false-positives whenever border-color
    // (which defaults to currentColor) isn't black, even with no visible
    // border at all.
    if (cs.borderStyle !== "none") {
      style.borderWidth = cs.borderWidth;
      style.borderStyle = cs.borderStyle;
      style.borderColor = cs.borderColor;
    }
    if (cs.outlineStyle && cs.outlineStyle !== "none") style.outline = cs.outline;
    if (cs.boxShadow && cs.boxShadow !== "none") style.boxShadow = cs.boxShadow;
    // namespaceURI check, not `instanceof SVGElement` — an SVG element from
    // a same-origin iframe's document is an instance of that iframe's own
    // contentWindow.SVGElement, a different realm than the top window's, so
    // `instanceof` here would be false for every SVG element inside an
    // iframe.
    if (el.namespaceURI === "http://www.w3.org/2000/svg") {
      if (cs.stroke && cs.stroke !== "none") {
        style.stroke = cs.stroke;
        if (cs.strokeWidth) style.strokeWidth = cs.strokeWidth;
      }
    }
    return style;
  }

  function attrsOf(el) {
    const attrs = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith("aria-") || attr.name.startsWith("data-") || attr.name === "role") {
        attrs[attr.name] = attr.value;
      }
    }
    return attrs;
  }

  function isRendered(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }

  let visited = 0;
  let truncated = false;

  function skeletonize(el, depth, svgDepth) {
    if (truncated) return null;
    if (visited >= MAX_NODES) {
      truncated = true;
      return null;
    }
    visited++;

    const tag = el.tagName.toLowerCase();
    const inSvg = svgDepth > 0 || tag === "svg";
    const nextSvgDepth = tag === "svg" ? 1 : inSvg ? svgDepth + 1 : 0;

    const r = el.getBoundingClientRect();
    const node = {
      tag,
      id: el.id || null,
      class: el.getAttribute("class") || null,
      attrs: attrsOf(el),
      rect: {
        left: Math.round(r.left),
        top: Math.round(r.top),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
      },
      style: borderStyleOf(el),
      children: [],
    };

    const atGlobalDepthLimit = depth >= MAX_DEPTH;
    const atSvgDepthLimit = inSvg && svgDepth >= MAX_SVG_DEPTH;
    if (atGlobalDepthLimit || atSvgDepthLimit) {
      node.childCount = el.children.length;
      return node;
    }

    const allChildren = Array.from(el.children);
    const renderedChildren = allChildren.filter(isRendered);
    const total = renderedChildren.length;
    const skippedForSize = allChildren.length - total;

    if (total > MAX_CHILDREN_SHOWN * 2) {
      const firstN = renderedChildren.slice(0, MAX_CHILDREN_SHOWN);
      const lastN = renderedChildren.slice(-MAX_CHILDREN_SHOWN);
      node.children = [...firstN, ...lastN]
        .map((c) => skeletonize(c, depth + 1, nextSvgDepth))
        .filter(Boolean);
      node.childrenOmitted = total - firstN.length - lastN.length;
    } else {
      node.children = renderedChildren
        .map((c) => skeletonize(c, depth + 1, nextSvgDepth))
        .filter(Boolean);
    }
    // Zero-size children (e.g. a `display: contents` wrapper with no box of
    // its own but visible children) are filtered out by isRendered before
    // we even get here, which would otherwise silently drop those
    // children's entire subtree with no signal in the output — unlike the
    // fan-out cap above, which records childrenOmitted.
    if (skippedForSize > 0) node.childrenSkipped = skippedForSize;

    return node;
  }

  // Every rect inside a domRoots entry's `root` (including nested
  // descendants) is relative to that root's own document/iframe viewport,
  // not the top document — add hostIframeRect's left/top to a rect to
  // recover top-document coordinates when hostIframeRect is non-null (it's
  // always null for the top-document entry, which needs no such
  // adjustment).
  const domRoots = [
    { hostIframeClassName: null, hostIframeRect: null, root: skeletonize(document.body, 0, 0) },
  ];
  for (const iframe of document.querySelectorAll("iframe")) {
    try {
      if (iframe.contentDocument && iframe.contentDocument.body) {
        domRoots.push({
          hostIframeClassName: iframe.getAttribute("class") || null,
          hostIframeRect: (() => {
            const r = iframe.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          })(),
          root: skeletonize(iframe.contentDocument.body, 0, 0),
        });
      }
    } catch (e) {
      // cross-origin iframe — skip
    }
  }

  return {
    capturedAt: new Date().toISOString(),
    url: window.location.href,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    canvasContainer: findCanvasContainer(),
    domRoots,
    truncated,
  };
}

const result = captureGoogleSlidesEditDom();
result;
