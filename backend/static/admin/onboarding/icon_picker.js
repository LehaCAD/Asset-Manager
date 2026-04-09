document.addEventListener('DOMContentLoaded', function () {
  var ICONS = [
    'folder-open', 'layout-grid', 'wand-sparkles', 'image', 'maximize',
    'download', 'upload', 'refresh-cw', 'share-2', 'trophy',
    'star', 'zap', 'sparkles', 'palette', 'video',
    'film', 'camera', 'layers', 'grid-3x3', 'copy',
    'scissors', 'type', 'pen-tool', 'eye', 'heart',
    'bookmark', 'bell', 'settings', 'user', 'lock'
  ];

  var grid = document.getElementById('icon-picker-grid');
  var iconInput = document.getElementById('id_icon');
  var currentLabel = document.getElementById('icon-picker-current');

  if (!grid || !iconInput) return;

  var currentValue = (window.ONBOARDING_CURRENT_ICON || iconInput.value || '').trim();

  function selectIcon(name) {
    iconInput.value = name;
    if (currentLabel) currentLabel.textContent = name || '—';
    // Update all cells
    grid.querySelectorAll('.icon-cell').forEach(function (cell) {
      cell.classList.toggle('icon-cell--selected', cell.dataset.icon === name);
    });
    // Trigger preview update
    iconInput.dispatchEvent(new Event('change'));
  }

  ICONS.forEach(function (name) {
    var cell = document.createElement('div');
    cell.className = 'icon-cell';
    cell.dataset.icon = name;
    cell.title = name;
    // Show icon name abbreviated
    cell.textContent = name.split('-').map(function(p){ return p[0]; }).join('').substring(0,3).toUpperCase();
    if (name === currentValue) cell.classList.add('icon-cell--selected');
    cell.addEventListener('click', function () { selectIcon(name); });
    grid.appendChild(cell);
  });

  // Set initial label
  if (currentLabel) currentLabel.textContent = currentValue || '—';
});
