const THREE = window.MINDAR.IMAGE.THREE;

let currentLanguage = 'en';
let isAudioPlaying = false;
let buildingModelMesh = null;
let automaticPopupTriggered = false; 

// Relative audio paths
const audioEN = new Audio('../assets/audio/mi-tomcruise.mp3');
const audioMS = new Audio('../assets/audio/musicband-background.mp3');

// Dragging and Touch rotation handlers
let isDragging = false;
let previousMousePosition = { x: 0 };

const initializeMindAR = () => {
  return new window.MINDAR.IMAGE.MindARThree({
    container: document.getElementById('ar-container'),
    imageTargetSrc: '../assets/targets/testBuilding.mind', 
  });
};

const setupLighting = (scene) => {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xfff5e6, 1.2); 
  directionalLight.position.set(1, 2, 1);
  scene.add(directionalLight);
};

// Safe asynchronous loader targeting CDN environments 
const loadBuildingModel = () => {
  return new Promise((resolve, reject) => {
    const LoaderClass = window.MINDAR.IMAGE.GLTFLoader || THREE.GLTFLoader;
    const loader = new LoaderClass();
    
    loader.load('../assets/models/testBuilding/testBuilding.gltf', (gltf) => {
      gltf.scene.scale.set(0.1, 0.1, 0.1);
      gltf.scene.position.set(0, 0, 0);
      gltf.scene.rotation.set(0, 0, 0);
      resolve(gltf.scene);
    }, undefined, (error) => {
      console.error("Path error or case-sensitivity conflict reading file:", error);
      reject(error);
    });
  });
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

document.addEventListener('DOMContentLoaded', () => {

  // UI Element Bindings
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
      activeAudio.play().catch(err => console.warn("Mobile autoplay gesture policy restriction block:", err));
      isAudioPlaying = true;
      document.getElementById('narrator-btn').innerHTML = `<span id="narrator-icon" style="color: #721c24;">🛑</span> Stop Audio`;
      activeAudio.onended = () => stopAllAudio();
    } else {
      stopAllAudio();
    }
  });

  // --- DESKTOP INTERACTION ---
  window.addEventListener('mousedown', (e) => { isDragging = true; previousMousePosition.x = e.clientX; });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging || !buildingModelMesh) return;
    const deltaX = e.clientX - previousMousePosition.x;
    buildingModelMesh.rotation.y += deltaX * 0.01;
    previousMousePosition.x = e.clientX;
  });
  window.addEventListener('mouseup', () => { isDragging = false; });

  // --- MOBILE TOUCH SCREEN INTERACTION ---
  window.addEventListener('touchstart', (e) => { isDragging = true; previousMousePosition.x = e.touches[0].clientX; });
  window.addEventListener('touchmove', (e) => {
    if (!isDragging || !buildingModelMesh) return;
    const deltaX = e.touches[0].clientX - previousMousePosition.x;
    buildingModelMesh.rotation.y += deltaX * 0.01;
    previousMousePosition.x = e.touches[0].clientX;
  });
  window.addEventListener('touchend', () => { isDragging = false; });

  // --- AR ENGINE INITIALIZATION LOOP ---
  const start = async () => {
    const mindarThree = initializeMindAR();
    const { renderer, scene, camera } = mindarThree;

    renderer.setClearColor(0x000000, 0); 
    setupLighting(scene);
    
    try {
        buildingModelMesh = await loadBuildingModel();
        const anchor = mindarThree.addAnchor(0); 
        anchor.group.add(buildingModelMesh);

        anchor.onTargetFound = () => {
          if (!automaticPopupTriggered) {
            setTimeout(() => {
              openInfoCard('chimney');
              automaticPopupTriggered = true; 
            }, 800); 
          }
        };
    } catch(e) {
        console.warn("Model loading timed out or failed. Continuing camera system deployment.");
    }

    // Launch mobile camera WebRTC system
    await mindarThree.start();
    
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });
  };

  start();
});