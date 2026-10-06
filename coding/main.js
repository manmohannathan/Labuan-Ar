import { loadGLTF } from "../libs/loader.js";

const THREE = window.MINDAR.IMAGE.THREE;

// ------------------------------------------------------------
// Labuan Legends AR
// Marker-based AR + interactive 3D model controls
// ------------------------------------------------------------

const LOCAL_LABUAN_DATA = {
  umslic: {
    name: "UMS Labuan International Campus (UMSLIC)",
    hours: "8:00 AM - 5:00 PM (Mon - Fri)",
    fee: "Free Entry (Visitor Registration Required)",
    contact: "+60 87-503 000",
    en: {
      folklore:
        "Established in 1999, the Universiti Malaysia Sabah Labuan International Campus focuses extensively on international business, finance, and computing sciences, serving as a hub for global higher education in the region."
    },
    ms: {
      folklore:
        "Ditubuhkan pada tahun 1999, Universiti Malaysia Sabah Kampus Antarabangsa Labuan memfokuskan secara meluas kepada perniagaan antarabangsa, kewangan, dan sains pengkomputeran, bertindak sebagai hab pendidikan tinggi global di rantau ini."
    }
  }
};

const TARGET_PATH = "./assets/targets/testmarker.mind";
const MODEL_PATH = "./assets/models/test.gltf";
const AUDIO_EN_PATH = "./assets/audio/englishUmskal.mp3";
const AUDIO_MS_PATH = "./assets/audio/malayUmskal.mp3";

let currentLanguage = "en";
let isAudioPlaying = false;
let automaticPopupTriggered = false;
let mindarThree = null;
let anchor = null;
let modelRoot = null;
let canvas = null;
let lastTargetFound = false;

// Model placement relative to the marker.
// MindAR's image target is the parent coordinate system. The model is moved
// slightly along the target normal so it appears to stand above the marker.
const MODEL_Z_OFFSET = 0.08;
const MODEL_SCALE = 0.1;
const MIN_SCALE = 0.035;
const MAX_SCALE = 0.35;

const audioEN = new Audio(AUDIO_EN_PATH);
const audioMS = new Audio(AUDIO_MS_PATH);

const $ = (id) => document.getElementById(id);

const setStatus = (message, visible = true) => {
  const status = $("ar-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("hidden", !visible);
};

const setTargetStatus = (found) => {
  const markerHint = $("marker-hint");
  const gestureHint = $("gesture-hint");

  if (found) {
    if (markerHint) markerHint.classList.add("hidden");
    if (gestureHint) gestureHint.classList.remove("hidden");
    setStatus("Marker detected", true);
    setTimeout(() => setStatus("", false), 900);
  } else {
    if (markerHint) markerHint.classList.remove("hidden");
    if (gestureHint) gestureHint.classList.add("hidden");
  }
};

const initializeMindAR = () => {
  return new window.MINDAR.IMAGE.MindARThree({
    container: $("ar-container"),
    imageTargetSrc: TARGET_PATH,
    // One marker is all this project needs. This keeps tracking lighter.
    maxTrack: 1,
    filterMinCF: 0.001,
    filterBeta: 1000
  });
};

const setupLighting = (scene) => {
  scene.add(new THREE.AmbientLight(0xffffff, 1.15));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(2, 4, 3);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffe7c2, 0.55);
  fillLight.position.set(-2, 2, 1);
  scene.add(fillLight);
};

const loadBuildingModel = async () => {
  const gltf = await loadGLTF(MODEL_PATH);
  const root = gltf.scene;

  // Keep the original project's model scale, then place its base on the
  // marker coordinate system.
  root.scale.setScalar(MODEL_SCALE);
  root.rotation.set(0, 0, 0);
  root.position.set(0, 0, MODEL_Z_OFFSET);

  // Move the model vertically so its lowest point sits at y = 0.
  // This makes the building look like it is standing on the marker.
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const minY = box.min.y;
  root.position.y -= minY;
  root.updateMatrixWorld(true);

  return root;
};

const resetModelView = () => {
  if (!modelRoot) return;

  modelRoot.rotation.set(0, 0, 0);
  modelRoot.scale.setScalar(MODEL_SCALE);
  modelRoot.position.x = 0;
  modelRoot.position.z = MODEL_Z_OFFSET;

  // Recalculate the base after resetting scale.
  modelRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(modelRoot);
  modelRoot.position.y -= box.min.y;

  setStatus("Model view reset", true);
  setTimeout(() => setStatus("", false), 700);
};

const openInfoCard = (id) => {
  const target = LOCAL_LABUAN_DATA[id];
  if (!target) return;

  $("card-title").innerText = target.name;
  $("card-meta").innerHTML = `
      🏛️ <b>Campus:</b> ${target.name}<br>
      ⏰ <b>Hours:</b> ${target.hours}<br>
      🎫 <b>Fee:</b> ${target.fee}<br>
      📞 <b>Inquiries:</b> ${target.contact}
  `;
  $("card-folklore").innerText = target[currentLanguage].folklore;
  $("info-card").style.display = "block";
};

const stopAllAudio = () => {
  audioEN.pause();
  audioEN.currentTime = 0;
  audioMS.pause();
  audioMS.currentTime = 0;
  isAudioPlaying = false;
  $("narrator-btn").innerHTML =
    `<span id="narrator-icon" style="color: #721c24;">📜</span> Audio Lore`;
};

// ------------------------------------------------------------
// Touch / mouse interaction
// 1 finger or mouse drag = rotate
// 2 fingers = pinch to zoom + twist to rotate
// ------------------------------------------------------------

const pointers = new Map();
let previousSinglePointer = null;
let previousPinchDistance = null;
let previousPinchAngle = null;

const distanceBetween = (a, b) =>
  Math.hypot(b.x - a.x, b.y - a.y);

const angleBetween = (a, b) =>
  Math.atan2(b.y - a.y, b.x - a.x);

const normalizeAngleDelta = (angle) => {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
};

const getTwoPointers = () => {
  const values = Array.from(pointers.values());
  return [values[0], values[1]];
};

const handlePointerDown = (event) => {
  if (!modelRoot || !canvas) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;

  event.preventDefault();
  canvas.setPointerCapture?.(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size === 1) {
    previousSinglePointer = { x: event.clientX, y: event.clientY };
    previousPinchDistance = null;
    previousPinchAngle = null;
  } else if (pointers.size === 2) {
    const [a, b] = getTwoPointers();
    previousPinchDistance = distanceBetween(a, b);
    previousPinchAngle = angleBetween(a, b);
    previousSinglePointer = null;
  }
};

const handlePointerMove = (event) => {
  if (!modelRoot || !pointers.has(event.pointerId)) return;

  event.preventDefault();
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size === 1 && previousSinglePointer) {
    const point = pointers.get(event.pointerId);
    const dx = point.x - previousSinglePointer.x;
    const dy = point.y - previousSinglePointer.y;

    // Horizontal drag rotates the building around its vertical axis.
    modelRoot.rotation.y += dx * 0.012;

    // Small vertical rotation gives the user a better inspection angle.
    modelRoot.rotation.x += dy * 0.006;
    modelRoot.rotation.x = THREE.MathUtils.clamp(
      modelRoot.rotation.x,
      -0.65,
      0.65
    );

    previousSinglePointer = { x: point.x, y: point.y };
    return;
  }

  if (pointers.size >= 2) {
    const [a, b] = getTwoPointers();
    const distance = distanceBetween(a, b);
    const angle = angleBetween(a, b);

    if (previousPinchDistance && previousPinchDistance > 0) {
      const scaleFactor = distance / previousPinchDistance;
      const nextScale = THREE.MathUtils.clamp(
        modelRoot.scale.x * scaleFactor,
        MIN_SCALE,
        MAX_SCALE
      );
      modelRoot.scale.setScalar(nextScale);
    }

    if (previousPinchAngle !== null) {
      const angleDelta = normalizeAngleDelta(angle - previousPinchAngle);
      modelRoot.rotation.y += angleDelta;
    }

    previousPinchDistance = distance;
    previousPinchAngle = angle;
  }
};

const handlePointerUp = (event) => {
  pointers.delete(event.pointerId);

  if (pointers.size === 1) {
    const [remaining] = Array.from(pointers.values());
    previousSinglePointer = { x: remaining.x, y: remaining.y };
    previousPinchDistance = null;
    previousPinchAngle = null;
  } else if (pointers.size === 0) {
    previousSinglePointer = null;
    previousPinchDistance = null;
    previousPinchAngle = null;
  }
};

const setupModelInteraction = () => {
  canvas = $("ar-container").querySelector("canvas");
  if (!canvas) {
    console.warn("AR canvas was not found.");
    return;
  }

  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
  canvas.addEventListener("pointermove", handlePointerMove, { passive: false });
  canvas.addEventListener("pointerup", handlePointerUp, { passive: false });
  canvas.addEventListener("pointercancel", handlePointerUp, { passive: false });
  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") handlePointerUp(event);
  }, { passive: false });
};

// ------------------------------------------------------------
// Application startup
// ------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  $("info-btn").addEventListener("click", () => openInfoCard("umslic"));

  $("close-card-btn").addEventListener("click", () => {
    $("info-card").style.display = "none";
  });

  $("lang-select").addEventListener("change", (event) => {
    currentLanguage = event.target.value;
    stopAllAudio();
    if ($("info-card").style.display === "block") openInfoCard("umslic");
  });

  $("narrator-btn").addEventListener("click", () => {
    const activeAudio = currentLanguage === "en" ? audioEN : audioMS;

    if (!isAudioPlaying) {
      activeAudio
        .play()
        .catch((err) => console.warn("Audio playback blocked:", err));
      isAudioPlaying = true;
      $("narrator-btn").innerHTML =
        `<span id="narrator-icon" style="color: #721c24;">🛑</span> Stop Audio`;
      activeAudio.onended = stopAllAudio;
    } else {
      stopAllAudio();
    }
  });

  $("reset-view-btn")?.addEventListener("click", resetModelView);

  const start = async () => {
    setStatus("Starting camera…", true);

    mindarThree = initializeMindAR();
    const { renderer, scene, camera } = mindarThree;

    renderer.setClearColor(0x000000, 0);
    setupLighting(scene);

    // Create the marker anchor before starting the AR session.
    anchor = mindarThree.addAnchor(0);

    // Load the model before attaching it. This prevents the user from seeing
    // an empty AR experience after the camera has already started.
    modelRoot = await loadBuildingModel();
    anchor.group.add(modelRoot);

    anchor.onTargetFound = () => {
      console.log("Labuan Legends AR: marker detected.");
      lastTargetFound = true;
      setTargetStatus(true);

      if (!automaticPopupTriggered) {
        automaticPopupTriggered = true;
        setTimeout(() => openInfoCard("umslic"), 800);
      }
    };

    anchor.onTargetLost = () => {
      console.log("Labuan Legends AR: marker lost.");
      lastTargetFound = false;
      setTargetStatus(false);
    };

    await mindarThree.start();

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

    // MindAR creates its canvas during initialization/startup.
    setupModelInteraction();

    setStatus("Point your camera at the Labuan marker", true);
  };

  start().catch((error) => {
    console.error("Labuan Legends AR startup error:", error);
    setStatus("AR could not start. Check the browser console.", true);
  });
});
