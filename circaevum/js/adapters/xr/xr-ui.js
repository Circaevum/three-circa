/**
 * XR UI – in-scene panel for hand/controller interaction (e.g. Apple Vision Pro)
 *
 * Renders a floating panel with a zoom slider (1–9) that can be used via
 * hand tracking or controllers: raycast from the primary input source,
 * select (pinch/trigger) to drag the slider.
 *
 * Uses WebXR selectstart/selectend and frame.getPose(targetRaySpace) for
 * raycasting; works when inputSource.gamepad is absent (hand tracking).
 */

(function (global) {
  const THREE = global.THREE;
  if (!THREE) return;

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 9;
  const PANEL_WIDTH = 0.5;
  const PANEL_HEIGHT = 0.18;
  const TRACK_WIDTH = 0.38;
  const TRACK_HEIGHT = 0.012;
  const THUMB_SIZE = 0.04;
  const SLIDER_Y = 0;

  /**
   * @param {THREE.Scene} scene
   * @param {object} xrAdapter - WebXRAdapter instance (session, referenceSpace)
   * @param {object} callbacks - { setZoomLevel: (number) => void, getZoomLevel: () => number }
   */
  function XRUI(scene, xrAdapter, callbacks) {
    this.scene = scene;
    this.xrAdapter = xrAdapter;
    this.setZoomLevel = callbacks.setZoomLevel || (function () {});
    this.getZoomLevel = callbacks.getZoomLevel || (function () { return 2; });

    this.group = null;
    this.trackMesh = null;
    this.thumbMesh = null;
    this.trackHalfWidth = TRACK_WIDTH / 2;
    this.dragging = false;
    this.draggingSource = null;
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

    const panelGeom = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
    const panelMat = new THREE.MeshBasicMaterial({
      color: 0x0a0e17,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide
    });
    const panel = new THREE.Mesh(panelGeom, panelMat);
    panel.position.set(0, 0, 0);
    panel.rotation.x = -Math.PI / 2;
    panel.userData.hitTarget = true;
    g.add(panel);

    const trackGeom = new THREE.BoxGeometry(TRACK_WIDTH, TRACK_HEIGHT, 0.008);
    const trackMat = new THREE.MeshBasicMaterial({ color: 0x1e3a5f });
    this.trackMesh = new THREE.Mesh(trackGeom, trackMat);
    this.trackMesh.position.set(0, SLIDER_Y, 0.002);
    this.trackMesh.rotation.x = -Math.PI / 2;
    this.trackMesh.userData.hitTarget = true;
    this.trackMesh.userData.sliderTrack = true;
    g.add(this.trackMesh);

    const thumbGeom = new THREE.BoxGeometry(THUMB_SIZE, THUMB_SIZE * 0.8, 0.01);
    const thumbMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
    this.thumbMesh = new THREE.Mesh(thumbGeom, thumbMat);
    this.thumbMesh.position.set(0, SLIDER_Y, 0.006);
    this.thumbMesh.rotation.x = -Math.PI / 2;
    this.thumbMesh.userData.hitTarget = true;
    this.thumbMesh.userData.sliderThumb = true;
    g.add(this.thumbMesh);

    const labelGeom = new THREE.PlaneGeometry(0.4, 0.04);
    const labelMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    const label = new THREE.Mesh(labelGeom, labelMat);
    label.position.set(0, 0.055, 0.001);
    label.rotation.x = -Math.PI / 2;
    g.add(label);

    this.group = g;
    this.updateThumbFromZoom(this.getZoomLevel());
    return g;
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
  };

  XRUI.prototype._selectEnd = function (e) {
    if (e.inputSource === this.draggingSource) {
      this.dragging = false;
      this.draggingSource = null;
    }
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
  };

  XRUI.prototype.hide = function () {
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    this.cleanup();
  };

  XRUI.prototype.cleanup = function () {
    this.dragging = false;
    this.draggingSource = null;
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
      const pt = hit.point.clone();
      this.trackMesh.worldToLocal(pt);
      const localX = pt.x;
      const zoom = this.zoomFromTrackX(localX);
      const current = this.getZoomLevel();
      if (zoom !== current) this.setZoomLevel(zoom);
      this.updateThumbFromZoom(zoom);
      return;
    }

  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = XRUI;
  } else {
    global.XRUI = XRUI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
