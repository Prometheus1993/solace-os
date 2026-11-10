/** Three fixed texture layers (micro-grid / scanlines / vignette). Visible only when the root has
 * `.fx-on` (the texture toggle); the moving scanline is also killed by prefers-reduced-motion. All
 * styling lives in styles/base.css — this only mounts the layers. */
export function ScanlineOverlay() {
  return (
    <>
      <div className="fx-grid" />
      <div className="fx-scanlines" />
      <div className="fx-vignette" />
    </>
  );
}
