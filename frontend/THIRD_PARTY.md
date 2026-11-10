# Third-party material (frontend)

### Desktop radio: Open Lo-Fi

Six locally bundled MP3s in `public/music/open-lofi/` from [btahir/open-lofi](https://github.com/btahir/open-lofi), release v1.0.0: High Rise Haze, Midnight Window Glow, Storm Over Side Streets, After School Rain, Chapter By Lamplight, Terminal Rain. Upstream releases the tracks under CC0 1.0 Universal and states they were generated using Suno v5. License text: `licenses/open-lofi-CC0.txt`; exact archive source, entry names, file sizes and SHA-256 checksums: `public/music/open-lofi/provenance.json`. Only the selected six entries were downloaded via verified ZIP byte ranges, not the entire collection. No runtime third-party audio service or account required.







| Name | Version | Licence | Source | How it is used |
|---|---|---|---|---|
| Oxanium (latin 400/600/700 woff2) | `@fontsource/oxanium` 5.3.0 files | SIL Open Font License 1.1 | https://github.com/sevmeyer/oxanium | Local font files in `src/assets/fonts/` (licence text: `src/assets/fonts/OFL.txt`). No CDN. The font npm package itself is NOT a dependency; only the files are copied. |
| Inter (latin 300/400/500 woff2) | `@fontsource/inter` 5.3.0 files | SIL OFL 1.1 | https://github.com/rsms/inter | Local files in `src/assets/fonts/` (light theme body text). Licence: `licenses/inter-OFL.txt`. Only the files are copied, not the package. |
| JetBrains Mono (latin 400/500 woff2) | `@fontsource/jetbrains-mono` 5.3.0 files | SIL OFL 1.1 | https://github.com/JetBrains/JetBrainsMono | Local files in `src/assets/fonts/` (light theme mono text). Licence: `licenses/jetbrains-mono-OFL.txt`. Only the files are copied, not the package. |
| Share Tech Mono (latin 400 woff2) | `@fontsource/share-tech-mono` 5.3.0 files | SIL OFL 1.1 | https://fonts.google.com/specimen/Share+Tech+Mono | Local file in `src/assets/fonts/` for data, serials, logs and table values. Licence: `licenses/share-tech-mono-OFL.txt`. Only the file is copied, not the package. |
| @tabler/icons-react | 3.50.0 (exact, npm dependency, in the lockfile) | MIT | https://github.com/tabler/tabler-icons | Named imports only, in `src/home/icons.tsx`. Licence: `licenses/tabler-icons-MIT.txt`. |

### Evaluated and not used
- Arwes (`@arwes/react` 1.0.0-next.25020502, MIT) was spiked (jsdom, React 18 `<StrictMode>`): the `Text` decipher never animated and left the title `visibility: hidden` under StrictMode, while it worked without StrictMode. Dropped.

Design references only (no code copied): eDEX-UI, Arwes, SYS-UI.

The desk, city and avatar artwork in `src/assets/private/` is generated locally for this project and shipped with the repo. `src/assets/avatar-placeholder.svg` remains the fallback if a file is missing.
