/**
 * XR UI – in-scene panel for hand/controller interaction (e.g. Apple Vision Pro)
 *
 * Renders a floating panel with a zoom slider (1–9), time-scale (− / +)
 * with a live n× label, and « / » to step selected time by that many
 * calendar units at the current zoom.
 *
 * Uses WebXR selectstart/selectend and frame.getPose(targetRaySpace) for
 * raycasting; works when inputSource.gamepad is absent (hand tracking).
 */

(function (global) {
  const THREE = global.THREE;
  if (!THREE) return;

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 9;
  const PANEL_WIDTH = 0.72;
  const PANEL_HEIGHT = 0.62;
  const TRACK_WIDTH = 0.5;
  const TRACK_HEIGHT = 0.014;
  const THUMB_SIZE = 0.05;
  const ICON_Y = 0.24;
  const SLIDER_Y = 0.14;
  const ICON_WIDTH = 0.1;
  const ICON_HEIGHT = 0.1;
  const ICON_GAP = 0.03;
  const LABEL_HEIGHT_PX = 32;
  const CANVAS_DPI = 2;
  /** Row below zoom track: coarser/finer multi-step for XR time navigation (see main.js xrTimeScale). */
  const TIME_SCALE_ROW_Y = 0.088;
  const TIME_SCALE_BTN_W = 0.068;
  const TIME_SCALE_BTN_H = 0.068;
  const LAYER_ROW_HEIGHT = 0.055;
  const LAYER_ROW_WIDTH = 0.64;
  const LAYER_ROW_GAP = 0.01;
  const LAYERS_HEADER_HEIGHT = 0.04;

  function makeButtonTexture(label, bgColorHex) {
    var w = 128 * CANVAS_DPI;
    var h = 128 * CANVAS_DPI;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var r = 12;
    ctx.fillStyle = '#0a0e17';
    ctx.strokeStyle = bgColorHex ? ('#' + bgColorHex.toString(16).padStart(6, '0')) : '#334155';
    ctx.lineWidth = 3;
    roundRect(ctx, 4, 4, w - 8, h - 8, r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold ' + LABEL_HEIGHT_PX + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, h / 2);
    var tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function makeSliderLabelTexture() {
    var w = 256;
    var h = 64;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Zoom', w / 2, h / 2);
    var tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function makeTimeScaleLabelTexture(scale) {
    var w = 256;
    var h = 72;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    roundRect(ctx, 4, 4, w - 8, h - 8, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var n = typeof scale === 'number' && !isNaN(scale) ? Math.max(1, Math.min(99, Math.floor(scale))) : 1;
    ctx.fillText(String(n) + '\u00d7', w / 2, h / 2);
    var tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function makeLayerRowTexture(label, isOn, colorHex) {
    var w = 256;
    var h = 64;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = isOn ? '#1e3a5f' : '#0f172a';
    ctx.strokeStyle = isOn ? '#0ea5e9' : '#475569';
    ctx.lineWidth = 2;
    roundRect(ctx, 2, 2, w - 4, h - 4, 6);
    ctx.fill();
    ctx.stroke();
    if (colorHex != null && colorHex !== '') {
      var ch = typeof colorHex === 'number' ? colorHex : parseInt(String(colorHex).replace(/^#/, ''), 16);
      if (!isNaN(ch)) {
        ctx.fillStyle = '#' + ch.toString(16).padStart(6, '0');
        roundRect(ctx, 6, 10, 8, h - 20, 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    var textX = colorHex != null && colorHex !== '' ? 22 : 16;
    ctx.fillText(label, textX, h / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = isOn ? '#22c55e' : '#64748b';
    ctx.fillText(isOn ? 'ON' : 'OFF', w - 16, h / 2);
    var tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function makeEventLayersHeaderTexture() {
    var w = 256;
    var h = 48;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Calendar Layers', 0, h / 2);
    var tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * @param {THREE.Scene} scene
   * @param {object} xrAdapter - WebXRAdapter instance (session, referenceSpace)
   * @param {object} callbacks - { setZoomLevel, getZoomLevel, iconActions?, getLayerState?, getEventLayers?, setEventLayerVisibility?, getTimeScale?, adjustTimeScale?, navigateTimeScaled? }
   */
  function XRUI(scene, xrAdapter, callbacks) {
    this.scene = scene;
    this.xrAdapter = xrAdapter;
    this.setZoomLevel = callbacks.setZoomLevel || (function () {});
    this.getZoomLevel = callbacks.getZoomLevel || (function () { return 2; });
    this.iconActions = callbacks.iconActions || {};
    this.getLayerState = callbacks.getLayerState || {};
    this.getEventLayers = typeof callbacks.getEventLayers === 'function' ? callbacks.getEventLayers : function () { return []; };
    this.setEventLayerVisibility = typeof callbacks.setEventLayerVisibility === 'function' ? callbacks.setEventLayerVisibility : function () {};
    this.getTimeScale = typeof callbacks.getTimeScale === 'function' ? callbacks.getTimeScale : function () { return 1; };
    this.adjustTimeScale = typeof callbacks.adjustTimeScale === 'function' ? callbacks.adjustTimeScale : function () {};
    this.navigateTimeScaled =
      typeof callbacks.navigateTimeScaled === 'function' ? callbacks.navigateTimeScaled : function () {};

    this.group = null;
    this.trackMesh = null;
    this.thumbMesh = null;
    this.timeScaleLabelMesh = null;
    this.buttonMeshes = [];
    this.layerRows = [];
    this.trackHalfWidth = TRACK_WIDTH / 2;
    this.dragging = false;
    this.draggingSource = null;
    this._sliderUsed = false;
    this._pressedButton = null;
    this._selectStart = this._selectStart.bind(this);
    this._selectEnd = this._selectEnd.bind(this);
    this._tempOrigin = new THREE.Vector3();
    this._tempDir = new THREE.Vector3();
    this._tempMatrix = new THREE.Matrix4();
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._intersect = [];
    this._session = null;
  }

  XRUI.prototype.build = function () {
    const g = new THREE.Group();
    g.userData.type = 'xr-ui';
    g.position.set(0.65, 1.5, -1.4);
    g.rotation.set(0, 0, 0);

    var self = this;
    var actionOrder = ['markersLines', 'markersText', 'lightMode', 'flatten'];
    var iconLabels = { markersLines: 'Lines', markersText: 'Text', lightMode: 'Light', flatten: 'Flat' };
    var iconColors = { markersLines: 0x4a90e2, markersText: 0x94a3b8, lightMode: 0xfbbf24, flatten: 0x6ee7b7 };
    var actions = actionOrder.filter(function (a) { return self.iconActions[a]; });
    var numIcons = actions.length;
    var totalIconWidth = numIcons * ICON_WIDTH + (numIcons - 1) * ICON_GAP;
    var startX = -totalIconWidth / 2 + ICON_WIDTH / 2;

    actions.forEach(function (action, i) {
      var tex = makeButtonTexture(iconLabels[action] || action, iconColors[action]);
      var geom = new THREE.PlaneGeometry(ICON_WIDTH, ICON_HEIGHT);
      var mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide
      });
      var btn = new THREE.Mesh(geom, mat);
      btn.position.set(startX + i * (ICON_WIDTH + ICON_GAP), ICON_Y, 0.002);
      btn.userData.hitTarget = true;
      btn.userData.xrButton = true;
      btn.userData.action = action;
      g.add(btn);
      self.buttonMeshes.push(btn);
    });

    const panelGeom = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
    const panelMat = new THREE.MeshBasicMaterial({
      color: 0x0a0e17,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide
    });
    const panel = new THREE.Mesh(panelGeom, panelMat);
    panel.position.set(0, 0, 0);
    panel.userData.hitTarget = true;
    g.add(panel);

    const trackGeom = new THREE.BoxGeometry(TRACK_WIDTH, TRACK_HEIGHT, 0.008);
    const trackMat = new THREE.MeshBasicMaterial({ color: 0x1e3a5f });
    this.trackMesh = new THREE.Mesh(trackGeom, trackMat);
    this.trackMesh.position.set(0, SLIDER_Y, 0.002);
    this.trackMesh.userData.hitTarget = true;
    this.trackMesh.userData.sliderTrack = true;
    g.add(this.trackMesh);

    const thumbGeom = new THREE.BoxGeometry(THUMB_SIZE, THUMB_SIZE * 0.8, 0.01);
    const thumbMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
    this.thumbMesh = new THREE.Mesh(thumbGeom, thumbMat);
    this.thumbMesh.position.set(0, SLIDER_Y, 0.006);
    this.thumbMesh.userData.hitTarget = true;
    this.thumbMesh.userData.sliderThumb = true;
    g.add(this.thumbMesh);

    const labelGeom = new THREE.PlaneGeometry(0.2, 0.04);
    const labelMat = new THREE.MeshBasicMaterial({
      map: makeSliderLabelTexture(),
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    const label = new THREE.Mesh(labelGeom, labelMat);
    label.position.set(0, SLIDER_Y + 0.04, 0.001);
    g.add(label);

    var tsMinusTex = makeButtonTexture('\u2212', 0x0ea5e9);
    var tsMinusGeom = new THREE.PlaneGeometry(TIME_SCALE_BTN_W, TIME_SCALE_BTN_H);
    var tsMinusMat = new THREE.MeshBasicMaterial({
      map: tsMinusTex,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    var tsMinus = new THREE.Mesh(tsMinusGeom, tsMinusMat);
    tsMinus.position.set(-0.13, TIME_SCALE_ROW_Y, 0.003);
    tsMinus.userData.hitTarget = true;
    tsMinus.userData.xrTimeScaleDelta = -1;
    g.add(tsMinus);

    var tsLabelGeom = new THREE.PlaneGeometry(0.1, 0.042);
    var tsLabelMat = new THREE.MeshBasicMaterial({
      map: makeTimeScaleLabelTexture(self.getTimeScale()),
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    var tsLabel = new THREE.Mesh(tsLabelGeom, tsLabelMat);
    tsLabel.position.set(0, TIME_SCALE_ROW_Y, 0.003);
    tsLabel.userData.hitTarget = true;
    g.add(tsLabel);
    self.timeScaleLabelMesh = tsLabel;

    var tsPlusTex = makeButtonTexture('+', 0x0ea5e9);
    var tsPlusGeom = new THREE.PlaneGeometry(TIME_SCALE_BTN_W, TIME_SCALE_BTN_H);
    var tsPlusMat = new THREE.MeshBasicMaterial({
      map: tsPlusTex,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    var tsPlus = new THREE.Mesh(tsPlusGeom, tsPlusMat);
    tsPlus.position.set(0.13, TIME_SCALE_ROW_Y, 0.003);
    tsPlus.userData.hitTarget = true;
    tsPlus.userData.xrTimeScaleDelta = 1;
    g.add(tsPlus);

    var tnPrevTex = makeButtonTexture('\u00ab', 0x22c55e);
    var tnPrevGeom = new THREE.PlaneGeometry(TIME_SCALE_BTN_W * 0.85, TIME_SCALE_BTN_H * 0.85);
    var tnPrevMat = new THREE.MeshBasicMaterial({
      map: tnPrevTex,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    var tnPrev = new THREE.Mesh(tnPrevGeom, tnPrevMat);
    tnPrev.position.set(-0.26, TIME_SCALE_ROW_Y, 0.003);
    tnPrev.userData.hitTarget = true;
    tnPrev.userData.xrTimeNav = -1;
    g.add(tnPrev);

    var tnNextTex = makeButtonTexture('\u00bb', 0x22c55e);
    var tnNextGeom = new THREE.PlaneGeometry(TIME_SCALE_BTN_W * 0.85, TIME_SCALE_BTN_H * 0.85);
    var tnNextMat = new THREE.MeshBasicMaterial({
      map: tnNextTex,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    var tnNext = new THREE.Mesh(tnNextGeom, tnNextMat);
    tnNext.position.set(0.26, TIME_SCALE_ROW_Y, 0.003);
    tnNext.userData.hitTarget = true;
    tnNext.userData.xrTimeNav = 1;
    g.add(tnNext);

    var layersHeaderGeom = new THREE.PlaneGeometry(LAYER_ROW_WIDTH, LAYERS_HEADER_HEIGHT);
    var layersHeaderMat = new THREE.MeshBasicMaterial({
      map: makeEventLayersHeaderTexture(),
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    var layersHeader = new THREE.Mesh(layersHeaderGeom, layersHeaderMat);
    layersHeader.position.set(0, 0.07, 0.001);
    g.add(layersHeader);

    this.layerRows.length = 0;
    var eventLayers = self.getEventLayers();
    eventLayers.forEach(function (layer, i) {
      var layerId = layer.id;
      var rowLabel = layer.name || layerId;
      var isOn = layer.visible !== false;
      var tex = makeLayerRowTexture(rowLabel, isOn, layer.color);
      var rowGeom = new THREE.PlaneGeometry(LAYER_ROW_WIDTH, LAYER_ROW_HEIGHT);
      var rowMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide
      });
      var rowMesh = new THREE.Mesh(rowGeom, rowMat);
      var rowY = 0.03 - i * (LAYER_ROW_HEIGHT + LAYER_ROW_GAP);
      rowMesh.position.set(0, rowY, 0.002);
      rowMesh.userData.hitTarget = true;
      rowMesh.userData.xrLayerRow = true;
      rowMesh.userData.eventLayerId = layerId;
      g.add(rowMesh);
      self.layerRows.push({
        key: layerId,
        mesh: rowMesh,
        getState: function () {
          var list = self.getEventLayers();
          var l = list.find(function (x) { return x.id === layerId; });
          return l ? l.visible !== false : false;
        },
        label: rowLabel,
        color: layer.color
      });
    });

    this.group = g;
    this.updateThumbFromZoom(this.getZoomLevel());
    return g;
  };

  XRUI.prototype.refreshTimeScaleLabel = function () {
    if (!this.timeScaleLabelMesh || !this.timeScaleLabelMesh.material) return;
    var oldTex = this.timeScaleLabelMesh.material.map;
    if (oldTex) oldTex.dispose();
    this.timeScaleLabelMesh.material.map = makeTimeScaleLabelTexture(this.getTimeScale());
    this.timeScaleLabelMesh.material.needsUpdate = true;
  };

  XRUI.prototype.updateLayerDisplay = function () {
    this.layerRows.forEach(function (row) {
      var isOn = row.getState ? row.getState() : false;
      var oldTex = row.mesh.material.map;
      if (oldTex) oldTex.dispose();
      row.mesh.material.map = makeLayerRowTexture(row.label, isOn, row.color);
      row.mesh.material.needsUpdate = true;
    });
  };

  XRUI.prototype.updateThumbFromZoom = function (zoom) {
    if (!this.thumbMesh) return;
    const t = (zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);
    const x = -this.trackHalfWidth + t * TRACK_WIDTH;
    this.thumbMesh.position.x = x;
  };

  XRUI.prototype.zoomFromTrackX = function (localX) {
    const t = (localX + this.trackHalfWidth) / TRACK_WIDTH;
    const v = Math.max(0, Math.min(1, t));
    return Math.round(ZOOM_MIN + v * (ZOOM_MAX - ZOOM_MIN));
  };

  XRUI.prototype._selectStart = function (e) {
    if (this.dragging) return;
    this.draggingSource = e.inputSource;
    this.dragging = true;
    this._sliderUsed = false;
    this._pressedButton = null;
  };

  XRUI.prototype._selectEnd = function (e) {
    if (e.inputSource !== this.draggingSource) return;
    if (this._pressedButton && !this._sliderUsed) {
      if (this._pressedButton.userData.eventLayerId) {
        var layerId = this._pressedButton.userData.eventLayerId;
        var row = this.layerRows.find(function (r) { return r.key === layerId; });
        var visible = row && row.getState ? !row.getState() : true;
        this.setEventLayerVisibility(layerId, visible);
        this.updateLayerDisplay();
      } else if (this._pressedButton.userData.xrTimeNav === -1 || this._pressedButton.userData.xrTimeNav === 1) {
        try {
          this.navigateTimeScaled(this._pressedButton.userData.xrTimeNav);
        } catch (err) {
          console.warn('XR time nav error', err);
        }
      } else if (this._pressedButton.userData.xrTimeScaleDelta) {
        try {
          this.adjustTimeScale(this._pressedButton.userData.xrTimeScaleDelta);
        } catch (err) {
          console.warn('XR time scale error', err);
        }
      } else if (this._pressedButton.userData.action && this.iconActions[this._pressedButton.userData.action]) {
        try { this.iconActions[this._pressedButton.userData.action](); } catch (err) { console.warn('XR button action error', err); }
      }
    }
    this._pressedButton = null;
    this._sliderUsed = false;
    this.dragging = false;
    this.draggingSource = null;
  };

  XRUI.prototype.show = function (session, parentScene) {
    if (!this.group) this.build();
    if (this.group.parent) this.group.parent.remove(this.group);
    if (parentScene) parentScene.add(this.group);
    else this.scene.add(this.group);
    this._session = session;
    if (session) {
      session.addEventListener('selectstart', this._selectStart);
      session.addEventListener('selectend', this._selectEnd);
    }
    this.updateThumbFromZoom(this.getZoomLevel());
    this.refreshTimeScaleLabel();
    if (this.layerRows.length) this.updateLayerDisplay();
  };

  XRUI.prototype.hide = function () {
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    this.cleanup();
  };

  XRUI.prototype.cleanup = function () {
    this.dragging = false;
    this.draggingSource = null;
    this._sliderUsed = false;
    this._pressedButton = null;
    if (this._session) {
      this._session.removeEventListener('selectstart', this._selectStart);
      this._session.removeEventListener('selectend', this._selectEnd);
      this._session = null;
    }
  };

  XRUI.prototype.getRayFromInputSource = function (frame, inputSource) {
    const session = this.xrAdapter.session;
    const refSpace = this.xrAdapter.referenceSpace;
    if (!session || !refSpace || !inputSource || !inputSource.targetRaySpace) return null;
    const pose = frame.getPose(inputSource.targetRaySpace, refSpace);
    if (!pose) return null;
    const p = pose.transform.position;
    const o = pose.transform.orientation;
    this._tempOrigin.set(p.x, p.y, p.z);
    this._tempDir.set(0, 0, -1);
    this._tempDir.applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
    return { origin: this._tempOrigin.clone(), direction: this._tempDir.clone() };
  };

  XRUI.prototype.update = function (frame) {
    if (!this.group || !this.group.visible) return;
    const session = this.xrAdapter.session;
    const refSpace = this.xrAdapter.referenceSpace;
    if (!session || !refSpace || !frame) return;

    const inputSources = session.inputSources || [];
    let sourceToUse = this.draggingSource || (inputSources.length > 0 ? inputSources[0] : null);
    if (!sourceToUse) return;

    const ray = this.getRayFromInputSource(frame, sourceToUse);
    if (!ray) return;

    this._raycaster.set(ray.origin, ray.direction);
    this._intersect.length = 0;
    this._raycaster.intersectObject(this.group, true, this._intersect);

    if (this.dragging && this._intersect.length > 0) {
      const hit = this._intersect[0];
      const obj = hit.object;
      if (obj.userData.sliderTrack || obj.userData.sliderThumb) {
        this._sliderUsed = true;
        const pt = hit.point.clone();
        this.trackMesh.worldToLocal(pt);
        const localX = pt.x;
        const zoom = this.zoomFromTrackX(localX);
        const current = this.getZoomLevel();
        if (zoom !== current) this.setZoomLevel(zoom);
        this.updateThumbFromZoom(zoom);
      } else if (
        (obj.userData.xrButton && obj.userData.action) ||
        obj.userData.xrLayerRow ||
        obj.userData.xrTimeScaleDelta ||
        obj.userData.xrTimeNav === -1 ||
        obj.userData.xrTimeNav === 1
      ) {
        this._pressedButton = obj;
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = XRUI;
  } else {
    global.XRUI = XRUI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
