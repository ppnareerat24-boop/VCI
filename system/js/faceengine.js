// faceengine.js — wraps @vladmandic/face-api for this app.
// Handles model loading, webcam, face detection and descriptor matching.

const FaceEngine = (() => {
  const LOCAL_MODELS = 'models';
  const CDN_MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

  // Distance below which two faces are considered the same person.
  // Lower = stricter. 0.5 is a good balance for the recognition model.
  const MATCH_THRESHOLD = 0.5;

  let _ready = false;
  let _matcher = null;
  let _userInfo = {}; // id -> { name, type, reason }
  let stream = null;

  const detectorOptions = () =>
    new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

  async function loadModels() {
    if (_ready) return;
    let base = LOCAL_MODELS;
    try {
      // Probe a local manifest; fall back to CDN if not served locally.
      const probe = await fetch(`${LOCAL_MODELS}/tiny_face_detector_model-weights_manifest.json`, {
        method: 'HEAD',
      });
      if (!probe.ok) base = CDN_MODELS;
    } catch {
      base = CDN_MODELS;
    }

    await faceapi.nets.tinyFaceDetector.loadFromUri(base);
    await faceapi.nets.faceLandmark68Net.loadFromUri(base);
    await faceapi.nets.faceRecognitionNet.loadFromUri(base);
    _ready = true;
  }

  async function startCamera(videoEl) {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    videoEl.srcObject = stream;
    await new Promise((resolve) => {
      videoEl.onloadedmetadata = () => {
        videoEl.play();
        resolve();
      };
    });
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  // Detect a single face + its 128-d descriptor from a video/image element.
  // Returns the full-faces detection object, or null if no face.
  async function detectOne(el) {
    return faceapi
      .detectSingleFace(el, detectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
  }

  // Build a matcher from the stored users.
  function buildMatcher(users) {
    _userInfo = {};
    const labeled = users
      .filter((u) => u.descriptors && u.descriptors.length)
      .map((u) => {
        _userInfo[u.id] = {
          name: u.name,
          type: u.type || 'นักเรียน/อาจารย์',
          reason: u.reason || '',
        };
        const descs = u.descriptors.map((d) => new Float32Array(d));
        return new faceapi.LabeledFaceDescriptors(String(u.id), descs);
      });

    _matcher = labeled.length
      ? new faceapi.FaceMatcher(labeled, MATCH_THRESHOLD)
      : null;
  }

  // Match a descriptor. Returns { userId, name, type, reason, distance } or null.
  function match(descriptor) {
    if (!_matcher) return null;
    const best = _matcher.findBestMatch(descriptor);
    if (best.label === 'unknown') return null;
    const id = parseInt(best.label, 10);
    const info = _userInfo[id] || {};
    return {
      userId: id,
      name: info.name,
      type: info.type || '',
      reason: info.reason || '',
      distance: best.distance,
    };
  }

  const isReady = () => _ready;
  const hasUsers = () => !!_matcher;

  return {
    loadModels,
    startCamera,
    stopCamera,
    detectOne,
    buildMatcher,
    match,
    isReady,
    hasUsers,
    MATCH_THRESHOLD,
  };
})();