const files = import.meta.glob<string>([
  '../../assets/private/{desk-city-far,desk-surface,desk-monitor-atlas,desk-books-atlas,desk-puck-atlas,desk-window-frame}-v1.png',
  '../../assets/private/{desk-keyboard-mouse-atlas,desk-lamp,desk-accessories-atlas,cyberpunk-hovercar}-v1.png',
  '../../assets/private/desk-floor-companion-spaced-atlas-v1.png',
  '../../assets/private/desk-flying-train*-v1.png',
  '../../assets/private/desk-city-buildings-atlas-v1.png',
  '../../assets/private/desk-japanese-billboards-atlas-v1.png',
], { eager: true, query: '?url', import: 'default' });

/** Bundled URL of `assets/private/<name>-v1.png`; undefined when the file is missing. */
export const deskAsset = (name: string) => files[`../../assets/private/${name}-v1.png`];
