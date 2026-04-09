/* AI Model Admin Workflow — interactive layer
   All business logic lives in Django. This file only handles UI ergonomics. */

document.addEventListener('DOMContentLoaded', () => {

  // Family field visibility toggle
  const familySelect = document.getElementById('id_family');
  const variantContainer = document.getElementById('variant-fields-container');

  function syncFamilyFields() {
      const hasFamily = familySelect && familySelect.value;
      if (variantContainer) {
          variantContainer.style.display = hasFamily ? '' : 'none';
      }
  }

  if (familySelect) {
      familySelect.addEventListener('change', syncFamilyFields);
      syncFamilyFields();
  }

  const mappingPayloadInput    = document.getElementById('id_mapping_payload');
  const form = mappingPayloadInput?.closest('form') || document.querySelector('form');
  const pricingDimensionsInput = document.getElementById('id_pricing_dimensions');
  const pricingModeSelect      = document.getElementById('id_pricing_mode');
  const pricingBulkJsonTA      = document.getElementById('id_pricing_bulk_json');
  const fixedPanel             = document.querySelector('[data-pricing-fixed-panel]');
  const dimensionsPanel        = document.querySelector('[data-pricing-dimensions-panel]');
  const pricingTableContainer  = document.getElementById('pricing-table-container');
  const generateBtn            = document.querySelector('[data-generate-pricing-template]');
  var _skipDimensionSync = false;

  const parseLines = (str) =>
    (str || '').split('\n').map((s) => s.trim()).filter(Boolean);

  function parseLabel(raw) {
    const parts = raw.split('|');
    return parts.length > 1 ? parts[1].trim() : parts[0].trim();
  }

  const ENUM_TYPES = new Set(['select', 'toggle_group']);
  const SYSTEM_ROLES = new Set(['prompt', 'callback', 'auto_input', 'hidden']);

  const ROLE_DESCRIPTIONS = {
    prompt: 'Основное текстовое поле промпта. Бэкенд подставит введённый пользователем текст.',
    callback: 'Служебный URL для получения результата. Бэкенд подставит автоматически.',
    auto_input: 'Список файлов (изображений). Подставляется из выбранных элементов рабочей области.',
    hidden: 'Параметр отправляется в API, но не отображается в интерфейсе пользователя.',
  };

  // ─── Role selector ────────────────────────────────────────────────────────────
  function syncCardRole(card) {
    const roleSelect = card.querySelector('[data-mapping-role]');
    if (!roleSelect) return;
    const role = roleSelect.value;
    card.dataset.role = role;

    const noteEl = card.querySelector('[data-card-system-note]');
    if (noteEl) {
      noteEl.textContent = ROLE_DESCRIPTIONS[role] || '';
    }
  }

  // ─── Field type → options section visibility ───────────────────────────────────
  function syncRowFieldType(card) {
    const typeSelect = card.querySelector('[data-mapping-field-type]');
    if (!typeSelect) return;
    card.dataset.fieldType = typeSelect.value;
  }

  // ─── Live preview (select vs toggle_group) ───────────────────────────────────────
  function updateChipsPreview(card) {
    const chipsDisplay = card.querySelector('[data-chips-display]');
    const allTA        = card.querySelector('[data-mapping-all-options]');
    const maxInput     = card.querySelector('[data-mapping-max-visible]');
    const showOtherCb  = card.querySelector('[data-mapping-show-other]');
    if (!chipsDisplay || !allTA) return;

    const fieldType = card.dataset.fieldType || 'select';
    const all = parseLines(allTA.value);

    if (all.length === 0) {
      chipsDisplay.innerHTML = '<span class="wf-chips-empty">Добавь варианты ↓</span>';
      chipsDisplay.dataset.previewMode = fieldType;
      return;
    }

    chipsDisplay.dataset.previewMode = fieldType;

    if (fieldType === 'select') {
      const optionsText = all.map(parseLabel).join(', ');
      chipsDisplay.innerHTML = `<span class="wf-preview-select">▾ ${escapeHtml(parseLabel(all[0]))}</span><span class="wf-preview-select-hint">${escapeHtml(optionsText)}</span>`;
      return;
    }

    // toggle_group: chips/buttons
    const max = Math.max(1, parseInt(maxInput?.value, 10) || 3);
    const showOther = showOtherCb ? showOtherCb.checked : true;
    const featured = all.slice(0, max);
    const overflowCount = showOther ? Math.max(0, all.length - max) : 0;

    let html = '';
    featured.forEach((val) => {
      html += `<span class="wf-chip-opt wf-chip-opt--on">${escapeHtml(parseLabel(val))}</span>`;
    });
    if (!showOther && all.length > max) {
      all.slice(max).forEach((val) => {
        html += `<span class="wf-chip-opt wf-chip-opt--on">${escapeHtml(parseLabel(val))}</span>`;
      });
    }
    if (overflowCount > 0) {
      html += `<span class="wf-chip-opt wf-chip-opt--other">Другое +${overflowCount}</span>`;
    }
    chipsDisplay.innerHTML = html;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ─── Live show-other hint ──────────────────────────────────────────────────────
  function updateShowOtherHint(card) {
    const hint        = card.querySelector('[data-show-other-hint]');
    const allTA       = card.querySelector('[data-mapping-all-options]');
    const maxInput    = card.querySelector('[data-mapping-max-visible]');
    const showOtherCb = card.querySelector('[data-mapping-show-other]');
    if (!hint || !allTA) return;

    const fieldType = card.dataset.fieldType || 'select';
    const all = parseLines(allTA.value);

    if (fieldType === 'select') {
      hint.textContent = all.length > 0 ? `Выпадающий список: ${all.map(parseLabel).join(', ')}` : '';
      return;
    }

    if (!maxInput || !showOtherCb) return;
    if (!showOtherCb.checked) {
      hint.textContent = 'Все варианты будут показаны как кнопки.';
      return;
    }
    const max     = Math.max(1, parseInt(maxInput.value, 10) || 3);
    const visible = all.slice(0, max);
    const hidden  = Math.max(0, all.length - max);

    if (all.length === 0) {
      hint.textContent = '';
    } else {
      hint.textContent = hidden > 0
        ? `Кнопки: ${visible.map(parseLabel).join(', ')} · В «Другое»: ещё ${hidden}`
        : `Кнопки: ${visible.map(parseLabel).join(', ')} — все умещаются`;
    }
  }

  // ─── Default value dropdown sync ──────────────────────────────────────────────
  const BOOLEAN_TYPES = new Set(['switch', 'checkbox']);

  function syncDefaultDropdown(card) {
    const allTA = card.querySelector('[data-mapping-all-options]');
    const defaultSelect = card.querySelector('[data-mapping-default]');
    const defaultSection = card.querySelector('[data-mapping-default-section]');
    if (!defaultSelect) return;

    const role = card.dataset.role || 'param';
    const fieldType = card.dataset.fieldType || 'text';
    const isEnum = ENUM_TYPES.has(fieldType) && role === 'param';
    const isBool = BOOLEAN_TYPES.has(fieldType) && role === 'param';

    if (!isEnum && !isBool) {
      if (defaultSection) defaultSection.style.display = 'none';
      return;
    }
    if (defaultSection) defaultSection.style.display = '';

    const currentVal = defaultSelect.value;
    const initial = defaultSelect.dataset.initialDefault;

    defaultSelect.innerHTML = '<option value="">\u2014 \u043d\u0435 \u0437\u0430\u0434\u0430\u043d\u043e \u2014</option>';

    if (isBool) {
      // Boolean: true/false options
      [{ value: 'true', label: 'Включён' }, { value: 'false', label: 'Выключен' }].forEach(function(item) {
        var opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.label;
        if (item.value === currentVal) opt.selected = true;
        defaultSelect.appendChild(opt);
      });
    } else {
      // Enum: options from textarea
      var lines = allTA ? parseLines(allTA.value) : [];
      if (!lines.length) {
        if (defaultSection) defaultSection.style.display = 'none';
        return;
      }
      lines.forEach(function(raw) {
        var parts = raw.split('|');
        var value = parts[0].trim();
        var label = parts.length > 1 ? parts[1].trim() : value;
        var opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        if (value === currentVal) opt.selected = true;
        defaultSelect.appendChild(opt);
      });
    }

    // Restore initial default (from server) or keep current selection
    var effectiveDefault = initial || currentVal;
    if (effectiveDefault) {
      defaultSelect.value = effectiveDefault;
    }
  }

  // ─── Init cards ────────────────────────────────────────────────────────────────
  function initCards() {
    document.querySelectorAll('[data-mapping-card]').forEach((card) => {
      syncCardRole(card);
      syncRowFieldType(card);

      const roleSelect  = card.querySelector('[data-mapping-role]');
      const typeSelect  = card.querySelector('[data-mapping-field-type]');
      const allTA       = card.querySelector('[data-mapping-all-options]');
      const maxInput    = card.querySelector('[data-mapping-max-visible]');
      const showOtherCb = card.querySelector('[data-mapping-show-other]');

      if (roleSelect) roleSelect.addEventListener('change', () => {
        syncCardRole(card);
        syncDefaultDropdown(card);
      });
      if (typeSelect) typeSelect.addEventListener('change', () => {
        syncRowFieldType(card);
        updateChipsPreview(card);
        updateShowOtherHint(card);
        syncDefaultDropdown(card);
      });
      if (allTA) allTA.addEventListener('input', () => {
        updateChipsPreview(card);
        updateShowOtherHint(card);
        syncDefaultDropdown(card);
      });
      if (maxInput) maxInput.addEventListener('input', () => {
        updateChipsPreview(card);
        updateShowOtherHint(card);
      });
      if (showOtherCb) showOtherCb.addEventListener('change', () => {
        updateChipsPreview(card);
        updateShowOtherHint(card);
      });

      updateChipsPreview(card);
      updateShowOtherHint(card);
      syncDefaultDropdown(card);
    });
  }

  // ─── Pricing: show/hide panels ─────────────────────────────────────────────────
  function syncPricingPanels() {
    if (!pricingModeSelect) return;
    const isFixed = pricingModeSelect.value === 'fixed';
    if (fixedPanel)      fixedPanel.style.display      = isFixed ? '' : 'none';
    if (dimensionsPanel) dimensionsPanel.style.display = isFixed ? 'none' : '';
    if (!isFixed) renderPricingTable();
  }

  // ─── Pricing: table renderer ───────────────────────────────────────────────────
  function getSelectedDimensions() {
    return Array.from(document.querySelectorAll('[data-pricing-dimension]:checked'))
      .map((cb) => cb.value);
  }

  function getOptionsForDimension(code) {
    const card = Array.from(document.querySelectorAll('[data-mapping-card]'))
      .find((c) => {
        if (c.dataset.role !== 'param') return false;
        const inp = c.querySelector('[data-mapping-parameter-code]');
        return inp ? inp.value.trim() === code : c.dataset.parameterCode === code;
      });
    if (!card) return [];
    // Boolean parameters (switch/checkbox) → true/false as pricing dimensions
    const fieldType = card.dataset.fieldType || 'text';
    if (BOOLEAN_TYPES.has(fieldType)) {
      return ['true|Да', 'false|Нет'];
    }
    const ta = card.querySelector('[data-mapping-all-options]');
    return ta ? parseLines(ta.value) : [];
  }

  function getExistingCosts() {
    if (!pricingBulkJsonTA || !pricingBulkJsonTA.value.trim()) return {};
    try {
      return JSON.parse(pricingBulkJsonTA.value).costs || {};
    } catch (_) {
      return {};
    }
  }

  function serializePricingTable() {
    if (!pricingTableContainer || !pricingBulkJsonTA) return;
    const dims = getSelectedDimensions();
    if (!dims.length) return;
    const costs = {};
    pricingTableContainer.querySelectorAll('[data-pricing-cell]').forEach((inp) => {
      costs[inp.dataset.pricingCell] = inp.value.trim().replace(/,/g, '.');
    });
    pricingBulkJsonTA.value = JSON.stringify({ cost_params: dims, costs }, null, 2);
  }

  function makeCellInput(key, existingCosts) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'wf-price-cell';
    inp.dataset.pricingCell = key;
    inp.value = existingCosts[key] || '';
    inp.placeholder = '0.00';
    inp.autocomplete = 'off';
    inp.addEventListener('input', function() {
      if (inp.value.includes(',')) {
        var pos = inp.selectionStart;
        inp.value = inp.value.replace(/,/g, '.');
        inp.setSelectionRange(pos, pos);
      }
      serializePricingTable();
    });
    return inp;
  }

  // Parse value|label from dimension options
  function parseDimValue(raw) {
    const parts = raw.split('|');
    return parts[0].trim();
  }
  function parseDimLabel(raw) {
    const parts = raw.split('|');
    return parts.length > 1 ? parts[1].trim() : parts[0].trim();
  }

  function render1DTable(dim, values, existingCosts) {
    const wrap = document.createElement('div');
    wrap.className = 'pricing-list';

    const title = document.createElement('p');
    title.className = 'pricing-list__title';
    title.textContent = dim;
    wrap.appendChild(title);

    values.forEach((raw) => {
      const val = parseDimValue(raw);
      const label = parseDimLabel(raw);
      const row = document.createElement('div');
      row.className = 'pricing-list__row';

      const lbl = document.createElement('span');
      lbl.className = 'pricing-list__key';
      lbl.textContent = label;

      const cell = document.createElement('div');
      cell.className = 'pricing-list__cell';
      cell.appendChild(makeCellInput(val, existingCosts));

      const unit = document.createElement('span');
      unit.className = 'pricing-list__unit';
      unit.textContent = 'кр.';
      cell.appendChild(unit);

      row.appendChild(lbl);
      row.appendChild(cell);
      wrap.appendChild(row);
    });

    return wrap;
  }

  function render2DTable(dim1, dim2, vals1, vals2, existingCosts) {
    const wrap = document.createElement('div');
    wrap.className = 'pricing-grid-wrap';
    wrap.style.overflowX = 'auto';

    const tbl   = document.createElement('table');
    tbl.className = 'pricing-grid';
    const thead = tbl.createTHead();
    const hrow  = thead.insertRow();

    const corner = document.createElement('th');
    corner.textContent = `${dim1} \\ ${dim2}`;
    corner.className = 'pricing-grid__corner';
    hrow.appendChild(corner);

    vals2.forEach((raw2) => {
      const th = document.createElement('th');
      th.className = 'pricing-grid__col-header';
      th.textContent = parseDimLabel(raw2);
      hrow.appendChild(th);
    });

    const tbody = tbl.createTBody();
    vals1.forEach((raw1) => {
      const v1 = parseDimValue(raw1);
      const tr = tbody.insertRow();
      const rowTh = document.createElement('th');
      rowTh.className = 'pricing-grid__row-header';
      rowTh.textContent = parseDimLabel(raw1);
      tr.appendChild(rowTh);
      vals2.forEach((raw2) => {
        const v2 = parseDimValue(raw2);
        const td = tr.insertCell();
        td.className = 'pricing-grid__cell';
        td.appendChild(makeCellInput(`${v1}|${v2}`, existingCosts));
      });
    });

    wrap.appendChild(tbl);
    return wrap;
  }

  function renderNDTable(dims, optionValues, existingCosts) {
    // dims[0] × dims[2..N] → row combinations (grouped sub-rows)
    // dims[1] → columns
    var colDim = dims[1];
    var colOpts = optionValues[1];
    var rowDim = dims[0];
    var rowOpts = optionValues[0];
    var extraDims = dims.slice(2);
    var extraOpts = optionValues.slice(2);

    // Build all combinations for extra dimensions
    var extraCombos = [[]];
    extraOpts.forEach(function(opts) {
      var next = [];
      extraCombos.forEach(function(combo) {
        opts.forEach(function(opt) {
          next.push(combo.concat([opt]));
        });
      });
      extraCombos = next;
    });

    var wrap = document.createElement('div');
    wrap.className = 'pricing-grid-wrap';
    wrap.style.overflowX = 'auto';

    var tbl = document.createElement('table');
    tbl.className = 'pricing-grid';

    // Header row
    var thead = tbl.createTHead();
    var hrow = thead.insertRow();
    var corner = document.createElement('th');
    corner.className = 'pricing-grid__corner';
    corner.textContent = rowDim + (extraDims.length ? ' + ' + extraDims.join(', ') : '') + ' \\ ' + colDim;
    hrow.appendChild(corner);
    colOpts.forEach(function(raw) {
      var th = document.createElement('th');
      th.className = 'pricing-grid__col-header';
      th.textContent = parseDimLabel(raw);
      hrow.appendChild(th);
    });

    var tbody = tbl.createTBody();
    rowOpts.forEach(function(rawRow) {
      var rowVal = parseDimValue(rawRow);
      var rowLabel = parseDimLabel(rawRow);

      extraCombos.forEach(function(combo, comboIdx) {
        var tr = tbody.insertRow();
        var rowTh = document.createElement('th');
        rowTh.className = 'pricing-grid__row-header';

        // Build row label: "5с" or "5с, Аудио: Да"
        if (extraCombos.length === 1) {
          rowTh.textContent = rowLabel;
        } else {
          var extraLabel = combo.map(function(raw, i) {
            return extraDims[i] + ': ' + parseDimLabel(raw);
          }).join(', ');
          rowTh.textContent = rowLabel + ', ' + extraLabel;
        }

        // Visual grouping: add top border on first sub-row of each group
        if (comboIdx === 0 && tbody.rows.length > 1) {
          tr.style.borderTop = '2px solid #d0dae8';
        }

        tr.appendChild(rowTh);

        colOpts.forEach(function(rawCol) {
          var colVal = parseDimValue(rawCol);
          // Build cost key: rowVal|colVal|extra1|extra2|...
          var keyParts = [rowVal, colVal].concat(combo.map(parseDimValue));
          var costKey = keyParts.join('|');
          var td = tr.insertCell();
          td.className = 'pricing-grid__cell';
          td.appendChild(makeCellInput(costKey, existingCosts));
        });
      });
    });

    wrap.appendChild(tbl);
    return wrap;
  }

  function renderPricingTable() {
    if (!pricingTableContainer) return;
    const dims = getSelectedDimensions();
    const existingCosts = getExistingCosts();

    if (!dims.length) {
      pricingTableContainer.innerHTML =
        '<p class="wf-muted-note">Отметь хотя бы один параметр выше, чтобы появилась таблица цен.</p>';
      if (pricingBulkJsonTA) pricingBulkJsonTA.style.display = '';
      return;
    }

    const optionValues = dims.map((d) => getOptionsForDimension(d));

    if (optionValues.some((opts) => opts.length === 0)) {
      pricingTableContainer.innerHTML =
        '<p class="wf-muted-note">Добавь варианты к параметрам на шаге 3, тогда здесь появится таблица.</p>';
      if (pricingBulkJsonTA) pricingBulkJsonTA.style.display = '';
      return;
    }

    pricingTableContainer.innerHTML = '';

    if (dims.length === 1) {
      pricingTableContainer.appendChild(render1DTable(dims[0], optionValues[0], existingCosts));
    } else if (dims.length === 2) {
      pricingTableContainer.appendChild(
        render2DTable(dims[0], dims[1], optionValues[0], optionValues[1], existingCosts)
      );
    } else {
      // 3+ dimensions: single table with grouped sub-rows
      pricingTableContainer.appendChild(renderNDTable(dims, optionValues, existingCosts));
    }

    if (pricingBulkJsonTA) pricingBulkJsonTA.style.display = 'none';
  }

  function initDimensionCheckboxes() {
    document.querySelectorAll('[data-pricing-dimension]').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (_skipDimensionSync) return;
        renderPricingTable();
        serializePricingTable();
      });
    });
  }

  // ─── Form submit serialization ─────────────────────────────────────────────────
  function serializeMappingPayload() {
    if (!mappingPayloadInput) return;
    const cards   = Array.from(document.querySelectorAll('[data-mapping-card]'));
    const payload = cards.map((card) => {
      const placeholder = card.dataset.placeholder;
      const roleSelect  = card.querySelector('[data-mapping-role]');
      const typeSelect  = card.querySelector('[data-mapping-field-type]');
      const labelInput  = card.querySelector('[data-mapping-label]');
      const allTA       = card.querySelector('[data-mapping-all-options]');
      const maxInput    = card.querySelector('[data-mapping-max-visible]');
      const showOtherCb = card.querySelector('[data-mapping-show-other]');

      const paramCodeInput = card.querySelector('[data-mapping-parameter-code]');
      const role       = roleSelect      ? roleSelect.value                          : 'param';
      const fieldType  = typeSelect      ? typeSelect.value                          : 'text';
      const allValues  = allTA           ? parseLines(allTA.value)                   : [];
      const maxVisible = maxInput        ? (parseInt(maxInput.value, 10) || 3)       : 3;
      const showOther  = showOtherCb     ? showOtherCb.checked                       : false;
      const paramCode  = paramCodeInput  ? paramCodeInput.value.trim() || placeholder : placeholder;

      let optionsOverride = [];
      if (role === 'param' && ENUM_TYPES.has(fieldType) && allValues.length) {
        optionsOverride = allValues.map((raw, idx) => {
          const parts = raw.split('|');
          const value = parts[0].trim();
          const label = parts.length > 1 ? parts[1].trim() : value;
          return {
            value,
            label,
            featured: !showOther || idx < maxVisible,
          };
        });
      }

      const defaultSelect = card.querySelector('[data-mapping-default]');
      let defaultValue = defaultSelect ? defaultSelect.value : '';
      // Convert boolean strings to actual booleans
      if (BOOLEAN_TYPES.has(fieldType) && defaultValue === 'true') defaultValue = true;
      else if (BOOLEAN_TYPES.has(fieldType) && defaultValue === 'false') defaultValue = false;

      return {
        placeholder,
        role,
        parameter_code: paramCode,
        field_type:     role === 'param' ? fieldType : 'text',
        display_label:  labelInput ? labelInput.value.trim() : placeholder,
        request_path:   '',
        options_override: optionsOverride,
        default_override: defaultValue !== '' ? defaultValue : {},
        is_visible:     role === 'param',
      };
    });
    mappingPayloadInput.value = JSON.stringify(payload);
  }

  function serializePricingDimensions() {
    if (!pricingDimensionsInput) return;
    pricingDimensionsInput.value = JSON.stringify(getSelectedDimensions());
  }

  // ─── Init ──────────────────────────────────────────────────────────────────────
  initCards();
  initDimensionCheckboxes();

  if (pricingModeSelect) {
    pricingModeSelect.addEventListener('change', syncPricingPanels);
    syncPricingPanels();
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      renderPricingTable();
      serializePricingTable();
    });
  }

  // "Apply JSON → table" button
  var applyJsonBtn = document.querySelector('[data-apply-pricing-json]');

  if (applyJsonBtn) {
    applyJsonBtn.addEventListener('click', () => {
      if (!pricingBulkJsonTA) return;
      var raw = pricingBulkJsonTA.value.trim();
      if (!raw) return;
      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (_) {
        alert('Невалидный JSON');
        return;
      }

      // Temporarily block checkbox listeners from wiping costs
      _skipDimensionSync = true;

      // Auto-check dimension checkboxes from cost_params
      if (parsed.cost_params && Array.isArray(parsed.cost_params)) {
        document.querySelectorAll('[data-pricing-dimension]').forEach(function(cb) {
          cb.checked = parsed.cost_params.includes(cb.value);
        });
      }

      _skipDimensionSync = false;

      // Write the JSON back so getExistingCosts() can read it
      pricingBulkJsonTA.value = raw;

      // Render table — getExistingCosts() reads from textarea
      renderPricingTable();

      // Safety: explicitly fill cells from parsed costs (in case keys differ slightly)
      var costs = parsed.costs || {};
      pricingTableContainer.querySelectorAll('[data-pricing-cell]').forEach(function(inp) {
        var key = inp.dataset.pricingCell;
        if (costs[key] !== undefined && !inp.value) {
          inp.value = costs[key];
        }
      });

      // Now serialize back
      serializePricingTable();
    });
  }

  if (form) {
    const onSubmit = () => {
      serializeMappingPayload();
      serializePricingDimensions();
      if (pricingModeSelect && pricingModeSelect.value === 'bulk_json') {
        serializePricingTable();
        if (pricingBulkJsonTA) pricingBulkJsonTA.style.display = '';
      }
    };
    form.addEventListener('submit', onSubmit, true);
  }
});
