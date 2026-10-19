import { sample, money, cents, monthAt, validate, parseMarkdown, demoAdjust, requestPlan } from './plan.mjs';

const $ = selector => document.querySelector(selector);
const startInput = $('#start-month');
const now = new Date();
startInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const storageKey = 'allot.plan-import.prototype.v1';
let draft = null;
let selectedMonth = 0;
let attachments = [];
let saved = false;
let busy = false;
let invalid = false;
const conversation = [];

function message(role, text, images = []) {
  conversation.push({ role, text });
  const article = document.createElement('article');
  article.className = `message ${role}`;
  const label = document.createElement('span');
  label.className = 'message-label';
  label.textContent = role === 'user' ? '你' : 'Allot · 本地演示';
  const body = document.createElement('p');
  body.className = 'message-body';
  body.textContent = text;
  article.append(label, body);
  for (const file of images) {
    const image = document.createElement('img');
    image.src = file.url;
    image.alt = file.name;
    image.className = 'message-image';
    article.append(image);
  }
  $('#conversation').append(article);
  document.querySelector('.intro').classList.add('has-conversation');
}

function dirty() {
  saved = false;
  $('#draft-status').textContent = '待确认';
  $('#use-plan').disabled = invalid;
  $('#use-plan').firstChild.textContent = '使用计划 ';
  $('#saved-note').textContent = '';
}

function totals() {
  $('#month-total').textContent = money(draft.months[selectedMonth].amounts.reduce((a, b) => a + b, 0));
  $('#plan-total').textContent = money(draft.months.flatMap(row => row.amounts).reduce((a, b) => a + b, 0));
}

function renderDraft() {
  $('#draft').hidden = !draft;
  if (!draft) return;
  startInput.value = draft.months[0].month;
  $('#duration').textContent = `${draft.months.length} 个月`;
  $('#months').replaceChildren();
  draft.months.forEach((row, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = row.month.replace('-', '.');
    button.setAttribute('aria-pressed', String(index === selectedMonth));
    button.addEventListener('click', () => {
      if (invalid) { $('#draft-error').textContent = '请先修正当前金额，再切换月份。'; return; }
      selectedMonth = index;
      renderDraft();
    });
    $('#months').append(button);
  });
  $('#assets').replaceChildren();
  draft.assets.forEach((name, index) => {
    const row = document.createElement('label');
    row.className = 'asset';
    const label = document.createElement('span');
    label.className = 'asset-name';
    label.textContent = name;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = money(draft.months[selectedMonth].amounts[index]);
    input.setAttribute('aria-label', `${draft.months[selectedMonth].month} ${name}计划金额`);
    input.addEventListener('input', () => {
      try {
        const value = cents(input.value);
        input.removeAttribute('aria-invalid');
        draft.months[selectedMonth].amounts[index] = value;
        invalid = [...$('#assets').querySelectorAll('input')].some(el => el.hasAttribute('aria-invalid'));
        if (!invalid) $('#draft-error').textContent = '';
        dirty();
        totals();
      } catch (error) {
        invalid = true;
        input.setAttribute('aria-invalid', 'true');
        $('#draft-error').textContent = error.message;
        dirty();
      }
    });
    row.append(label, input);
    $('#assets').append(row);
  });
  totals();
  $('#draft-status').textContent = saved ? '已使用' : '待确认';
  $('#use-plan').disabled = saved || invalid;
  $('#use-plan').firstChild.textContent = saved ? '已使用计划 ' : '使用计划 ';
}

function renderAttachments() {
  $('#attachments').replaceChildren();
  attachments.forEach((file, index) => {
    const chip = document.createElement('div');
    chip.className = 'attachment';
    if (file.url) {
      const image = document.createElement('img');
      image.src = file.url;
      image.alt = '';
      chip.append(image);
    }
    const name = document.createElement('span');
    name.textContent = file.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `移除${file.name}`);
    remove.addEventListener('click', () => {
      if (file.url) URL.revokeObjectURL(file.url);
      attachments.splice(index, 1);
      renderAttachments();
    });
    chip.append(name, remove);
    $('#attachments').append(chip);
  });
}

$('#attach').addEventListener('click', () => $('#files').click());
$('#files').addEventListener('change', async () => {
  $('#input-error').textContent = '';
  for (const file of $('#files').files) {
    if (attachments.length >= 4) { $('#input-error').textContent = '一次最多添加 4 个附件。'; break; }
    if (file.size > 8 * 1024 * 1024) { $('#input-error').textContent = '单个附件不能超过 8 MB。'; continue; }
    if (/^image\/(png|jpeg|webp)$/.test(file.type)) attachments.push({ name: file.name, url: URL.createObjectURL(file), file });
    else if (/\.(md|markdown|txt)$/i.test(file.name)) attachments.push({ name: file.name, text: await file.text() });
    else $('#input-error').textContent = '请选择 PNG、JPEG、WebP 图片或 Markdown、TXT 文件。';
  }
  $('#files').value = '';
  renderAttachments();
});

async function send() {
  if (busy) return;
  const text = $('#message').value.trim();
  if (!text && !attachments.length) { $('#input-error').textContent = '先写下计划，或添加一个附件。'; return; }
  if (invalid) { $('#input-error').textContent = '请先修正草稿中的金额。'; return; }
  const markdown = [text, ...attachments.filter(file => file.text !== undefined).map(file => file.text)].join('\n\n');
  if (markdown.length > 100000) { $('#input-error').textContent = '内容太长，请保留计划相关部分后再发送。'; return; }
  busy = true;
  $('#send').disabled = true;
  $('#input-error').textContent = '';
  const images = attachments.filter(file => file.url);
  message('user', text + (attachments.length ? '\n' + attachments.map(file => `附件：${file.name}`).join('\n') : ''), images);
  $('#message').value = '';
  const submittedAttachments = attachments;
  attachments = [];
  renderAttachments();
  try {
    if (images.length) {
      // Never pretend to read the image or silently ignore it in a mixed request.
      message('assistant', '已收到图片。当前未接入 AI，不能理解图片或图片与文字的关系，草稿未改变。接入 API 后会把附件与对话一起理解；现在可先粘贴 Markdown 表格体验。');
      return;
    }
    const parsed = parseMarkdown(markdown, startInput.value);
    if (parsed) {
      draft = parsed.plan;
      selectedMonth = 0;
      invalid = false;
      dirty();
      $('#draft-error').textContent = '';
      $('#start-hint').textContent = '“现在 / 第 N 月”按所选开始月份整理；请核对月份。';
      renderDraft();
      const extra = draft.assets.some(name => /预留|结余/.test(name)) ? '\n预留项目暂按原表保留，尚未判断它是否属于投资任务。' : '';
      message('assistant', `已按表格整理出 ${draft.months.length} 个月、${draft.assets.length} 个项目的草稿，尚未导入。\n这是本地表格解析演示，不代表 AI 已理解表格外的说明。${extra}${parsed.warnings.length ? '\n' + parsed.warnings.join('\n') : ''}\n你可以直接改金额，或试着说“${draft.assets[0]}这个月改成 2000”（演示中的“这个月”指草稿第一个月）。`);
    } else if (draft) {
      const adjusted = demoAdjust(text, draft);
      if (adjusted) {
        draft = adjusted;
        selectedMonth = 0;
        dirty();
        renderDraft();
        message('assistant', `已更新草稿第一个月（${draft.months[0].month}）的金额，其他月份保持原样。确认后再使用计划。`);
      } else await requestPlan({ conversation, draft, attachments: submittedAttachments });
    } else await requestPlan({ conversation, draft, attachments: submittedAttachments });
  } catch (error) { message('assistant', error.message); }
  finally {
    busy = false;
    $('#send').disabled = false;
    $('#draft').hidden = !draft;
  }
}

$('#composer').addEventListener('submit', event => { event.preventDefault(); send(); });
$('#sample').addEventListener('click', () => {
  if (busy || invalid) return;
  if (attachments.length) { $('#input-error').textContent = '请先发送或移除附件，再体验示例。'; return; }
  $('#message').value = sample;
  send();
});
startInput.addEventListener('change', () => {
  if (!draft || invalid) { if (draft) startInput.value = draft.months[0].month; return; }
  try {
    const next = structuredClone(draft);
    const original = next.months[0].month.split('-').map(Number);
    const origin = original[0] * 12 + original[1];
    next.months.forEach(row => {
      const [year, month] = row.month.split('-').map(Number);
      row.month = monthAt(startInput.value, year * 12 + month - origin);
    });
    draft = validate(next);
    dirty();
    renderDraft();
    $('#start-hint').textContent = '已整体平移计划月份，请确认新的起止时间。';
  } catch (error) { $('#draft-error').textContent = error.message; startInput.value = draft.months[0].month; }
});

$('#use-plan').addEventListener('click', () => {
  if (!draft || invalid || saved) return;
  try {
    validate(draft);
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, plan: draft, savedAt: new Date().toISOString() }));
    saved = true;
    renderDraft();
    $('#saved-note').textContent = '已导入此浏览器。刷新后仍可查看；此原型不跳转本月首页。';
  } catch (error) { $('#draft-error').textContent = `未保存：${error.message}`; }
});

try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (stored?.version === 1) {
    draft = validate(stored.plan);
    saved = true;
    renderDraft();
    $('#saved-note').textContent = '已恢复此浏览器上次使用的计划，继续修改后需再次确认。';
    $('#start-hint').textContent = '当前为已保存计划的开始月份。';
  }
} catch { $('#input-error').textContent = '上次计划无法读取，可重新导入。'; }
