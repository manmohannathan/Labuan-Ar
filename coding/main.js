// Import necessary functions and objects
import { loadGLTF } from "../libs/loader.js";
const THREE = window.MINDAR.IMAGE.THREE;

// --- REPOSITORY DATA MODEL STORAGE ---
const LOCAL_LABUAN_DATA = {
  umslic: {
    name: "UMS Labuan International Campus (UMSLIC)",
    hours: "8:00 AM - 5:00 PM (Mon - Fri)",
    fee: "Free Entry (Visitor Registration Required)",
    contact: "+60 87-503 000",
    en: { 
      folklore: "Established in 1999, the Universiti Malaysia Sabah Labuan International Campus focuses extensively on international business, finance, and computing sciences, serving as a hub for global higher education in the region." 
    },
    ms: { 
      folklore: "Ditubuhkan pada tahun 1999, Universiti Malaysia Sabah Kampus Antarabangsa Labuan memfokuskan secara meluas kepada perniagaan antarabangsa, kewangan, dan sains pengkomputeran, bertindak sebagai hab pendidikan tinggi global di rantau ini." 
    }
  }
};

let currentLanguage = 'en';
let isAudioPlaying = false;
let buildingModelMesh = null;
let automaticPopupTriggered = false; 

// Instantiating standard HTML5 Audio components natively
const audioEN = new Audio('../assets/audio/englishUmskal.mp3');
const audioMS = new Audio('../assets/audio/malayUmskal.mp3');

// Mouse Drag State Variables for Rotation Engine
let isDragging = false;
let previousMousePosition = { x: 0 };

const initializeMindAR = () => {
  return new window.MINDAR.IMAGE.MindARThree({
    container: document.getElementById('ar-container'),
    imageTargetSrc: '../assets/targets/testBuilding.mind',
    filterMinCF: 0.001, // Smoothens tracking jitter
    filterBeta: 1000
  });
};

const setupLighting = (scene) => {
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xfff5e6, 1.5); 
  directionalLight.position.set(1, 4, 2);
  scene.add(directionalLight);
};

const loadBuildingModel = async () => {
  const building = await loadGLTF('../assets/models/menara/menara.gltf');
  
  building.scene.scale.set(0.1, 0.1, 0.1);
  building.scene.position.set(0, 0, 0);
  building.scene.rotation.set(0, 0, 0);
  
  return building.scene;
};

const openInfoCard = (id) => {
  const target = LOCAL_LABUAN_DATA[id];
  if (!target) return;

  document.getElementById('card-title').innerText = target.name;
  document.getElementById('card-meta').innerHTML = `
      🏛️ <b>Campus:</b> ${target.name}<br>
      ⏰ <b>Hours:</b> ${target.hours}<br>
      🎫 <b>Fee:</b> ${target.fee}<br>
      📞 <b>Inquiries:</b> ${target.contact}
  `;
  document.getElementById('card-folklore').innerText = target[currentLanguage].folklore;
  document.getElementById('info-card').style.display = 'block';
};

const stopAllAudio = () => {
  audioEN.pause(); audioEN.currentTime = 0;
  audioMS.pause(); audioMS.currentTime = 0;
  isAudioPlaying = false;
  document.getElementById('narrator-btn').innerHTML = `<span id="narrator-icon" style="color: #721c24;">📜</span> Audio Lore`;
};

// Global Execution Thread Loop
document.addEventListener('DOMContentLoaded', () => {

  // --- NATIVE UI INTERACTION HANDLERS ---
  document.getElementById('info-btn').addEventListener('click', () => {
    openInfoCard('umslic');
  });

  document.getElementById('close-card-btn').addEventListener('click', () => {
    document.getElementById('info-card').style.display = 'none';
  });

  document.getElementById('lang-select').addEventListener('change', (e) => {
    currentLanguage = e.target.value;
    stopAllAudio();
    if(document.getElementById('info-card').style.display === 'block') {
      openInfoCard('umslic');
    }
  });

  document.getElementById('narrator-btn').addEventListener('click', () => {
    const activeAudio = (currentLanguage === 'en') ? audioEN : audioMS;
    
    if (!isAudioPlaying) {
      activeAudio.play().catch(err => console.warn("Audio Context blocked until interaction:", err));
      isAudioPlaying = true;
      document.getElementById('narrator-btn').innerHTML = `<span id="narrator-icon" style="color: #721c24;">🛑</span> Stop Audio`;
      activeAudio.onended = () => stopAllAudio();
    } else {
      stopAllAudio();
    }
  });

  // --- DESKTOP MOUSE ROTATION LOGIC ---
  window.addEventListener('mousedown', (e) => {
    isDragging = true;
    previousMousePosition.x = e.clientX;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging || !buildingModelMesh) return;
    const deltaX = e.clientX - previousMousePosition.x;
    buildingModelMesh.rotation.y += deltaX * 0.01;
    previousMousePosition.x = e.clientX;
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // --- CORE APP INIT ENGINE ---
  const start = async () => {
    const mindarThree = initializeMindAR();
    const { renderer, scene, camera } = mindarThree;

    // Make WebGL canvas clear buffer completely transparent so background camera shows
    renderer.setClearColor(0x000000, 0); 

    // Start the camera first so browser permission is requested immediately.
    await mindarThree.start();

    setupLighting(scene);
    buildingModelMesh = await loadBuildingModel();
    
    // Target 0 references the initial compilation entry in your .mind dictionary compiled profile
    const anchor = mindarThree.addAnchor(0); 
    anchor.group.add(buildingModelMesh);

    // --- AUTOMATIC TOURIST UI TRIGGER EVENTS ---
    anchor.onTargetFound = () => {
      console.log("Marker Target matched successfully.");
      if (!automaticPopupTriggered) {
        setTimeout(() => {
          openInfoCard('umslic');
          automaticPopupTriggered = true; 
        }, 800); 
      }
    };

    anchor.onTargetLost = () => {
      console.log("Marker Target lost from camera visibility view.");
    };

    // Manual Raycaster tap logic
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('click', (event) => {
      if (event.target.closest('#ui-container') || event.target.closest('#info-card')) return;

      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(anchor.group.children, true);
      
      if (intersects.length > 0) {
        openInfoCard('umslic');
      }
    });
    
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });
  };

  start().catch((error) => {
    console.error('Labuan Legends AR startup error:', error);
    const message = error && error.message ? error.message : String(error);
    alert(`AR could not start. ${message}`);
  });
});