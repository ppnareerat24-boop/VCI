// checkin.js — main check-in screen.
// Detects faces from the webcam, matches against registered users (IndexedDB),
// and records one attendance per person per day.

(() => {
  const $ = (id) => document.getElementById(id);
  const video = $('video');
  const overlay = $('overlay');
  const cameraPlaceholder = $('cameraPlaceholder');
  const loading = $('loading');
  const loadingText = $('loadingText');

  const nameValue = $('nameValue');
  const personType = $('personType');
  const statusBadge = $('statusBadge');
  const datetimeEl = $('datetime');

  // ---------- State ----------
  let displayState = { kind: 'scan', name: '—', type: '', reason: '', fixedTime: null, holdUntil: 0 };
  const HOLD_MS = 4000; // keep a recognized result on screen this long

  // ---------- Helpers ----------
  const pad2 = (n) => String(n).padStart(2, '0');

  function fmtMain(ts) {
    const d = new Date(ts);
    const date = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
    const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    return { date, time };
  }

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

  const BADGE_CLASS = {
    scan: 'badge badge-scan',
    idle: 'badge badge-idle',
    success: 'badge badge-success',
    warn: 'badge badge-warn',
    error: 'badge badge-error',
  };
  const BADGE_TEXT = {
    scan: 'กำลังค้นหาใบหน้า...',
    idle: 'พร้อมเช็คชื่อ',
    success: 'เช็คชื่อแล้ว!',
    warn: 'เช็คชื่อไปแล้ววันนี้',
    error: 'ไม่พบข้อมูล (กรุณาลงทะเบียน)',
    nocam: 'ไม่พบกล้อง',
  };

  function typeBadgeHtml(type) {
    if (!type) return '';
    const cls = type === 'บุคคลภายนอก' ? 'type-outsider' : 'type-insider';
    return `<span class="type-badge ${cls}">${escapeHtml(type)}</span>`;
  }

  function render() {
    const s = displayState;
    nameValue.textContent = s.name || '—';
    statusBadge.className = BADGE_CLASS[s.kind] || BADGE_CLASS.idle;
    statusBadge.textContent = BADGE_TEXT[s.kind] || '';

    // Show the person's type (and reason for outsiders) under the name.
    if (s.type && (s.kind === 'success' || s.kind === 'warn')) {
      let html = typeBadgeHtml(s.type);
      if (s.type === 'บุคคลภายนอก' && s.reason) {
        html += ` <span class="reason-text">เหตุผล: ${escapeHtml(s.reason)}</span>`;
      }
      personType.innerHTML = html;
    } else {
      personType.innerHTML = '';
    }

    const ts = s.fixedTime != null ? s.fixedTime : Date.now();
    const { date, time } = fmtMain(ts);
    datetimeEl.innerHTML = `${date}<br />${time}`;
  }

  function setState(kind, name, fixedTime, hold, type, reason) {
    displayState = {
      kind,
      name: name || '—',
      type: type || '',
      reason: reason || '',
      fixedTime: fixedTime != null ? fixedTime : null,
      holdUntil: hold ? Date.now() + HOLD_MS : 0,
    };
    render();
  }

  // ---------- Overlay box ----------
  function drawBox(detection, color) {
    const ctx = overlay.getContext('2d');
    overlay.width = video.videoWidth || overlay.width;
    overlay.height = video.videoHeight || overlay.height;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!detection) return;
    const r = faceapi.resizeResults(detection, {
      width: overlay.width,
      height: overlay.height,
    });
    const box = r.detection.box;
    ctx.lineWidth = Math.max(2, overlay.width / 200);
    ctx.strokeStyle = color;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  }

  // ---------- Detection loop ----------
  async function loop() {
    if (FaceEngine.isReady() && video.readyState >= 2) {
      try {
        const det = await FaceEngine.detectOne(video);
        const now = Date.now();

        if (det) {
          const m = FaceEngine.hasUsers() ? FaceEngine.match(det.descriptor) : null;
          if (m) {
            const { record, isNew } = await DB.checkIn(m.userId, m.name, m.type);
            drawBox(det, '#28a745');
            // Keep the green "เช็คชื่อแล้ว!" while the same person stays in frame.
            // Show the orange "เช็คชื่อไปแล้ววันนี้" only when they return later.
            const stillPresent =
              displayState.kind === 'success' && displayState.name === m.name;
            if (isNew || stillPresent) {
              if (isNew) toast(`เช็คชื่อ: ${m.name}`);
              setState('success', m.name, record.ts, true, record.type || m.type, record.reason);
            } else {
              setState('warn', m.name, record.ts, true, record.type || m.type, record.reason);
            }
          } else {
            drawBox(det, '#e23b3b');
            if (!(now < displayState.holdUntil &&
                  (displayState.kind === 'success' || displayState.kind === 'warn'))) {
              setState('error', '—', null, false);
            }
          }
        } else {
          drawBox(null);
          if (!(now < displayState.holdUntil &&
                (displayState.kind === 'success' || displayState.kind === 'warn'))) {
            setState('scan', '—', null, false);
          }
        }
      } catch (e) {
        // keep looping even if a single frame fails
      }
    }
    setTimeout(loop, 450);
  }

  // ---------- Live clock ----------
  setInterval(() => {
    if (displayState.fixedTime == null) render();
  }, 1000);

  // ---------- Init ----------
  async function init() {
    try {
      loadingText.textContent = 'กำลังโหลดโมเดลตรวจจับใบหน้า...';
      await FaceEngine.loadModels();

      loadingText.textContent = 'กำลังเปิดกล้อง...';
      try {
        await FaceEngine.startCamera(video);
        cameraPlaceholder.style.display = 'none';
      } catch (camErr) {
        statusBadge.className = BADGE_CLASS.error;
        statusBadge.textContent = BADGE_TEXT.nocam;
        toast('เปิดกล้องไม่ได้ — โปรดอนุญาตการใช้กล้อง');
      }

      const users = await DB.getUsers();
      FaceEngine.buildMatcher(users);

      loading.classList.add('hidden');
      render();
      loop();
    } catch (e) {
      loadingText.textContent = 'เกิดข้อผิดพลาดในการโหลดระบบ: ' + e.message;
      console.error(e);
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();