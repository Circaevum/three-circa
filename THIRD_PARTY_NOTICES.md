Third-Party Notices
===================

This web viewer includes and/or references third-party software.
This file documents attribution and license information for those dependencies.

1) Three.js
-----------
- Component: `circaevum/js/three.min.js`
- Upstream: https://github.com/mrdoob/three.js
- License: MIT
- Copyright: Three.js Authors
- Note: `three.min.js` includes `SPDX-License-Identifier: MIT` in its header.

2) Astronomy Engine
-------------------
- Component: `circaevum/js/vendor/astronomy-engine/astronomy.min.js` (vendored, pinned)
- Version: 2.1.19
- Upstream: https://github.com/cosinekitty/astronomy
- npm: https://www.npmjs.com/package/astronomy-engine
- License: MIT
- Copyright: Don Cross
- Included license text: `circaevum/js/vendor/astronomy-engine/LICENSE.txt`

3) html2canvas
--------------
- Component: CDN script in `index.html`
- URL: https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
- Version: 1.4.1
- Upstream: https://github.com/niklasvh/html2canvas
- License: MIT

4) D3 arc generator
-------------------
- Component: `circaevum/js/vendor/d3-arc/d3-arc.min.js`
- Source: [d3-shape 3.2.0](https://github.com/d3/d3-shape/tree/v3.2.0) (`src/arc.js`) and [d3-path 3.1.0](https://github.com/d3/d3-path/tree/v3.1.0).
- Build: bundle the default export of `d3-shape/src/arc.js` as named export `arc` using esbuild with `--bundle --minify --format=iife --global-name=CircaevumD3`.
- License: ISC. License texts are in `circaevum/js/vendor/d3-arc/`.

Project license
---------------
- The current project license file is `LICENSE`.
- Third-party components above remain under their own licenses.

Maintenance notes
-----------------
- If dependency versions change, update this file.
- If a CDN dependency is vendored later, include its local path and license text location.
