// admin.js — admin page: login, registered-users list, attendance history.
// Shares IndexedDB (db.js) with the other pages. (Registration lives in register.js.)

(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Views ----------
  const loginView = $('loginView');
  const panelView = $('panelView');

  // ---------- Helpers ----------
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtDate = (ts) => {
    const d = new Date(ts);
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  const fmtTime = (ts) => {
    const d = new Date(ts);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  };

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2500);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function typeBadgeHtml(type) {
    if (!type) return '';
    const cls = type === 'บุคคลภายนอก' ? 'type-outsider' : 'type-insider';
    return `<span class="type-badge ${cls}">${escapeHtml(type)}</span>`;
  }

  // ================= Authentication =================
  const AUTH_KEY = 'faceAdminAuth';
  const AUTH_SALT = 'face-checkin-v1';

  const getAuth = () => {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)); }
    catch { return null; }
  };
  const setAuth = (obj) => localStorage.setItem(AUTH_KEY, JSON.stringify(obj));

  async function hashCred(username, password) {
    const data = new TextEncoder().encode(`${username}:${password}:${AUTH_SALT}`);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const loginForm = $('loginForm');
  const setupForm = $('setupForm');
  const loginUser = $('loginUser');
  const loginPass = $('loginPass');
  const loginError = $('loginError');
  const setupUser = $('setupUser');
  const setupPass = $('setupPass');
  const setupConfirm = $('setupConfirm');
  const setupError = $('setupError');

  const showError = (el, msg) => { el.textContent = msg; el.classList.remove('hidden'); };
  const hideError = (el) => el.classList.add('hidden');

  function showLogin() {
    panelView.classList.add('hidden');
    loginView.classList.remove('hidden');
    hideError(loginError);
    hideError(setupError);
    // login is server-validated; always show the login form
    setupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    loginUser.value = 'admin';
    loginPass.value = '';
    $('loginTitle').textContent = 'เข้าสู่ระบบผู้ดูแล';
    setTimeout(() => loginPass.focus(), 50);
  }

  async function showPanel() {
    loginView.classList.add('hidden');
    panelView.classList.remove('hidden');
    showTab('tabUsers');
  }

  function showTab(id) {
    document.querySelectorAll('.tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tab === id));
    document.querySelectorAll('.tab-panel').forEach((p) =>
      p.classList.toggle('hidden', p.id !== id));
    if (id === 'tabUsers') renderUserList();
    if (id === 'tabHistory') openHistory();
  }

  // ================= Registered users =================
  const userList = $('userList');
  const userSearch = $('userSearch');
  const userEmpty = $('userEmpty');

  async function renderUserList() {
    const users = await DB.getUsers();
    const term = (userSearch.value || '').trim().toLowerCase();
    userList.innerHTML = '';

    if (!users.length) {
      userEmpty.classList.add('hidden');
      userList.innerHTML = '<li><span class="u-meta">ยังไม่มีผู้ลงทะเบียน</span></li>';
      return;
    }

    const filtered = users
      .filter((u) => !term || u.name.toLowerCase().includes(term))
      .sort((a, b) => a.createdAt - b.createdAt);

    if (!filtered.length) {
      userEmpty.classList.remove('hidden');
      return;
    }
    userEmpty.classList.add('hidden');

    for (const u of filtered) {
      const li = document.createElement('li');
      const left = document.createElement('div');
      const type = u.type || 'นักเรียน/อาจารย์';
      left.innerHTML = `<strong>${escapeHtml(u.name)}</strong>${typeBadgeHtml(type)}
        <div class="u-meta">ลงทะเบียน ${fmtDate(u.createdAt)} · ${u.descriptors.length} ตัวอย่าง</div>`;
      const del = document.createElement('button');
      del.textContent = 'ลบ';
      del.onclick = async () => {
        if (!confirm(`ลบ "${u.name}" และประวัติทั้งหมด?`)) return;
        await DB.deleteUser(u.id);
        await renderUserList();
        toast('ลบแล้ว');
      };
      li.appendChild(left);
      li.appendChild(del);
      userList.appendChild(li);
    }
  }

  // ================= History =================
  const filterDate = $('filterDate');
  const filterName = $('filterName');
  const historyBody = $('historyBody');
  const historyEmpty = $('historyEmpty');

  let cachedRecords = [];

  async function openHistory() {
    cachedRecords = await DB.getAttendance();
    const users = await DB.getUsers();
    filterName.innerHTML = '<option value="">ทั้งหมด</option>';
    users.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    for (const u of users) {
      const opt = document.createElement('option');
      opt.value = u.name;
      opt.textContent = u.name;
      filterName.appendChild(opt);
    }
    renderHistory();
  }

  function filteredRows() {
    const dateVal = filterDate.value;
    const nameVal = filterName.value;
    return cachedRecords.filter((r) => {
      if (dateVal && r.dateKey !== dateVal) return false;
      if (nameVal && r.name !== nameVal) return false;
      return true;
    });
  }

  function renderHistory() {
    const rows = filteredRows();
    historyBody.innerHTML = '';
    if (!rows.length) {
      historyEmpty.classList.remove('hidden');
      return;
    }
    historyEmpty.classList.add('hidden');
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i + 1}</td><td>${escapeHtml(r.name)}</td>
        <td>${typeBadgeHtml(r.type || '') || '-'}</td>`;

      // Reason cell: editable input for outsiders, '-' otherwise.
      const reasonTd = document.createElement('td');
      if (r.type === 'บุคคลภายนอก') {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'reason-input';
        input.value = r.reason || '';
        input.placeholder = 'ใส่เหตุผลที่เข้าโรงเรียน...';
        const save = async () => {
          const val = input.value.trim();
          if (val === (r.reason || '')) return;
          await DB.updateAttendanceReason(r.id, val);
          r.reason = val;
          toast('บันทึกเหตุผลแล้ว');
        };
        input.addEventListener('change', save);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
        reasonTd.appendChild(input);
      } else {
        reasonTd.textContent = '-';
      }
      tr.appendChild(reasonTd);

      const tail = document.createElement('td');
      tail.textContent = fmtDate(r.ts);
      tr.appendChild(tail);
      const tail2 = document.createElement('td');
      tail2.textContent = fmtTime(r.ts);
      tr.appendChild(tail2);

      historyBody.appendChild(tr);
    });
  }

  function exportCsv() {
    const rows = filteredRows();
    if (!rows.length) { toast('ไม่มีข้อมูลให้ส่งออก'); return; }
    const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = ['ลำดับ,ชื่อ,ประเภท,เหตุผล,วันที่,เวลา'];
    rows.forEach((r, i) => {
      lines.push([
        i + 1,
        csvCell(r.name),
        csvCell(r.type || ''),
        csvCell(r.reason || ''),
        fmtDate(r.ts),
        fmtTime(r.ts),
      ].join(','));
    });
    // BOM so Excel reads UTF-8 (Thai) correctly.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ================= Wiring =================
  function wire() {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      const ok = await DB.login(loginUser.value.trim(), loginPass.value).catch(() => false);
      if (ok) showPanel();
      else showError(loginError, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    };

    $('btnLogout').onclick = () => {
      DB.logout();
      showLogin();
      toast('ออกจากระบบผู้ดูแลแล้ว');
    };

    document.querySelectorAll('.tab').forEach((t) => {
      t.onclick = () => showTab(t.dataset.tab);
    });

    userSearch.addEventListener('input', renderUserList);

    filterDate.onchange = renderHistory;
    filterName.onchange = renderHistory;
    $('btnClearFilter').onclick = () => {
      filterDate.value = '';
      filterName.value = '';
      renderHistory();
    };
    $('btnExportCsv').onclick = exportCsv;
    $('btnClearHistory').onclick = async () => {
      if (!confirm('ล้างประวัติการเช็คชื่อทั้งหมด?')) return;
      await DB.clearAttendance();
      cachedRecords = [];
      renderHistory();
      toast('ล้างประวัติแล้ว');
    };
  }

  window.addEventListener('DOMContentLoaded', () => {
    wire();
    showLogin();
  });
})();