(function(){
function isEditingTarget(target) {
  return !!(target && (target.isContentEditable || target.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""],[role="textbox"],[role="searchbox"],[role="combobox"]')))
}
  window.isSceneKeyboardEditing=function(event){return !!(window.circaevumHostEditing || event?.isComposing || isEditingTarget(event?.target) || isEditingTarget(document.activeElement))}
  document.addEventListener('focusin',function(event){if(isEditingTarget(event.target))window.setCircadianShortEventsShiftPreview?.(false)})
})();
