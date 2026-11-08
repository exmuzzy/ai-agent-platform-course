// Практические активности. Ничего не отправляется по сети.
// Интерфейс progress: { getActivity(id) -> {v,state}|undefined, setActivity({id,v}, status|null) }.
// Свободный текст (причина в decision) не сохраняется: поля прогресса его не допускают.
export function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function el(tag, attrs, text) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

export function readActivity(node) {
  const s = node.querySelector('script[type="application/json"]');
  if (!s) return null;
  try { return JSON.parse(s.textContent); } catch (e) { return null; }
}

export function initActivities(root, progress) {
  (root || document).querySelectorAll('.activity[data-activity]').forEach((node) => {
    if (node.dataset.ready) return;
    const a = readActivity(node);
    if (!a) { node.append(el('p', { role: 'alert' }, 'Не удалось прочитать активность.')); return; }
    node.dataset.ready = '1';
    a.v = Number.isInteger(a.version) ? a.version : 1;
    const id = node.dataset.activity;
    a.id = id;
    const builders = { field_check: fieldCheck, decision, find_error: findError, checklist };
    const build = builders[a.type || node.dataset.type];
    if (!build) return;
    const form = el('form', { class: 'activity-form', novalidate: '' });
    form.addEventListener('submit', (e) => e.preventDefault());
    if (a.title) node.append(el('h3', null, a.title));
    if (a.instruction) node.append(el('p', null, a.instruction));
    node.append(form);
    const result = el('div', { class: 'activity-result', role: 'status', 'aria-live': 'polite' });
    const status = el('p', { class: 'activity-status' });
    node.append(result, status);
    const showStatus = () => {
      const r = progress.getActivity(id);
      const ok = r && r.v === a.v;
      const map = { auto_checked: 'Статус: проверено автоматически', self_reported: 'Статус: отмечено вами', failed: 'Статус: не пройдено, можно повторить' };
      status.textContent = ok && map[r.state] ? map[r.state] : 'Статус: не начато';
    };
    const finish = (okFlag, type, messages) => {
      result.replaceChildren();
      const p = el('p', { class: okFlag ? 'result-ok' : 'result-fail' }, (okFlag ? 'Верно. ' : 'Не совсем. ') + (messages[0] || ''));
      result.append(p);
      if (messages[1]) result.append(el('p', null, messages[1]));
      progress.setActivity(a, okFlag ? type : 'failed');
      showStatus();
    };
    build(a, form, result, finish, progress);
    showStatus();
  });
}

function fieldCheck(a, form, result, finish) {
  if (a.input) form.append(el('pre', { class: 'activity-input', tabindex: '0' }, a.input));
  const inputs = (a.fields || []).map((f, i) => {
    const wrap = el('div', { class: 'field' });
    const iid = a.id.replace(/\W/g, '_') + '_f' + i;
    wrap.append(el('label', { for: iid }, f.label), el('input', { id: iid, type: 'text', autocomplete: 'off', spellcheck: 'false' }));
    form.append(wrap);
    return { f, input: wrap.querySelector('input') };
  });
  const btn = el('button', { type: 'button' }, 'Проверить');
  form.append(btn);
  btn.addEventListener('click', () => {
    const bad = inputs.filter(({ f, input }) => !(f.expected || []).map(norm).includes(norm(input.value)));
    inputs.forEach(({ input }) => input.removeAttribute('aria-invalid'));
    bad.forEach(({ input }) => input.setAttribute('aria-invalid', 'true'));
    const ok = bad.length === 0;
    const msgs = [ok ? (a.success || 'Все поля совпали.') : (a.failure || 'Есть расхождения.')];
    if (!ok) msgs.push('Проверьте поля: ' + bad.map(({ f }) => f.label).join(', ') + '.');
    if (a.explanation) msgs.push(a.explanation);
    finish(ok, 'auto_checked', msgs.length > 2 ? [msgs[0], msgs.slice(1).join(' ')] : msgs);
  });
}

function decision(a, form, result, finish) {
  if (a.input) form.append(el('pre', { class: 'activity-input', tabindex: '0' }, a.input));
  const fs = el('fieldset');
  fs.append(el('legend', null, 'Ваше решение'));
  (a.options || []).forEach((o, i) => {
    const iid = a.id.replace(/\W/g, '_') + '_o' + i;
    const lab = el('label', { for: iid, class: 'choice' });
    const inp = el('input', { type: 'radio', name: a.id, id: iid, value: o.id });
    lab.append(inp, document.createTextNode(' ' + o.label));
    fs.append(lab);
  });
  form.append(fs);
  const rid = a.id.replace(/\W/g, '_') + '_reason';
  form.append(el('label', { for: rid }, 'Причина' + (a.require_reason ? ' (обязательно, не оценивается и не сохраняется)' : ' (по желанию, не оценивается и не сохраняется)')));
  const reason = el('textarea', { id: rid, rows: '3' });
  form.append(reason);
  const btn = el('button', { type: 'button' }, 'Проверить');
  form.append(btn);
  btn.addEventListener('click', () => {
    const sel = form.querySelector('input[type=radio]:checked');
    if (!sel) { result.replaceChildren(el('p', { class: 'result-fail' }, 'Выберите вариант решения.')); return; }
    if (a.require_reason && !reason.value.trim()) { result.replaceChildren(el('p', { class: 'result-fail' }, 'Напишите причину решения.')); return; }
    const ok = sel.value === a.correct;
    finish(ok, 'auto_checked', [a.explanation || '']);
  });
}

function findError(a, form, result, finish) {
  const fs = el('fieldset');
  fs.append(el('legend', null, 'Отметьте строки с ошибкой'));
  (a.candidate || []).forEach((c, i) => {
    const iid = a.id.replace(/\W/g, '_') + '_c' + i;
    const lab = el('label', { for: iid, class: 'choice' });
    lab.append(el('input', { type: 'checkbox', id: iid, value: c.id }), document.createTextNode(' '), el('code', null, c.text));
    fs.append(lab);
  });
  form.append(fs);
  const btn = el('button', { type: 'button' }, 'Проверить');
  form.append(btn);
  btn.addEventListener('click', () => {
    const sel = [...form.querySelectorAll('input:checked')].map((i) => i.value).sort().join('|');
    const exp = [...(a.error_ids || [])].sort().join('|');
    finish(sel !== '' && sel === exp, 'auto_checked', [a.explanation || '']);
  });
}

function checklist(a, form, result, finish, progress) {
  const fs = el('fieldset');
  fs.append(el('legend', null, 'Отметьте выполненное (самооценка)'));
  const boxes = (a.items || []).map((it, i) => {
    const iid = a.id.replace(/\W/g, '_') + '_i' + i;
    const lab = el('label', { for: iid, class: 'choice' });
    const inp = el('input', { type: 'checkbox', id: iid });
    lab.append(inp, document.createTextNode(' ' + it.text));
    fs.append(lab);
    return inp;
  });
  form.append(fs);
  const cur = progress.getActivity(a.id);
  if (cur && cur.v === a.v && cur.state === 'self_reported') boxes.forEach((b) => (b.checked = true));
  const upd = () => {
    const all = boxes.length > 0 && boxes.every((b) => b.checked);
    result.replaceChildren(el('p', null, all ? 'Все пункты отмечены. Это самооценка, а не проверка.' : 'Отмечено пунктов: ' + boxes.filter((b) => b.checked).length + ' из ' + boxes.length + '.'));
    progress.setActivity(a, all ? 'self_reported' : null);
    const st = form.parentNode.querySelector('.activity-status');
    if (st) st.textContent = all ? 'Статус: отмечено вами' : 'Статус: не начато';
  };
  boxes.forEach((b) => b.addEventListener('change', upd));
}
