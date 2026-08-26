// @ts-check
/**
 * app/flatten.js — flatten (time squish) pipeline
 * Split from main.js:11580-11670 for readability.
 *
 * `flattenMode: 'off'|'markers'|'all'` lerps `currentFlattenAmount 0→1` at
 * ANIMATION_LERP.FLATTEN (0.08) — `group.scale.y = 1-amount` around
 * `flattenTimelineFocusY()` pivot, sprites compensated via baseScale / yScaleLocal,
 * ribbon planes vertex-flattened via EventRenderer.updateTimelineHelixEventsForFlatten.
 *
 * Incremental: applyFlattenToGroup body moved here; main.js delegates via AppFlatten when present.
 */
(function (global) {
  const Flatten = {
    /** yScaleLocal = 1 - amount*0.95, floored at 0.05 — see main.js:11591 */
    yScaleFor: function (amount) {
      var a = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
      return Math.max(0.05, 1 - a * 0.95);
    },
    /** pivot for group.position.y = pivot*(1-yScale) — sticky world origin */
    focusY: function () {
      return typeof global.flattenTimelineFocusY === 'function' ? global.flattenTimelineFocusY() : 0;
    },
    /**
     * Apply flatten to a THREE.Group — extracted from main.js animate:applyFlattenToGroup (11580).
     * Compensates sprites / immune objects via baseScale / yScaleLocal.
     * Delegates to AppFlatten.applyFlattenToGroup if main.js has delegated; else fallback.
     * @param {object} group - THREE.Group
     * @param {number} amount - 0..1
     * @param {boolean} includeEventStagger
     */
    applyFlattenToGroup: function (group, amount, includeEventStagger) {
      if (!group || typeof group.traverse !== 'function') return;
      var focusPoint = global.focusPoint || null;
      var yScaleLocal = Math.max(0.05, 1 - amount * 0.95);
      var pivotY = typeof global.flattenTimelineFocusY === 'function' ? global.flattenTimelineFocusY() : (focusPoint ? focusPoint.y : 0);
      group.scale.set(1, yScaleLocal, 1);
      group.position.y = pivotY * (1 - yScaleLocal);
      var selectedMs = typeof global.getSelectedDateTime === 'function' ? global.getSelectedDateTime().getTime() : Date.now();
      function getEventNameLabelScaleMultiplier(labelObj) {
        if (!labelObj || !labelObj.userData || !labelObj.userData.isEventNameLabel) return 1;
        var s = Number(labelObj.userData.labelStartMs), eRaw = Number(labelObj.userData.labelEndMs);
        if (!isFinite(s) || !isFinite(selectedMs)) return 1;
        var e = isFinite(eRaw) && eRaw >= s ? eRaw : s;
        var sep = 0; if (selectedMs < s) sep = s - selectedMs; else if (selectedMs > e) sep = selectedMs - e;
        var closeMs = 3*24*60*60*1000, farMs = 60*24*60*60*1000; var t;
        if (sep <= closeMs) t = 0; else if (sep >= farMs) t = 1; else t = (sep - closeMs)/(farMs - closeMs);
        return 1.18 - (1.18 - 0.72) * t;
      }
      var curDist = typeof global.currentCameraDistance === 'number' ? global.currentCameraDistance : 0;
      if (amount > 0.01) {
        group.traverse(function(obj){
          if (typeof obj.userData.logicalY === 'number') obj.position.y = obj.userData.logicalY;
          else if (includeEventStagger && obj.userData && obj.userData.eventStaggerRoot && typeof obj.userData.staggerLogical === 'number') obj.position.y = obj.userData.staggerLogical / yScaleLocal;
          var hasBaseScale = obj.userData && obj.userData.baseScale;
          var isBillboard = obj.isSprite || (obj.userData.type === 'EventLineLabel' && !obj.userData.isRibbonSurfaceLabel);
          if ((isBillboard || obj.userData.immuneToFlatten) && hasBaseScale) {
            var b = obj.userData.baseScale; var mul = getEventNameLabelScaleMultiplier(obj);
            var frac = obj.userData.scaleWithCameraDistance;
            if (typeof frac === 'number' && frac > 0 && curDist > 0) { var aspect = b.y > 1e-6 ? b.x / b.y : 1; var sy = Math.max(5, curDist * frac); obj.scale.set(sy * aspect * mul, (sy * mul) / yScaleLocal, b.z); }
            else obj.scale.set(b.x * mul, (b.y * mul) / yScaleLocal, b.z);
          } else if (obj.userData.immuneToFlatten || obj.userData.type === 'EventLineMarker' || obj.userData.type === 'LagrangeL1DayDot' || (obj.userData.type === 'EventObject' && obj.userData.dayBandDot)) {
            var pickMul = obj.userData.type === 'LagrangeL1DayDot' && typeof obj.userData.pickScaleMul === 'number' ? obj.userData.pickScaleMul : 1;
            obj.scale.set(pickMul, pickMul / yScaleLocal, pickMul);
          }
        });
      } else {
        group.traverse(function(obj){
          if (typeof obj.userData.logicalY === 'number') obj.position.y = obj.userData.logicalY;
          else if (includeEventStagger && obj.userData && obj.userData.eventStaggerRoot && typeof obj.userData.staggerLogical === 'number') obj.position.y = obj.userData.staggerLogical;
          var hasBaseScale2 = obj.userData && obj.userData.baseScale;
          var isBillboard2 = obj.isSprite || (obj.userData.type === 'EventLineLabel' && !obj.userData.isRibbonSurfaceLabel);
          if ((isBillboard2 || obj.userData.immuneToFlatten) && hasBaseScale2) {
            var b2 = obj.userData.baseScale; var mul2 = getEventNameLabelScaleMultiplier(obj);
            var frac2 = obj.userData.scaleWithCameraDistance;
            if (typeof frac2 === 'number' && frac2 > 0 && curDist > 0) { var aspect2 = b2.y > 1e-6 ? b2.x / b2.y : 1; var sy2 = Math.max(5, curDist * frac2); obj.scale.set(sy2 * aspect2 * mul2, sy2 * mul2, b2.z); }
            else obj.scale.set(b2.x * mul2, b2.y * mul2, b2.z);
          } else if (obj.userData.immuneToFlatten || obj.userData.type === 'EventLineMarker' || obj.userData.type === 'LagrangeL1DayDot' || (obj.userData.type === 'EventObject' && obj.userData.dayBandDot)) {
            var pickMul2 = obj.userData.type === 'LagrangeL1DayDot' && typeof obj.userData.pickScaleMul === 'number' ? obj.userData.pickScaleMul : 1;
            obj.scale.set(pickMul2, pickMul2, pickMul2);
          }
        });
      }
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Flatten;
  else {
    global.AppFlatten = Flatten;
    global.AppFlatten.yScaleFor = Flatten.yScaleFor;
    global.applyFlattenToGroup = Flatten.applyFlattenToGroup;
  }
})(typeof window !== 'undefined' ? window : globalThis);
