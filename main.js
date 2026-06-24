// Import necessary functions and objects
import { loadGLTF } from "/Labuan-Ar/libs/loader.js";
const THREE = window.MINDAR.IMAGE.THREE;

let currentLanguage = 'en';
let isAudioPlaying = false;
let buildingModelMesh = null;
let automaticPopupTriggered = false; 

// Instantiating standard HTML5 Audio components natively
const audioEN = new Audio('/Labuan-Ar/assets/audio/chimney_en.mp3');
const audioMS = new Audio('/Labuan-Ar/assets/audio/chimney_ms.mp3');

// Mouse Drag State Variables for Rotation Engine
let isDragging = false;
let previousMousePosition = { x: 0 };

const initializeMindAR = () => {
  return new window.MINDAR.IMAGE.MindARThree({
    container: document.getElementById('ar-container'),
    imageTargetSrc: '/Labuan-Ar/assets/targets/testBuilding.mind',
  });
};

const setupLighting = (scene) => {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xfff5e6, 1.2); 
  directionalLight.position.set(1, 2, 1);
  scene.add(directionalLight);
};

const loadBuildingModel = async () => {
  const building = await loadGLTF('/Labuan-Ar/assets/models/testBuilding/testBuilding.gltf');
  
  building.scene.scale.set(0.1, 0.1, 0.1);
  building.scene.position.set(0, 0, 0);
  building.scene.rotation.set(0, 0, 0);
  
  return building.scene;
};

const openInfoCard = (id) => {
  const target = window.LABUAN_DATA[id];
  if (!target) return;

  document.getElementById('card-title').innerText = target.name;
  document.getElementById('card-meta').innerHTML = `
      🏛️ <b>Monument:</b> ${target.name}<br>
      ⏰ <b>Hours:</b> ${target.hours} &nbsp;|&nbsp; 🎫 <b>Fee:</b> ${target.fee}<br>
      📞 <b>Inquiries:</b> ${target.contact}
  `;
  document.getElementById('card-folklore').innerText = target[currentLanguage].folklore;
  document.getElementById('info-card').style.display = 'block';
};

const stopAllAudio = () => {
  audioEN.pause(); audioEN.currentTime = 0;
  audioMS.pause(); audioMS.currentTime = 0;
  isAudioPlaying = false;
  document.getElementById('narrator-btn').innerHTML = `<span id="narrator-icon" style="color: #721c24;">📜</span> Listen to Lore`;
};

// Global Execution Thread Loop
document.addEventListener('DOMContentLoaded', () => {

  // --- NATIVE UI INTERACTION HANDLERS ---
  document.getElementById('close-card-btn').addEventListener('click', () => {
    document.getElementById('info-card').style.display = 'none';
  });

  document.getElementById('lang-select').addEventListener('change', (e) => {
    currentLanguage = e.target.value;
    stopAllAudio();
    if(document.getElementById('info-card').style.display === 'block') {
      openInfoCard('chimney');
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

    setupLighting(scene);
    buildingModelMesh = await loadBuildingModel();
    
    const anchor = mindarThree.addAnchor(0); 
    anchor.group.add(buildingModelMesh);

    // --- AUTOMATIC TOURIST UI TRIGGER EVENTS ---
    anchor.onTargetFound = () => {
      if (!automaticPopupTriggered) {
        setTimeout(() => {
          openInfoCard('chimney');
          automaticPopupTriggered = true; 
        }, 800); 
      }
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
        openInfoCard('chimney');
      }
    });

    // Fire camera stream and start tracking process
    await mindarThree.start();
    
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });
  };

  start();
});