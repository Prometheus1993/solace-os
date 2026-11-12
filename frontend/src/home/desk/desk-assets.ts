const files = import.meta.glob<string>([
  '../../assets/private/desk-pano-*-v1.png',
  '../../assets/private/{desk-monitor-atlas,desk-books-atlas,desk-puck-atlas}-v1.png',
  '../../assets/private/{desk-keyboard-mouse-atlas,desk-lamp-atlas,desk-accessories-atlas,cyberpunk-hovercar}-v1.png',
  '../../assets/private/desk-cat-*-v1.png',
  '../../assets/private/desk-flying-train*-v1.png',
], { eager: true, query: '?url', import: 'default' });

/** Bundled URL of `assets/private/<name>-v1.png`; undefined when the file is missing. */
export const deskAsset = (name: string) => files[`../../assets/private/${name}-v1.png`];
