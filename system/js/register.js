// register.js — standalone first-time registration (no login required).
// Shares IndexedDB (db.js) and the face engine (faceengine.js).

(() => {
  const $ = (id) => document.getElementById(id);

  const modelsReady = FaceEngine.loadModels().catch((e) =>
    console.error('โหลดโมเดลไม่สำเร็จ', e));
  let cameraStarted = false;

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2500);
  }

  const regVideo = $('regVideo');
  const regPreviewPlaceholder = $('regPreviewPlaceholder');
  const regName = $('regName');
  const outsiderNote = $('outsiderNote');
  const btnCapture = $('btnCapture');
  const captureStatus = $('captureStatus');
  const btnSaveUser = $('btnSaveUser');

  const SAMPLES_NEEDED = 5;
  let capturedDescriptors = [];

  async function startCamera() {
    if (cameraStarted) { regPreviewPlaceholder.style.display = 'none'; return; }
    try {
      await FaceEngine.startCamera(regVideo);
      cameraStarted = true;
      regPreviewPlaceholder.style.display = 'none';
    } catch (e) {
      regPreviewPlaceholder.textContent = 'เปิดกล้องไม่ได้';
      regPreviewPlaceholder.style.display = 'flex';
      toast('เปิดกล้องไม่ได้ — โปรดอนุญาตการใช้กล้อง');
    }
  }

  const selectedRegType = () =>
    document.querySelector('input[name="regType"]:checked')?.value || 'นักเรียน/อาจารย์';

  function syncOutsiderNote() {
    outsiderNote.style.display = selectedRegType() === 'บุคคลภายนอก' ? 'block' : 'none';
  }

  function resetForm() {
    regName.value = '';
    document.querySelector('input[name="regType"][value="นักเรียน/อาจารย์"]').checked = true;
    syncOutsiderNote();
    capturedDescriptors = [];
    captureStatus.textContent = `ตัวอย่างที่เก็บได้: 0 / ${SAMPLES_NEEDED}`;
    btnSaveUser.disabled = true;
    btnCapture.disabled = false;
    btnCapture.textContent = 'เริ่มจับภาพใบหน้า';
  }

  async function captureSamples() {
    captureStatus.textContent = 'กำลังเตรียมโมเดล/กล้อง...';
    btnCapture.disabled = true;
    btnSaveUser.disabled = true;
    await modelsReady;
    await startCamera();

    capturedDescriptors = [];
    const deadline = Date.now() + 20000;
    while (capturedDescriptors.length < SAMPLES_NEEDED && Date.now() < deadline) {
      captureStatus.textContent =
        `กำลังจับภาพ... ${capturedDescriptors.length} / ${SAMPLES_NEEDED} (มองกล้อง)`;
      const det = await FaceEngine.detectOne(regVideo);
      if (det && det.descriptor) capturedDescriptors.push(det.descriptor);
      await new Promise((r) => setTimeout(r, 500));
    }

    captureStatus.textContent =
      `ตัวอย่างที่เก็บได้: ${capturedDescriptors.length} / ${SAMPLES_NEEDED}`;
    btnCapture.disabled = false;
    btnCapture.textContent = 'จับภาพใหม่';
    btnSaveUser.disabled = capturedDescriptors.length === 0;
    if (capturedDescriptors.length === 0) toast('ตรวจไม่พบใบหน้า ลองใหม่ในที่แสงสว่างพอ');
  }

  async function saveUser() {
    const name = regName.value.trim();
    if (!name) { toast('กรุณากรอกชื่อ'); regName.focus(); return; }
    if (capturedDescriptors.length === 0) { toast('ยังไม่ได้จับภาพใบหน้า'); return; }
    btnSaveUser.disabled = true;
    await DB.addUser(name, capturedDescriptors, selectedRegType());
    resetForm();
    toast(`ลงทะเบียน ${name} สำเร็จ`);
  }

  document.querySelectorAll('input[name="regType"]').forEach((r) =>
    r.addEventListener('change', syncOutsiderNote));
  btnCapture.onclick = captureSamples;
  btnSaveUser.onclick = saveUser;
  startCamera();
})();
