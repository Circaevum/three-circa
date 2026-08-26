/**
 * Circaevum Event Label Renderer
 * Generates 2D canvas text sprites, 3D surface text plane meshes, font sizing,
 * line wrapping, and color contrast calculations for event labels.
 */
(function (global) {
  'use strict';

  const DEFAULT_LABEL_COLOR_HEX = 0x9ca3af;
  const EVENT_LABEL_SPRITE_RENDER_ORDER = 999;

  function luminanceForHex(hex) {
    const h = typeof hex === 'number' && !isNaN(hex) ? hex : DEFAULT_LABEL_COLOR_HEX;
    const r = ((h >> 16) & 0xff) / 255;
    const g = ((h >> 8) & 0xff) / 255;
    const b = (h & 0xff) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function eventNameToCanvasLines(text, ctx, maxLineWidthPx) {
    const str = text != null ? String(text).trim() : '';
    if (!str) return [''];
    const maxW = Math.max(40, maxLineWidthPx);
    const paragraphs = str.split('\n');
    const outLines = [];

    for (let p = 0; p < paragraphs.length; p++) {
      const para = paragraphs[p].trim();
      if (!para) {
        outLines.push('');
        continue;
      }
      const words = para.split(/\s+/);
      let curLine = '';
      for (let w = 0; w < words.length; w++) {
        const word = words[w];
        const testLine = curLine ? `${curLine} ${word}` : word;
        if (ctx.measureText(testLine).width <= maxW || !curLine) {
          curLine = testLine;
        } else {
          outLines.push(curLine);
          curLine = word;
        }
      }
      if (curLine) outLines.push(curLine);
    }
    return outLines.length ? outLines : [str];
  }

  function strokeAndFillEventNameOnCanvas(ctx, text, tx, ty, r, g, b, fontPx, isNameLabel) {
    if (!ctx || !text) return;
    if (isNameLabel) {
      ctx.lineWidth = Math.max(3, Math.round(fontPx * 0.18));
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.88)';
      ctx.strokeText(text, tx, ty);
    }
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
    ctx.fillText(text, tx, ty);
  }

  function measureEventSurfaceLabelCanvasSize(text, fontPx, pad, maxLineWidthPx) {
    const fp = Math.max(8, Math.round(fontPx));
    const p = pad != null ? pad : 14;
    if (typeof document === 'undefined') {
      return { cw: 120, ch: 40 };
    }
    const probe = document.createElement('canvas');
    const ctx = probe.getContext('2d');
    ctx.font = `bold ${fp}px Orbitron`;
    const lh = fp * 1.22;
    if (maxLineWidthPx != null && maxLineWidthPx > 0) {
      const lines = eventNameToCanvasLines(text, ctx, maxLineWidthPx);
      let tw = 80;
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (ln) tw = Math.max(tw, ctx.measureText(ln).width);
      }
      const ch = Math.ceil(Math.max(lh + p * 2, lines.length * lh + p * 2));
      const cw = Math.ceil(Math.max(80, tw + p * 2));
      return { cw, ch, lines, lineHeight: lh };
    }
    const tw = text ? ctx.measureText(String(text)).width : 40;
    const ch = Math.ceil(Math.max(40, fp + p * 2));
    return {
      cw: Math.ceil(Math.max(80, tw + p * 2)),
      ch
    };
  }

  function createEventSurfaceTextMesh(text, colorHex, planeWorldW, planeWorldH, fontPx, textAlign, isNameLabel, mapWideAlongRibbonTangent, maxLineWidthPx) {
    const THREE = global.THREE;
    if (!THREE || typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fp = Math.max(8, Math.round(fontPx));
    ctx.font = `bold ${fp}px Orbitron`;
    const pad = 14;
    const align = textAlign === 'left' ? 'left' : 'center';
    const layout = measureEventSurfaceLabelCanvasSize(text, fp, pad, maxLineWidthPx);
    const cw = layout.cw;
    const ch = layout.ch;
    canvas.width = cw;
    canvas.height = ch;
    const textColorHex = (colorHex != null && luminanceForHex(colorHex) >= 0.35) ? colorHex : DEFAULT_LABEL_COLOR_HEX;
    const r = (textColorHex >> 16) & 0xff;
    const g = (textColorHex >> 8) & 0xff;
    const b = textColorHex & 0xff;
    ctx.font = `bold ${fp}px Orbitron`;
    ctx.textAlign = align;
    if (text) {
      const tx = align === 'left' ? pad : cw / 2;
      if (layout.lines && layout.lines.length) {
        const lh = layout.lineHeight || fp * 1.22;
        for (let li = 0; li < layout.lines.length; li++) {
          const ln = layout.lines[li];
          const ty = pad + (li + 0.5) * lh;
          if (ln) strokeAndFillEventNameOnCanvas(ctx, ln, tx, ty, r, g, b, fp, !!isNameLabel);
        }
      } else {
        const ty = ch / 2;
        strokeAndFillEventNameOnCanvas(ctx, text, tx, ty, r, g, b, fp, !!isNameLabel);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (mapWideAlongRibbonTangent) {
      tex.center.set(0.5, 0.5);
      tex.rotation = Math.PI / 2;
    }
    const geo = new THREE.PlaneGeometry(planeWorldW, planeWorldH);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = EVENT_LABEL_SPRITE_RENDER_ORDER;
    mesh.userData = mesh.userData || {};
    mesh.userData.baseScale = { x: planeWorldW, y: planeWorldH, z: 1 };
    return mesh;
  }

  function createEventLineLabelSprite(text, colorHex, x, y, z, scale, isNameLabel) {
    const THREE = global.THREE;
    if (!THREE || typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const font = 'bold 36px Orbitron';
    context.font = font;

    const padding = 24;
    const minWidth = 256;
    const height = 64;

    let width = minWidth;
    if (isNameLabel && text) {
      const metrics = context.measureText(text);
      width = Math.ceil(Math.max(minWidth, metrics.width + padding * 2));
    }
    canvas.width = width;
    canvas.height = height;

    const textColorHex = (colorHex != null && luminanceForHex(colorHex) >= 0.35) ? colorHex : DEFAULT_LABEL_COLOR_HEX;
    const r = (textColorHex >> 16) & 0xff;
    const g = (textColorHex >> 8) & 0xff;
    const b = textColorHex & 0xff;
    context.font = font;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const nx = width / 2;
    const ny = height / 2;
    if (isNameLabel) {
      strokeAndFillEventNameOnCanvas(context, text, nx, ny, r, g, b, 36, true);
    } else {
      context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
      context.fillText(text, nx, ny);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      alphaTest: 0.05
    });
    if (typeof global.CircaevumWebGPUPipeline !== 'undefined' && typeof global.CircaevumWebGPUPipeline.applyGPUBillboardToMaterial === 'function') {
      global.CircaevumWebGPUPipeline.applyGPUBillboardToMaterial(mat);
    }
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = EVENT_LABEL_SPRITE_RENDER_ORDER;
    let finalY = y;
    const amt = typeof global.currentFlattenAmount === 'number' ? global.currentFlattenAmount : 0;
    if (amt > 0.001) {
      const focusY = typeof global.flattenTimelineFocusY === 'function' ? global.flattenTimelineFocusY() : 0;
      finalY = typeof global.flattenTimelineLogicalY === 'function' ? global.flattenTimelineLogicalY(y, focusY, amt) : y;
    }
    sprite.position.set(x, finalY, z);
    sprite.userData = sprite.userData || {};
    sprite.userData.logicalY = y;
    const s = scale != null ? scale : 8;
    const sx = s * (width / minWidth);
    const sy = s * 0.3;
    sprite.scale.set(sx, sy, 1);
    return sprite;
  }

  const EventLabelRenderer = {
    DEFAULT_LABEL_COLOR_HEX,
    luminanceForHex,
    eventNameToCanvasLines,
    strokeAndFillEventNameOnCanvas,
    measureEventSurfaceLabelCanvasSize,
    createEventSurfaceTextMesh,
    createEventLineLabelSprite
  };

  global.EventLabelRenderer = EventLabelRenderer;
  global.DEFAULT_LABEL_COLOR_HEX = DEFAULT_LABEL_COLOR_HEX;
  global.luminanceForHex = luminanceForHex;
  global.strokeAndFillEventNameOnCanvas = strokeAndFillEventNameOnCanvas;
  global.measureEventSurfaceLabelCanvasSize = measureEventSurfaceLabelCanvasSize;
  global.createEventSurfaceTextMesh = createEventSurfaceTextMesh;
  global.createEventLineLabelSprite = createEventLineLabelSprite;

})(typeof window !== 'undefined' ? window : globalThis);
