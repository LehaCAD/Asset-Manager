/* AI Model Admin Workflow — interactive layer
   All business logic lives in Django. This file only handles UI ergonomics. */

document.addEventListener('DOMContentLoaded', () => {

  const mappingPayloadInput    = document.getElementById('id_mapping_payload');
  const form = mappingPayloadInput?.closest('form') || document.querySelector('form');
  const pricingDimensionsInput = document.getElementById('id_pricing_dimensions');
  const pricingModeSelect      = document.getElementById('id_pricing_mode');
  const pricingBulkJsonTA      = document.getElementById('id_pricing_bulk_json');
  const fixedPanel             = document.querySelector('[data-pricing-fixed-panel]');
  const dimensionsPanel        = document.querySelector('[data-pricing-dimensions-panel]');
  const pricingTableContainer  = document.getElementById('pricing-table-container');
  const generateBtn            = document.querySelector('[data-generate-pricing-template]');

  const parseLines = (str) =>
    (str || '').split('\n').map((s) => s.trim()).filter(Boolean);

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
      const optionsText = all.join(', ');
      chipsDisplay.innerHTML = `<span class="wf-preview-select">▾ ${escapeHtml(all[0])}</span><span class="wf-preview-select-hint">${escapeHtml(optionsText)}</span>`;
      return;
    }

    // toggle_group: chips/buttons
    const max = Math.max(1, parseInt(maxInput?.value, 10) || 3);
    const showOther = showOtherCb ? showOtherCb.checked : true;
    const featured = all.slice(0, max);
    const overflowCount = showOther ? Math.max(0, all.length - max) : 0;

    let html = '';
    featured.forEach((val) => {
      html += `<span class="wf-chip-opt wf-chip-opt--on">${escapeHtml(val)}</span>`;
    });
    if (!showOther && all.length > max) {
      all.slice(max).forEach((val) => {
        html += `<span class="wf-chip-opt wf-chip-opt--on">${escapeHtml(val)}</span>`;
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
      hint.textContent = all.length > 0 ? `Выпадающий список: ${all.join(', ')}` : '';
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
        ? `Кнопки: ${visible.join(', ')} · В «Другое»: ещё ${hidden}`
        : `Кнопки: ${visible.join(', ')} — все умещаются`;
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

      if (roleSelect) roleSelect.addEventListener('change', () => syncCardRole(card));
      if (typeSelect) typeSelect.addEventListener('change', () => {
        syncRowFieldType(card);
        updateChipsPreview(card);
        updateShowOtherHint(card);
      });
      if (allTA) allTA.addEventListener('input', () => {
        updateChipsPreview(card);
        updateShowOtherHint(card);
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
      costs[inp.dataset.pricingCell] = inp.value.trim();
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
    inp.addEventListener('input', serializePricingTable);
    return inp;
  }

  function render1DTable(dim, values, existingCosts) {
    const wrap = document.createElement('div');
    wrap.className = 'pricing-list';

    const title = document.createElement('p');
    title.className = 'pricing-list__title';
    title.textContent = dim;
    wrap.appendChild(title);

    values.forEach((val) => {
      const row = document.createElement('div');
      row.className = 'pricing-list__row';

      const lbl = document.createElement('span');
      lbl.className = 'pricing-list__key';
      lbl.textContent = val;

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

    vals2.forEach((v2) => {
      const th = document.createElement('th');
      th.className = 'pricing-grid__col-header';
      th.textContent = v2;
      hrow.appendChild(th);
    });

    const tbody = tbl.createTBody();
    vals1.forEach((v1) => {
      const tr = tbody.insertRow();
      const rowTh = document.createElement('th');
      rowTh.className = 'pricing-grid__row-header';
      rowTh.textContent = v1;
      tr.appendChild(rowTh);
      vals2.forEach((v2) => {
        const td = tr.insertCell();
        td.className = 'pricing-grid__cell';
        td.appendChild(makeCellInput(`${v1}|${v2}`, existingCosts));
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
      const note = document.createElement('p');
      note.className = 'wf-muted-note';
      note.textContent = 'Больше двух измерений — заполни JSON вручную ниже.';
      pricingTableContainer.appendChild(note);
      if (pricingBulkJsonTA) pricingBulkJsonTA.style.display = '';
      return;
    }

    if (pricingBulkJsonTA) pricingBulkJsonTA.style.display = 'none';
  }

  function initDimensionCheckboxes() {
    document.querySelectorAll('[data-pricing-dimension]').forEach((cb) => {
      cb.addEventListener('change', () => {
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
        optionsOverride = allValues.map((value, idx) => ({
          value,
          label: value,
          featured: !showOther || idx < maxVisible,
        }));
      }

      return {
        placeholder,
        role,
        parameter_code: paramCode,
        field_type:     role === 'param' ? fieldType : 'text',
        display_label:  labelInput ? labelInput.value.trim() : placeholder,
        request_path:   '',
        options_override: optionsOverride,
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
