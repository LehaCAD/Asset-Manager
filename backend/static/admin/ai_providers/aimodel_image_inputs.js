/* Image Inputs Schema Editor — visual editor for image_inputs_schema.
   Renders groups/slots from existing schema, serializes back on form submit. */

document.addEventListener('DOMContentLoaded', () => {

  const editor = document.querySelector('[data-image-inputs-editor]');
  if (!editor) return;

  const payloadInput     = document.getElementById('id_image_inputs_payload');
  const nativeField      = document.getElementById('id_image_inputs_schema');
  const form             = editor.closest('form');
  const tabBar           = editor.querySelector('[data-ii-tab-bar]');
  const visualPanel      = editor.querySelector('[data-ii-panel="visual"]');
  const jsonPanel        = editor.querySelector('[data-ii-panel="json"]');
  const jsonEditor       = editor.querySelector('[data-ii-json-editor]');
  const jsonError        = editor.querySelector('[data-ii-json-error]');
  const applyJsonBtn     = editor.querySelector('[data-ii-apply-json]');
  const formatRadios     = editor.querySelectorAll('[data-ii-format]');
  const groupsContainer  = editor.querySelector('[data-ii-groups-container]');
  const simpleContainer  = editor.querySelector('[data-ii-simple-container]');
  const addGroupBtn      = editor.querySelector('[data-ii-add-group]');
  const addSimpleSlotBtn = editor.querySelector('[data-ii-add-simple-slot]');
  const noImagesSection  = editor.querySelector('[data-ii-no-images-section]');
  const noImagesTA       = editor.querySelector('[data-ii-no-images-params]');
  const groupTemplate    = document.querySelector('[data-ii-group-template]');
  const slotTemplate     = document.querySelector('[data-ii-slot-template]');

  let currentFormat = 'simple';

  // ─── Utils ────────────────────────────────────────────────────────────────

  function safeParseJSON(str, fallback) {
    if (!str || !str.trim()) return fallback;
    try { return JSON.parse(str); } catch (_) { return fallback; }
  }

  // ─── Tab switching ────────────────────────────────────────────────────────

  tabBar.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-ii-tab]');
    if (!tab) return;
    const target = tab.dataset.iiTab;

    tabBar.querySelectorAll('.wf-tab').forEach(t => t.classList.remove('wf-tab--active'));
    tab.classList.add('wf-tab--active');

    if (target === 'json') {
      visualPanel.style.display = 'none';
      jsonPanel.style.display = '';
      jsonEditor.value = JSON.stringify(buildSchema(), null, 2);
    } else {
      jsonPanel.style.display = 'none';
      visualPanel.style.display = '';
    }
  });

  // ─── Apply JSON ───────────────────────────────────────────────────────────

  applyJsonBtn.addEventListener('click', () => {
    jsonError.style.display = 'none';
    let parsed;
    try {
      parsed = JSON.parse(jsonEditor.value);
    } catch (err) {
      jsonError.textContent = '\u041e\u0448\u0438\u0431\u043a\u0430 JSON: ' + err.message;
      jsonError.style.display = '';
      return;
    }
    loadSchema(parsed);
    tabBar.querySelector('[data-ii-tab="visual"]').click();
  });

  // ─── Format radio ─────────────────────────────────────────────────────────

  formatRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      currentFormat = radio.value;
      syncFormatVisibility();
    });
  });

  function syncFormatVisibility() {
    const isGroups = currentFormat === 'groups';
    groupsContainer.style.display  = isGroups ? '' : 'none';
    simpleContainer.style.display  = isGroups ? 'none' : '';
    addGroupBtn.style.display      = isGroups ? '' : 'none';
    addSimpleSlotBtn.style.display = isGroups ? 'none' : '';
    noImagesSection.style.display  = isGroups ? '' : 'none';
  }

  // ─── Create slot element ──────────────────────────────────────────────────

  function createSlotEl(slot) {
    slot = slot || {};
    var el = slotTemplate.content.cloneNode(true).firstElementChild;
    el.querySelector('[data-ii-slot-key]').value         = slot.key || '';
    el.querySelector('[data-ii-slot-label]').value       = slot.label || '';
    el.querySelector('[data-ii-slot-description]').value = slot.description || '';
    el.querySelector('[data-ii-slot-icon]').value          = slot.icon || '';
    el.querySelector('[data-ii-slot-illustration]').value = slot.illustration || '';
    el.querySelector('[data-ii-slot-min]').value          = slot.min != null ? slot.min : 0;
    el.querySelector('[data-ii-slot-max]').value         = slot.max != null ? slot.max : 1;
    el.querySelector('[data-ii-slot-depends-on]').value  = slot.depends_on || '';
    el.dataset.pendingDependsOn = slot.depends_on || '';

    el.querySelector('[data-ii-remove-slot]').addEventListener('click', function() {
      el.remove();
      refreshAllDependsOnDropdowns();
    });

    el.querySelector('[data-ii-slot-key]').addEventListener('input', function() {
      refreshAllDependsOnDropdowns();
    });

    return el;
  }

  // ─── Create group element ─────────────────────────────────────────────────

  function createGroupEl(group) {
    group = group || {};
    var el = groupTemplate.content.cloneNode(true).firstElementChild;
    el.querySelector('[data-ii-group-key]').value         = group.key || '';
    el.querySelector('[data-ii-group-label]').value       = group.label || '';
    el.querySelector('[data-ii-group-collect-to]').value  = group.collect_to || '';
    el.querySelector('[data-ii-group-extra-params]').value =
      group.extra_params ? JSON.stringify(group.extra_params) : '';

    var titleSpan = el.querySelector('[data-ii-group-title]');
    var keyInput  = el.querySelector('[data-ii-group-key]');
    var lblInput  = el.querySelector('[data-ii-group-label]');

    function updateTitle() {
      var lbl = lblInput.value.trim();
      var key = keyInput.value.trim();
      titleSpan.textContent = lbl || key || '\u041d\u043e\u0432\u0430\u044f \u0433\u0440\u0443\u043f\u043f\u0430';
    }
    keyInput.addEventListener('input', function() { updateTitle(); refreshAllExclusiveCheckboxes(); });
    lblInput.addEventListener('input', updateTitle);
    updateTitle();

    el.querySelector('[data-ii-remove-group]').addEventListener('click', function() {
      el.remove();
      refreshAllExclusiveCheckboxes();
    });

    el.querySelector('[data-ii-add-slot]').addEventListener('click', function() {
      el.querySelector('[data-ii-slots-container]').appendChild(createSlotEl());
      refreshAllDependsOnDropdowns();
    });

    var slotsContainer = el.querySelector('[data-ii-slots-container]');
    (group.slots || []).forEach(function(slot) {
      slotsContainer.appendChild(createSlotEl(slot));
    });

    el._exclusiveWith = group.exclusive_with || [];

    return el;
  }

  // ─── Refresh exclusive_with checkboxes across all groups ──────────────────

  function refreshAllExclusiveCheckboxes() {
    var groupEls = Array.from(groupsContainer.querySelectorAll(':scope > [data-ii-group]'));
    var allKeys = groupEls.map(function(g) {
      return g.querySelector('[data-ii-group-key]').value.trim();
    }).filter(Boolean);

    groupEls.forEach(function(groupEl) {
      var myKey = groupEl.querySelector('[data-ii-group-key]').value.trim();
      var container = groupEl.querySelector('[data-ii-group-exclusive]');
      var otherKeys = allKeys.filter(function(k) { return k !== myKey; });

      var currentChecked = new Set();
      container.querySelectorAll('input:checked').forEach(function(cb) {
        currentChecked.add(cb.value);
      });

      container.innerHTML = '';
      if (otherKeys.length === 0) {
        container.innerHTML = '<span class="wf-muted-note">\u0414\u043e\u0431\u0430\u0432\u044c\u0442\u0435 \u0435\u0449\u0451 \u0433\u0440\u0443\u043f\u043f\u0443</span>';
        return;
      }

      otherKeys.forEach(function(key) {
        var label = document.createElement('label');
        label.className = 'wf-dimension-chip';

        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = key;
        cb.checked = currentChecked.has(key) || (groupEl._exclusiveWith || []).includes(key);

        var span = document.createElement('span');
        span.className = 'wf-dimension-chip__label';
        span.textContent = key;

        label.appendChild(cb);
        label.appendChild(span);
        container.appendChild(label);
      });

      delete groupEl._exclusiveWith;
    });
  }

  // ─── Refresh depends_on dropdowns ─────────────────────────────────────────

  function refreshAllDependsOnDropdowns() {
    groupsContainer.querySelectorAll('[data-ii-group]').forEach(function(groupEl) {
      refreshDependsOnInContainer(groupEl.querySelector('[data-ii-slots-container]'));
    });
    refreshDependsOnInContainer(simpleContainer);
  }

  function refreshDependsOnInContainer(container) {
    if (!container) return;
    var slotEls = Array.from(container.querySelectorAll('[data-ii-slot]'));
    var allKeys = slotEls.map(function(s) {
      return s.querySelector('[data-ii-slot-key]').value.trim();
    }).filter(Boolean);

    slotEls.forEach(function(slotEl) {
      var myKey = slotEl.querySelector('[data-ii-slot-key]').value.trim();
      var select = slotEl.querySelector('[data-ii-slot-depends-on]');
      var currentVal = select.value;

      select.innerHTML = '<option value="">\u2014 \u043d\u0435\u0442 \u2014</option>';
      allKeys.forEach(function(key) {
        if (key === myKey) return;
        var opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key;
        if (key === currentVal) opt.selected = true;
        select.appendChild(opt);
      });

      // Restore pending depends_on value from initial load
      var pending = slotEl.dataset.pendingDependsOn;
      if (pending) {
        select.value = pending;
        delete slotEl.dataset.pendingDependsOn;
      }
    });
  }

  // ─── Build schema from visual editor state ────────────────────────────────

  function readSlot(slotEl) {
    var slot = {
      key:   slotEl.querySelector('[data-ii-slot-key]').value.trim(),
      label: slotEl.querySelector('[data-ii-slot-label]').value.trim(),
      min:   parseInt(slotEl.querySelector('[data-ii-slot-min]').value, 10) || 0,
      max:   parseInt(slotEl.querySelector('[data-ii-slot-max]').value, 10) || 1,
    };
    var desc = slotEl.querySelector('[data-ii-slot-description]').value.trim();
    if (desc) slot.description = desc;
    var icon = slotEl.querySelector('[data-ii-slot-icon]').value.trim();
    if (icon) slot.icon = icon;
    var illus = slotEl.querySelector('[data-ii-slot-illustration]').value.trim();
    if (illus) slot.illustration = illus;
    var dep = slotEl.querySelector('[data-ii-slot-depends-on]').value;
    if (dep) slot.depends_on = dep;
    return slot;
  }

  function readGroup(groupEl) {
    var group = {
      key:   groupEl.querySelector('[data-ii-group-key]').value.trim(),
      label: groupEl.querySelector('[data-ii-group-label]').value.trim(),
    };
    var collectTo = groupEl.querySelector('[data-ii-group-collect-to]').value.trim();
    if (collectTo) group.collect_to = collectTo;

    var exclusiveChecked = Array.from(
      groupEl.querySelectorAll('[data-ii-group-exclusive] input:checked')
    ).map(function(cb) { return cb.value; });
    if (exclusiveChecked.length) group.exclusive_with = exclusiveChecked;

    var extraRaw = groupEl.querySelector('[data-ii-group-extra-params]').value.trim();
    if (extraRaw) {
      try { group.extra_params = JSON.parse(extraRaw); } catch (_) {}
    }

    group.slots = Array.from(
      groupEl.querySelectorAll('[data-ii-slots-container] > [data-ii-slot]')
    ).map(readSlot);

    return group;
  }

  function buildSchema() {
    if (currentFormat === 'simple') {
      return Array.from(simpleContainer.querySelectorAll('[data-ii-slot]')).map(readSlot);
    }

    var schema = { mode: 'groups' };

    var noImagesRaw = noImagesTA.value.trim();
    if (noImagesRaw) {
      try { schema.no_images_params = JSON.parse(noImagesRaw); } catch (_) {}
    }

    schema.groups = Array.from(
      groupsContainer.querySelectorAll(':scope > [data-ii-group]')
    ).map(readGroup);

    return schema;
  }

  // ─── Load schema into visual editor ───────────────────────────────────────

  function loadSchema(schema) {
    groupsContainer.innerHTML = '';
    simpleContainer.innerHTML = '';
    noImagesTA.value = '';

    if (schema === null || schema === undefined) schema = [];

    if (Array.isArray(schema)) {
      currentFormat = 'simple';
      formatRadios.forEach(function(r) { r.checked = r.value === 'simple'; });
      schema.forEach(function(slot) {
        simpleContainer.appendChild(createSlotEl(slot));
      });
    } else if (typeof schema === 'object' && schema.mode === 'groups') {
      currentFormat = 'groups';
      formatRadios.forEach(function(r) { r.checked = r.value === 'groups'; });

      if (schema.no_images_params) {
        noImagesTA.value = JSON.stringify(schema.no_images_params, null, 2);
      }

      (schema.groups || []).forEach(function(group) {
        groupsContainer.appendChild(createGroupEl(group));
      });

      refreshAllExclusiveCheckboxes();
    }

    syncFormatVisibility();
    refreshAllDependsOnDropdowns();
  }

  // ─── Add group / slot buttons ─────────────────────────────────────────────

  addGroupBtn.addEventListener('click', function() {
    groupsContainer.appendChild(createGroupEl());
    refreshAllExclusiveCheckboxes();
    refreshAllDependsOnDropdowns();
  });

  addSimpleSlotBtn.addEventListener('click', function() {
    simpleContainer.appendChild(createSlotEl());
    refreshAllDependsOnDropdowns();
  });

  // ─── Form submit — serialize to hidden input ──────────────────────────────

  if (form) {
    form.addEventListener('submit', function() {
      var schema = buildSchema();
      if (payloadInput) {
        payloadInput.value = JSON.stringify(schema);
      }
      if (nativeField) {
        nativeField.value = JSON.stringify(schema);
      }
    }, true);
  }

  // ─── Initial load from workflow context ───────────────────────────────────

  var initialScript = document.getElementById('image-inputs-initial');
  var initialValue = safeParseJSON(initialScript ? initialScript.textContent : null, []);
  loadSchema(initialValue);
});
