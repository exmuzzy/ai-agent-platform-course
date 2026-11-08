// Markdown -> HTML для курса. markdown-it 15, html:false.
// NOTE-W01: ctx = { path (repo-путь исходника), urlFor(repoPath, fromPath) -> string|null, errors?: [] }.
// urlFor возвращает относительный URL страницы сайта или null, если файл не опубликован.
import MarkdownIt from 'markdown-it';
import path from 'node:path';

const ROLES = new Set(['user', 'builder', 'engineer']);
const ROLE_LABEL = { user: 'Для пользователя (USER)', builder: 'Для строителя (BUILDER)', engineer: 'Для инженера (ENGINEER)' };
const NOT_PUBLISHED = ' (внутренний материал авторского репозитория, не опубликован)';
const ACT_TYPES = {
  checklist: ['items'],
  field_check: ['input', 'fields', 'success', 'failure'],
  decision: ['input', 'options', 'correct', 'explanation'],
  find_error: ['candidate', 'error_ids', 'explanation'],
};
const ACT_COMMON = ['id', 'type', 'title', 'scenario', 'instruction', 'mode', 'roles', 'required', 'version'];
const ACT_EXTRA = { decision: ['require_reason'] };

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function jsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/&/g, '\\u0026').replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function validateActivity(a, where = '') {
  const p = where ? where + ': ' : '';
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error(p + 'activity должен быть объектом');
  if (!/^M0[0-9]\.A[0-9]{2}$/.test(String(a.id))) throw new Error(`${p}неверный id активности: ${a.id}`);
  if (!ACT_TYPES[a.type]) throw new Error(`${p}${a.id}: неизвестный type ${a.type}`);
  for (const f of ['title', 'scenario', 'instruction', 'mode']) {
    if (typeof a[f] !== 'string' || !a[f]) throw new Error(`${p}${a.id}: нет поля ${f}`);
  }
  if (!['normal', 'forbidden', 'error'].includes(a.scenario)) throw new Error(`${p}${a.id}: неверный scenario`);
  for (const f of ACT_TYPES[a.type]) if (a[f] === undefined) throw new Error(`${p}${a.id}: нет поля ${f}`);
  const allowed = new Set([...ACT_COMMON, ...ACT_TYPES[a.type], ...(ACT_EXTRA[a.type] || [])]);
  for (const k of Object.keys(a)) if (!allowed.has(k)) throw new Error(`${p}${a.id}: неизвестное поле ${k}`);
  return a;
}

function slugify(s) {
  const t = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return t || 'section';
}

function safeScheme(href) {
  const m = /^\s*([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(href);
  return m ? m[1].toLowerCase() : null;
}

function roleContainer(state, startLine, endLine, silent) {
  const pos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const line = state.src.slice(pos, max);
  const m = /^:::\s*(user|builder|engineer)\s*$/.exec(line);
  if (!m) return false;
  if (silent) return true;
  let next = startLine + 1;
  let found = false;
  for (; next < endLine; next++) {
    const p = state.bMarks[next] + state.tShift[next];
    if (/^:::\s*$/.test(state.src.slice(p, state.eMarks[next]))) { found = true; break; }
  }
  if (!found) throw new Error(`Не закрыт блок ::: ${m[1]} (строка ${startLine + 1})`);
  const open = state.push('role_open', 'section', 1);
  open.block = true; open.meta = { role: m[1] }; open.map = [startLine, next];
  const oldParent = state.parentType, oldMax = state.lineMax;
  state.parentType = 'container'; state.lineMax = next;
  state.md.block.tokenize(state, startLine + 1, next);
  state.parentType = oldParent; state.lineMax = oldMax;
  const close = state.push('role_close', 'section', -1);
  close.block = true;
  state.line = next + 1;
  return true;
}

function plain(tokens) {
  let out = '';
  for (const t of tokens) {
    if (t.type === 'inline') out += plain(t.children || []) + '\n';
    else if (t.type === 'text' || t.type === 'code_inline') out += t.content;
    else if (t.type === 'fence' || t.type === 'code_block') out += t.content + '\n';
    else if (t.type === 'softbreak' || t.type === 'hardbreak') out += ' ';
    else if (t.type === 'html_inline') { /* якоря не в текст */ }
    else if (/_close$/.test(t.type) && t.block) out += '\n';
  }
  return out;
}

export function renderMarkdown(src, ctx = {}) {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  md.block.ruler.before('fence', 'role_container', roleContainer, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.role_open = (toks, i) => {
    const r = toks[i].meta.role;
    return `<section class="role-block" data-role="${r}">\n<p class="role-label">${ROLE_LABEL[r]}</p>\n`;
  };
  md.renderer.rules.role_close = () => '</section>\n';

  const activities = [];
  const headings = [];
  const usedIds = new Set();
  const origFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (toks, i, opts, env, self) => {
    const t = toks[i];
    const lang = (t.info || '').trim().split(/\s+/)[0];
    if (lang === 'activity') {
      let a;
      try { a = JSON.parse(t.content); } catch (e) { throw new Error(`${ctx.path || ''}: activity JSON: ${e.message}`); }
      validateActivity(a, ctx.path || '');
      activities.push(a);
      return `<div class="activity" data-activity="${escapeHtml(a.id)}" data-type="${escapeHtml(a.type)}"><script type="application/json">${jsonForScript(a)}</script></div>\n`;
    }
    return origFence(toks, i, opts, env, self);
  };

  // Якоря глоссария и ссылки
  md.core.ruler.after('text_join', 'course_inline', (state) => {
    const Token = state.Token;
    for (const blk of state.tokens) {
      if (blk.type !== 'inline' || !blk.children) continue;
      // 1) якоря <a id="tNN"></a>
      const out = [];
      for (const ch of blk.children) {
        if (ch.type === 'text' && ch.content.includes('<a id="')) {
          const re = /<a id="(t\d{2})"><\/a>/g;
          let last = 0, m;
          while ((m = re.exec(ch.content))) {
            if (m.index > last) { const t = new Token('text', '', 0); t.content = ch.content.slice(last, m.index); out.push(t); }
            const h = new Token('html_inline', '', 0); h.content = `<a id="${m[1]}"></a>`; out.push(h);
            last = m.index + m[0].length;
          }
          if (last < ch.content.length) { const t = new Token('text', '', 0); t.content = ch.content.slice(last); out.push(t); }
        } else out.push(ch);
      }
      // 2) ссылки
      const res = [];
      const stack = [];
      for (const ch of out) {
        if (ch.type === 'link_open') {
          const href = ch.attrGet('href') || '';
          const r = resolveLink(href, ctx);
          if (r.kind === 'ok') {
            ch.attrs = [['href', r.href]];
            if (r.external) { ch.attrSet('rel', 'noopener noreferrer'); }
            stack.push({ drop: false });
            res.push(ch);
          } else {
            stack.push({ drop: true, note: r.kind === 'internal' });
          }
        } else if (ch.type === 'link_close') {
          const s = stack.pop();
          if (s && s.drop) {
            if (s.note) { const t = new Token('text', '', 0); t.content = NOT_PUBLISHED; res.push(t); }
          } else res.push(ch);
        } else res.push(ch);
      }
      blk.children = res;
    }
  });

  // Заголовки: id и список
  md.core.ruler.push('course_headings', (state) => {
    const toks = state.tokens;
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].type === 'heading_open') {
        const level = Number(toks[i].tag.slice(1));
        const text = plain([toks[i + 1]]).trim();
        let id = slugify(text), n = 2; const base = id;
        while (usedIds.has(id)) id = `${base}-${n++}`;
        usedIds.add(id);
        toks[i].attrSet('id', id);
        headings.push({ level, text, id });
      }
    }
  });

  const tokens = md.parse(src, {});
  const html = md.renderer.render(tokens, md.options, {});
  // Таблицы: обёртка для горизонтальной прокрутки
  const wrapped = html.replace(/<table>/g, '<div class="table-wrap" tabindex="0" role="region" aria-label="Таблица (прокручивается)"><table>').replace(/<\/table>/g, '</table></div>');
  return { html: wrapped, activities, headings, text: plain(tokens).replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim() };
}

function resolveLink(href, ctx) {
  if (href.startsWith('#')) return { kind: 'ok', href: encodeURI(decodeURI(href)).replace(/'/g, '%27') };
  const scheme = safeScheme(href);
  if (scheme) {
    if (scheme === 'https') return { kind: 'ok', href, external: true };
    return { kind: 'drop' }; // javascript:, data:, http:, mailto: и т. п. - только текст
  }
  if (href.startsWith('//')) return { kind: 'drop' };
  const [pathPart, frag] = href.split('#');
  if (!pathPart) return { kind: 'drop' };
  let target;
  try { target = path.posix.normalize(path.posix.join(path.posix.dirname(ctx.path || 'x'), decodeURI(pathPart))); } catch { return { kind: 'internal' }; }
  if (target.startsWith('../') || path.posix.isAbsolute(target)) return { kind: 'internal' };
  const url = typeof ctx.urlFor === 'function' ? ctx.urlFor(target, ctx.path) : null;
  if (!url) return { kind: 'internal' };
  return { kind: 'ok', href: url + (frag ? '#' + frag : '') };
}
