document.addEventListener('DOMContentLoaded', function () {
  function getField(name) {
    return document.getElementById('id_' + name);
  }

  function updatePreview() {
    var title = (getField('title') || {}).value || 'Название задания';
    var desc = (getField('description') || {}).value || 'Описание';
    var reward = (getField('reward') || {}).value || '0';
    var icon = (getField('icon') || {}).value || '◆';
    var esTitle = (getField('empty_state_title') || {}).value || '';
    var esDesc = (getField('empty_state_desc') || {}).value || '';
    var esCta = (getField('empty_state_cta') || {}).value || '';
    var esPage = (getField('empty_state_page') || {}).value || '';

    var el = function (id) { return document.getElementById(id); };

    if (el('preview-title')) el('preview-title').textContent = title;
    if (el('preview-desc')) el('preview-desc').textContent = desc;
    if (el('preview-reward')) el('preview-reward').textContent = '+' + reward + ' ⬡';
    if (el('preview-icon')) el('preview-icon').textContent = icon.substring(0, 2);
    if (el('icon-picker-current')) el('icon-picker-current').textContent = icon || '—';

    // Empty state block
    var esBlock = el('preview-empty-state-block');
    if (esBlock) {
      esBlock.style.display = esPage ? '' : 'none';
      if (el('preview-es-title')) el('preview-es-title').textContent = esTitle;
      if (el('preview-es-desc')) el('preview-es-desc').textContent = esDesc;
      if (el('preview-es-cta')) el('preview-es-cta').textContent = esCta || 'Действие';
      if (el('preview-es-icon')) el('preview-es-icon').textContent = icon.substring(0, 2);
    }
  }

  // Listen to all relevant fields
  var fields = ['title', 'description', 'reward', 'icon', 'empty_state_title', 'empty_state_desc', 'empty_state_cta', 'empty_state_page'];
  fields.forEach(function (name) {
    var field = getField(name);
    if (field) {
      field.addEventListener('input', updatePreview);
      field.addEventListener('change', updatePreview);
    }
  });

  // Initial render
  updatePreview();
});
