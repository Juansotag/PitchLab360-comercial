// ─── PITCHMED360 · app.js ────────────────────────────────────────────────────

// Estado global
const state = {
  textoAnalizar: '',
  audiencia: 'paciente',
  productoId: 'demo',
  tieneVideo: false,
  grabando: false,
  metricasNoVerbal: {
    contacto_visual_pct: 0,
    postura: 'mixta',
    gestos: 'ninguno',
    velocidad_ppm: 0,
    fillers_pct: 0,
    tiene_video: false
  },
  mediaStream: null,
  recognition: null,
  transcripcionLive: '',
  textoLiveActual: '',
  transcripcionesPrevias: [],
  palabrasLive: [],
  fillers: ['eh', 'eeh', 'uhm', 'mm', 'mmm', 'este', 'osea', 'o sea', 'pues', 'bueno'],
  inicioGrabacion: null,
  holisticModel: null,
  contactoFrames: [],
  posturaFrames: [],
  gestosFrames: []
};

// ─── TOAST HELPER ────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const icons = { success: 'circle-check', error: 'circle-xmark', warning: 'triangle-exclamation', info: 'circle-info' };
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid fa-${icons[type] || 'circle-info'}"></i> ${msg}`;
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
  setTimeout(() => { 
    toast.classList.remove('show'); 
    setTimeout(() => toast.remove(), 400); 
  }, duration);
}

// ─── TABS ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    actualizarBotonEvaluar();
  });
});

// ─── SELECTORES DE CONFIG ────────────────────────────────────────────────────
document.getElementById('audiencia-select').addEventListener('change', e => {
  state.audiencia = e.target.value;
});
document.getElementById('producto-nombre').addEventListener('input', e => {
  state.productoId = e.target.value.trim() || 'demo';
});

// ─── RESET / NUEVO PITCH ─────────────────────────────────────────────────────
document.getElementById('btn-reset').addEventListener('click', () => {
  // Resetear texto
  state.textoAnalizar = '';
  state.textoLiveActual = '';
  state.transcripcionLive = '';
  state.transcripcionesPrevias = [];
  state.palabrasLive = [];
  state.tieneVideo = false;
  state.metricasNoVerbal = { contacto_visual_pct: 0, postura: 'mixta', gestos: 'ninguno', velocidad_ppm: 0, fillers_pct: 0, tiene_video: false };
  
  // Resetear UI
  const liveTextEl = document.getElementById('transcripcion-live-texto');
  if (liveTextEl) { liveTextEl.value = ''; liveTextEl.readOnly = true; }
  document.getElementById('transcripcion-live').style.display = 'none';
  const prevEl = document.getElementById('transcripcion-preview');
  if (prevEl) prevEl.style.display = 'none';
  document.getElementById('texto-directo').value = '';
  document.getElementById('upload-label-text').textContent = 'Arrastra o selecciona audio/video (.mp3, .mp4, .wav, .webm)';
  document.getElementById('pitch-file').value = '';
  const fichaEl = document.getElementById('ficha-custom');
  if (fichaEl) fichaEl.value = '';
  const nombreEl = document.getElementById('producto-nombre');
  if (nombreEl) nombreEl.value = '';
  document.getElementById('sec-resultados').style.display = 'none';
  document.getElementById('resultados-container').innerHTML = '';
  document.getElementById('btn-evaluar').disabled = true;
  document.getElementById('btn-reset').style.display = 'none';
  document.getElementById('btn-grabar').disabled = true;
  document.getElementById('btn-detener').disabled = true;
  document.getElementById('btn-grabar').disabled = !!state.mediaStream === false;
  
  // Scroll arriba
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('Pitch restablecido. Listo para un nuevo intento.', 'info');
});

// ─── CLICKS EN BOTONES DE CORRECCIÓN CON IA ─────────────────────────────────
async function corregirConIA() {
  if (!state.textoAnalizar || !state.textoAnalizar.trim()) {
    showToast('No hay texto para corregir.', 'warning');
    return;
  }
  
  const btnLive = document.getElementById('btn-corregir-ia-live');
  const btnFile = document.getElementById('btn-corregir-ia-file');
  const btnText = document.getElementById('btn-corregir-ia-text');
  
  const setHtmlLoading = (btn) => {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Corrigiendo...';
    }
  };
  
  const restoreHtml = (btn) => {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Corregir con IA';
    }
  };
  
  setHtmlLoading(btnLive);
  setHtmlLoading(btnFile);
  setHtmlLoading(btnText);
  
  try {
    const res = await fetch('/limpiar-texto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: state.textoAnalizar })
    });
    const data = await res.json();
    if (data.texto_limpio) {
      state.textoAnalizar = data.texto_limpio;
      
      // Actualizar los campos visuales
      document.getElementById('texto-directo').value = data.texto_limpio;
      
      const liveTextEl = document.getElementById('transcripcion-live-texto');
      if (liveTextEl) {
        liveTextEl.value = data.texto_limpio;
      }
      
      const fileTextEl = document.getElementById('transcripcion-texto');
      if (fileTextEl) {
        fileTextEl.textContent = data.texto_limpio.substring(0, 400) + (data.texto_limpio.length > 400 ? '…' : '');
      }
      
      showToast('Texto corregido con IA con éxito.', 'success');
    } else {
      showToast('Error de IA: ' + (data.error || 'Fallo al procesar'), 'error');
    }
  } catch (err) {
    showToast('Error de conexión: ' + err.message, 'error');
  } finally {
    restoreHtml(btnLive);
    restoreHtml(btnFile);
    restoreHtml(btnText);
  }
}

document.getElementById('btn-corregir-ia-live').addEventListener('click', corregirConIA);
document.getElementById('btn-corregir-ia-file').addEventListener('click', corregirConIA);
document.getElementById('btn-corregir-ia-text').addEventListener('click', corregirConIA);

// ─── MÓDULO: CÁMARA + MEDIAPIPE + WEB SPEECH ─────────────────────────────────

async function iniciarCamara() {
  try {
    state.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const video = document.getElementById('video-preview');
    video.srcObject = state.mediaStream;
    document.getElementById('camera-overlay').style.display = 'none';
    document.getElementById('btn-grabar').disabled = false;
    document.getElementById('btn-iniciar-camara').disabled = true;
    state.tieneVideo = true;
    showToast('Cámara iniciada con éxito. Cargando MediaPipe...', 'info');
    await iniciarMediaPipe();
  } catch (err) {
    showToast('No se pudo acceder a la cámara: ' + err.message, 'error');
  }
}

async function iniciarMediaPipe() {
  try {
    await import('https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/holistic.js');
    const HolisticClass = window.Holistic;
    if (!HolisticClass) throw new Error('No se pudo encontrar Holistic en el objeto window global.');

    const holistic = new HolisticClass({
      locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${file}`
    });
    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      refineFaceLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    holistic.onResults(procesarResultadosMediaPipe);
    state.holisticModel = holistic;

    const video  = document.getElementById('video-preview');
    const canvas = document.getElementById('mediapipe-canvas');

    // Sólo actualizamos las dimensiones del canvas cuando cambian —
    // asignar canvas.width/height siempre borra el contenido (causa parpadeo).
    async function loop() {
      if (state.mediaStream && video.videoWidth > 0) {
        if (canvas.width  !== video.videoWidth)  canvas.width  = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        await holistic.send({ image: video });
      }
      requestAnimationFrame(loop);
    }
    loop();
    document.getElementById('camera-stats').style.display = 'flex';
    showToast('MediaPipe Holistic cargado y listo.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error al cargar MediaPipe: ' + err.message, 'error');
  }
}

// ─── CONEXIONES DEL ESQUELETO (BlazePose — sin dedos-fantasma) ────────────────
// Nota: se omiten los "dedos" 17-22 (pinky/index/thumb landmarks) que
// provocan el efecto de "tres dedos" saliendo de la muñeca.
const POSE_CONNECTIONS = [
  // Cara — solo la línea de boca y orejas a hombros (limpio)
  [9, 10],            // boca izq → boca der
  [11, 9], [12, 10],  // hombro → oreja
  // Columna / torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Brazo izquierdo: hombro → codo → muñeca
  [11, 13], [13, 15],
  // Brazo derecho:  hombro → codo → muñeca
  [12, 14], [14, 16],
  // Pierna izquierda: cadera → rodilla → tobillo → talón → pie
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // Pierna derecha
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32]
];

// Landmarks a dibujar como puntos (sin los dedos 17-22)
const POSE_LANDMARK_GROUPS = [
  // Articulaciones principales (más grandes)
  { indices: [11, 12, 23, 24], radio: 7, fill: '#ffffff', stroke: '#1B3A6B', strokeW: 2 },
  // Codos, muñecas, rodillas, tobillos
  { indices: [13, 14, 15, 16, 25, 26, 27, 28], radio: 5, fill: '#e2e8f0', stroke: '#1B3A6B', strokeW: 1.5 },
  // Talones y puntas de pie
  { indices: [29, 30, 31, 32], radio: 4, fill: '#94a3b8', stroke: '#1B3A6B', strokeW: 1 },
  // Orejas y boca
  { indices: [9, 10], radio: 4, fill: '#cbd5e1', stroke: '#1B3A6B', strokeW: 1 }
];

function dibujarEsqueleto(ctx, pose, canvas) {
  if (!pose || pose.length === 0) return;

  // 1. Conexiones — degradado de blanco semitransparente sobre el video
  ctx.save();
  POSE_CONNECTIONS.forEach(([a, b]) => {
    const ptA = pose[a], ptB = pose[b];
    if (!ptA || !ptB) return;
    if ((ptA.visibility ?? 1) < 0.35 || (ptB.visibility ?? 1) < 0.35) return;

    // Gradiente azul-blanco a lo largo de cada hueso
    const grd = ctx.createLinearGradient(
      ptA.x * canvas.width, ptA.y * canvas.height,
      ptB.x * canvas.width, ptB.y * canvas.height
    );
    grd.addColorStop(0,   'rgba(255,255,255,0.75)');
    grd.addColorStop(0.5, 'rgba(180,210,255,0.65)');
    grd.addColorStop(1,   'rgba(255,255,255,0.75)');

    ctx.beginPath();
    ctx.moveTo(ptA.x * canvas.width, ptA.y * canvas.height);
    ctx.lineTo(ptB.x * canvas.width, ptB.y * canvas.height);
    ctx.strokeStyle = grd;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.stroke();
  });
  ctx.restore();

  // 2. Articulaciones por grupo
  POSE_LANDMARK_GROUPS.forEach(({ indices, radio, fill, stroke, strokeW }) => {
    indices.forEach(i => {
      const pt = pose[i];
      if (!pt) return;
      if ((pt.visibility ?? 1) < 0.35) return;
      ctx.beginPath();
      ctx.arc(pt.x * canvas.width, pt.y * canvas.height, radio, 0, 2 * Math.PI);
      ctx.fillStyle   = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = strokeW;
      ctx.stroke();
    });
  });
}

function analizarPostura(pose) {
  if (!pose) return { resultado: 'sin_datos', label: 'Sin datos', score: 0 };

  const ombroIzq = pose[11], ombroDer = pose[12];
  const caderaIzq = pose[23], caderaDer = pose[24];
  const nariz    = pose[0];

  let score = 0;
  const detalles = [];

  // 1. Hombros alineados horizontalmente (diferencia Y < 0.04)
  if (ombroIzq && ombroDer) {
    const difHombros = Math.abs(ombroIzq.y - ombroDer.y);
    if (difHombros < 0.04) { score += 2; detalles.push('hombros_ok'); }
    else if (difHombros < 0.08) { score += 1; detalles.push('hombros_leve'); }
    else { detalles.push('hombros_mal'); }
  }

  // 2. Caderas alineadas (diferencia Y < 0.05)
  if (caderaIzq && caderaDer) {
    const difCaderas = Math.abs(caderaIzq.y - caderaDer.y);
    if (difCaderas < 0.05) { score += 1; detalles.push('caderas_ok'); }
    else { detalles.push('caderas_mal'); }
  }

  // 3. Columna vertical: nariz centrada entre hombros en X
  if (ombroIzq && ombroDer && nariz) {
    const centroHombros = (ombroIzq.x + ombroDer.x) / 2;
    const desvCol = Math.abs(nariz.x - centroHombros);
    if (desvCol < 0.07) { score += 1; detalles.push('columna_ok'); }
    else { detalles.push('columna_mal'); }
  }

  // 4. Hombros visibles y abiertos (ancho suficiente)
  if (ombroIzq && ombroDer) {
    const anchoHombros = Math.abs(ombroIzq.x - ombroDer.x);
    if (anchoHombros > 0.25) { score += 1; detalles.push('amplitud_ok'); }
    else { detalles.push('amplitud_mal'); }
  }

  if (score >= 4) return { resultado: 'abierta', label: 'Abierta', score };
  if (score >= 2) return { resultado: 'mixta',   label: 'Mixta',   score };
  return            { resultado: 'cerrada',  label: 'Cerrada', score };
}

function procesarResultadosMediaPipe(results) {
  const face = results.faceLandmarks;
  const pose = results.poseLandmarks;
  const canvas = document.getElementById('mediapipe-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ── 1. ESQUELETO COMPLETO ────────────────────────────────────────────────────
  dibujarEsqueleto(ctx, pose, canvas);

  // ── 2. ANÁLISIS DE POSTURA ───────────────────────────────────────────────────
  const posturaInfo = analizarPostura(pose);

  // ── 3. CONTACTO VISUAL (iris + orientación de cabeza) ────────────────────────
  let presenciaText = 'No detectado';
  let mirandoCamara = false;

  if (face && face[468] && face[473]) {
    const irisIzq = face[468];
    const irisDer = face[473];
    const promedioX = (irisIzq.x + irisDer.x) / 2;

    if (promedioX >= 0.4 && promedioX <= 0.6) presenciaText = 'Centrado';
    else if (promedioX < 0.4) presenciaText = 'Desviado derecha';
    else presenciaText = 'Desviado izquierda';

    if (face[33] && face[133] && face[362] && face[263] && face[4]) {
      const leftEyeMinX  = Math.min(face[33].x, face[133].x);
      const leftEyeMaxX  = Math.max(face[33].x, face[133].x);
      const rightEyeMinX = Math.min(face[362].x, face[263].x);
      const rightEyeMaxX = Math.max(face[362].x, face[263].x);

      let eyeRatioCentrado = false;
      if (leftEyeMaxX > leftEyeMinX && rightEyeMaxX > rightEyeMinX) {
        const relLeftX  = (face[468].x - leftEyeMinX)  / (leftEyeMaxX  - leftEyeMinX);
        const relRightX = (face[473].x - rightEyeMinX) / (rightEyeMaxX - rightEyeMinX);
        eyeRatioCentrado = relLeftX >= 0.22 && relLeftX <= 0.78 && relRightX >= 0.22 && relRightX <= 0.78;
      } else {
        eyeRatioCentrado = promedioX > 0.35 && promedioX < 0.65;
      }

      // Yaw de la cabeza (tabique nasal vs esquinas de ojos)
      const distIzq = Math.abs(face[4].x - face[33].x);
      const distDer = Math.abs(face[4].x - face[263].x);
      const headYaw = distIzq / (distIzq + distDer);
      const headOk  = headYaw >= 0.35 && headYaw <= 0.65;

      mirandoCamara = headOk && eyeRatioCentrado;
    } else {
      mirandoCamara = promedioX > 0.35 && promedioX < 0.65;
    }
  }

  // ── 4. DIBUJO DE OJOS E IRIS ─────────────────────────────────────────────────
  if (face) {
    const eyeColor  = mirandoCamara ? '#16a34a' : '#d51437';
    const eyeFill   = mirandoCamara ? 'rgba(22,163,74,0.4)' : 'rgba(213,20,55,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeStyle = eyeColor;
    ctx.fillStyle   = eyeFill;

    [[face[33], face[133]], [face[362], face[263]]].forEach(eye => {
      eye.forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      });
    });

    if (face[468] && face[473]) {
      ctx.fillStyle = '#f8a719';
      [face[468], face[473]].forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 3.5, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  }

  // ── 5. HUD PANEL (esquina superior izquierda) ────────────────────────────────
  const hudW = 210, hudH = face ? 90 : 44;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(ctx, 10, 10, hudW, hudH, 8);
  ctx.fill();

  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillStyle = '#e5e7eb';
  ctx.fillText(`Presencia: ${presenciaText}`, 20, 31);

  if (face) {
    ctx.fillStyle = mirandoCamara ? '#4ade80' : '#f87171';
    ctx.fillText(`Visual: ${mirandoCamara ? 'CONECTADO ●' : 'NO CONECTADO ○'}`, 20, 51);

    const posturaCol = posturaInfo.resultado === 'abierta' ? '#4ade80'
                     : posturaInfo.resultado === 'mixta'   ? '#facc15' : '#f87171';
    ctx.fillStyle = posturaCol;
    ctx.fillText(`Postura: ${posturaInfo.label}  (${posturaInfo.score}/5)`, 20, 71);
  } else {
    ctx.fillStyle = '#f87171';
    ctx.fillText('Rostro no detectado', 20, 30);
  }

  // ── Indicador de pose detectada ──────────────────────────────────────────────
  if (pose) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, 10, hudH + 20, 140, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#93c5fd';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('Cuerpo detectado ✓', 18, hudH + 38);
  }

  // ── 6. ACTUALIZAR PILLS STATS en vivo ────────────────────────────────────────
  const elPresencia = document.getElementById('stat-presencia');
  if (elPresencia) elPresencia.textContent = `Presencia: ${presenciaText}`;

  if (!state.grabando) return;

  state.contactoFrames.push(mirandoCamara ? 1 : 0);

  if (pose && pose[11] && pose[12]) {
    state.posturaFrames.push(posturaInfo.resultado);
  }

  const manos = results.leftHandLandmarks || results.rightHandLandmarks;
  state.gestosFrames.push(manos ? 'ilustrativos' : 'ninguno');

  actualizarStatsCamara();
}

// Helper: dibuja un rectángulo con bordes redondeados
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function actualizarStatsCamara() {
  if (state.contactoFrames.length === 0) return;
  const cvPct = Math.round((state.contactoFrames.filter(v => v === 1).length / state.contactoFrames.length) * 100);

  const posturaCounts = state.posturaFrames.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
  const posturaMode = Object.entries(posturaCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixta';
  const posturaLabel = posturaMode === 'abierta' ? 'Abierta' : posturaMode === 'cerrada' ? 'Cerrada' : 'Mixta';

  document.getElementById('stat-cv').textContent      = `Contacto visual: ${cvPct}%`;
  document.getElementById('stat-postura').textContent = `Postura: ${posturaLabel}`;

  if (state.palabrasLive.length > 0) {
    const fillerCount = state.palabrasLive.filter(p => state.fillers.includes(p)).length;
    const fillersPct  = (fillerCount / state.palabrasLive.length) * 100;
    document.getElementById('stat-fillers').textContent = `Fillers: ${fillersPct.toFixed(1)}%`;
  }

  if (state.palabrasLive.length > 0 && state.inicioGrabacion) {
    const seg = (Date.now() - state.inicioGrabacion) / 1000;
    const ppm = Math.round((state.palabrasLive.length / seg) * 60);
    document.getElementById('stat-ppm').textContent = `${ppm} ppm`;
  }
}




function iniciarWebSpeech() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Web Speech API no disponible en este browser.', 'warning');
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'es-CO';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let finalDeEstaSesion = '';
    let parcialDeEstaSesion = '';
    
    for (let i = 0; i < event.results.length; i++) {
      const texto = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalDeEstaSesion += texto + ' ';
      } else {
        parcialDeEstaSesion += texto;
      }
    }
    
    const textoCompleto = (state.transcripcionesPrevias.join(' ') + ' ' + finalDeEstaSesion).trim();
    state.palabrasLive = textoCompleto.toLowerCase().split(/\s+/).filter(Boolean);
    
    const displayTexto = (textoCompleto + ' ' + parcialDeEstaSesion).trim();
    const liveTextEl = document.getElementById('transcripcion-live-texto');
    if (liveTextEl) {
      liveTextEl.value = displayTexto;
      liveTextEl.scrollTop = liveTextEl.scrollHeight;
    }
    document.getElementById('transcripcion-live').style.display = 'block';
    
    state.textoLiveActual = displayTexto;
  };

  recognition.onerror = (e) => console.warn('Speech error:', e.error);
  
  recognition.onend = () => {
    if (state.grabando) {
      if (state.textoLiveActual && state.textoLiveActual.trim()) {
        state.transcripcionesPrevias = [state.textoLiveActual.trim()];
      }
      setTimeout(() => {
        if (state.grabando) {
          iniciarWebSpeech();
        }
      }, 200);
    }
  };
  
  try {
    recognition.start();
    state.recognition = recognition;
  } catch (err) {
    console.warn('Speech start error:', err);
  }
}

function finalizarMetricasNoVerbal() {
  const cvPct = state.contactoFrames.length > 0
    ? (state.contactoFrames.filter(v => v === 1).length / state.contactoFrames.length) * 100
    : 0;

  const posturaMode = state.posturaFrames.filter(v => v === 'abierta').length > state.posturaFrames.length / 2
    ? 'abierta' : 'mixta';

  const gestosMode = state.gestosFrames.filter(v => v === 'ilustrativos').length > state.gestosFrames.length * 0.3
    ? 'ilustrativos' : 'ninguno';

  const seg = (Date.now() - state.inicioGrabacion) / 1000;
  const ppm = seg > 0 ? (state.palabrasLive.length / seg) * 60 : 0;

  const fillerCount = state.palabrasLive.filter(p => state.fillers.includes(p)).length;
  const fillersPct = state.palabrasLive.length > 0 ? (fillerCount / state.palabrasLive.length) * 100 : 0;

  state.metricasNoVerbal = {
    contacto_visual_pct: Math.round(cvPct),
    postura: posturaMode,
    gestos: gestosMode,
    velocidad_ppm: Math.round(ppm),
    fillers_pct: Math.round(fillersPct * 10) / 10,
    tiene_video: true
  };
  
  const liveTextEl = document.getElementById('transcripcion-live-texto');
  if (liveTextEl) {
    state.textoLiveActual = liveTextEl.value;
  }
  state.textoAnalizar = (state.textoLiveActual || '').trim();
}

// ─── CONTROLES DE GRABACIÓN ──────────────────────────────────────────────────
document.getElementById('btn-iniciar-camara').addEventListener('click', iniciarCamara);

document.getElementById('btn-grabar').addEventListener('click', () => {
  state.grabando = true;
  state.inicioGrabacion = Date.now();
  state.contactoFrames = [];
  state.posturaFrames = [];
  state.gestosFrames = [];
  state.transcripcionLive = '';
  state.textoLiveActual = '';
  state.transcripcionesPrevias = [];
  state.palabrasLive = [];
  
  const liveTextEl = document.getElementById('transcripcion-live-texto');
  if (liveTextEl) {
    liveTextEl.readOnly = true;
    liveTextEl.value = '';
  }
  
  document.getElementById('camera-stats').style.display = 'flex';
  document.getElementById('btn-grabar').disabled = true;
  document.getElementById('btn-detener').disabled = false;
  iniciarWebSpeech();
  showToast('Grabación iniciada. ¡Comienza a hablar!', 'info');
});

document.getElementById('btn-detener').addEventListener('click', () => {
  state.grabando = false;
  if (state.recognition) state.recognition.stop();
  
  const liveTextEl = document.getElementById('transcripcion-live-texto');
  if (liveTextEl) {
    liveTextEl.readOnly = false;
  }
  
  finalizarMetricasNoVerbal();
  state.tieneVideo = true; // Mantener D3 disponible para re-evaluaciones
  
  document.getElementById('btn-detener').disabled = true;
  document.getElementById('btn-evaluar').disabled = false;
  document.getElementById('btn-evaluar').innerHTML = '<i class="fa-solid fa-microscope"></i> Analizar pitch';
  showToast('Grabación finalizada. Puedes editar el texto y analizarlo.', 'success');
});

// ─── MÓDULO: SUBIR ARCHIVO ───────────────────────────────────────────────────
document.querySelector('.upload-label').addEventListener('click', () => {
  document.getElementById('pitch-file').click();
});

document.getElementById('pitch-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const label = document.getElementById('upload-label-text');
  label.textContent = `Transcribiendo "${file.name}"…`;
  document.getElementById('btn-evaluar').disabled = true;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('audiencia', state.audiencia);
  formData.append('producto_id', state.productoId);

  try {
    const res = await fetch('/transcribir', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.transcripcion) {
      state.textoAnalizar = data.transcripcion.texto;
      state.tieneVideo = false;
      state.metricasNoVerbal = { tiene_video: false };

      document.getElementById('transcripcion-texto').textContent =
        state.textoAnalizar.substring(0, 400) + (state.textoAnalizar.length > 400 ? '…' : '');
      document.getElementById('transcripcion-meta').textContent =
        `Duración: ${data.transcripcion.duracion_seg}s · Palabras: ${state.textoAnalizar.split(/\s+/).length}`;
      document.getElementById('transcripcion-preview').style.display = 'block';
      label.textContent = `✓ ${file.name} transcrito`;
      document.getElementById('btn-evaluar').disabled = false;
      showToast('Archivo transcrito correctamente.', 'success');
    } else {
      label.textContent = `Error: ${data.detail || 'Fallo en la transcripción'}`;
      showToast('Error en transcripción', 'error');
    }
  } catch (err) {
    label.textContent = `Error: ${err.message}`;
    showToast('Error de conexión', 'error');
  }
});

// ─── MÓDULO: TEXTO DIRECTO ───────────────────────────────────────────────────
document.getElementById('texto-directo').addEventListener('input', (e) => {
  state.textoAnalizar = e.target.value;
  state.tieneVideo = false;
  state.metricasNoVerbal = { tiene_video: false };
  actualizarBotonEvaluar();
});

// Sincronizar edición manual de la transcripción en vivo
document.getElementById('transcripcion-live-texto').addEventListener('input', (e) => {
  state.textoLiveActual = e.target.value;
  state.textoAnalizar = e.target.value;
  actualizarBotonEvaluar();
});


function actualizarBotonEvaluar() {
  document.getElementById('btn-evaluar').disabled = !state.textoAnalizar.trim();
}

// ─── EVALUAR ─────────────────────────────────────────────────────────────────
document.getElementById('btn-evaluar').addEventListener('click', async () => {
  const btn = document.getElementById('btn-evaluar');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analizando...';

  // Leer contexto personalizado del formulario
  const fichaCustomEl = document.getElementById('ficha-custom');
  const productoNombreEl = document.getElementById('producto-nombre');
  const fichaCustom = fichaCustomEl ? fichaCustomEl.value.trim() : '';
  const nombreProducto = productoNombreEl ? productoNombreEl.value.trim() : '';

  const payload = {
    texto: state.textoAnalizar,
    escenario: {
      medicamento_id: nombreProducto || state.productoId || 'demo',
      interlocutor_id: state.audiencia,
      reto: state.tieneVideo ? JSON.stringify(state.metricasNoVerbal) : 'Presentar el producto de forma efectiva',
      ficha_custom: fichaCustom || null
    }
  };

  try {
    const res = await fetch('/analizar/pitchmed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    renderResultados(data);
    document.getElementById('sec-resultados').style.display = 'block';
    document.getElementById('sec-resultados').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('btn-reset').style.display = 'inline-flex';
    showToast('Analisis completado.', 'success');
  } catch (err) {
    showToast('Error al analizar: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-microscope"></i> Analizar pitch';
  }
});

// ─── RENDER DE RESULTADOS ────────────────────────────────────────────────────
function renderResultados(data) {
  const sc = data.scorecard;
  const container = document.getElementById('resultados-container');

  const colorBanda = {
    'Destacado': '#1A7A4A',
    'Competente': '#B8860B',
    'En desarrollo': '#CC5500',
    'Insuficiente': '#CC0000'
  };

  const nombresDims = {
    D1: 'Precisión científica',
    D2: 'Claridad y lenguaje',
    D3: 'Comunicación no verbal',
    D4: 'Cumplimiento INVIMA',
    D5: 'Estructura narrativa'
  };

  const modulos = {
    D1: data.D1_evidencia_cientifica?.data,
    D2: data.D2_claridad_lenguaje?.data,
    D3: data.D3_no_verbal,
    D4: data.D4_cumplimiento_regulatorio?.data,
    D5: data.D5_estructura_narrativa?.data
  };

  let html = `
    <div class="scorecard-header" id="res-scorecard" style="border-left: 4px solid ${colorBanda[sc.banda] || '#888'}">
      <div class="scorecard-puntaje">${sc.puntaje_total}<span>/100</span></div>
      <div class="scorecard-banda" style="color: ${colorBanda[sc.banda] || '#888'}">${sc.banda}</div>
      <div class="scorecard-audiencia">Audiencia: ${sc.audiencia === 'paciente' ? 'Paciente' : 'Institución'}</div>
      ${!sc.d3_disponible ? '<div class="scorecard-nota">Atención: D3 no evaluado — grabación sin cámara</div>' : ''}
    </div>

    <div class="scorecard-transcription" style="margin-top: -0.5rem; margin-bottom: 1.5rem; padding: 1.25rem 1.5rem; background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; font-size: 0.9rem;">
      <h3 style="font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--c-blue-dark); margin-bottom: 0.5rem; font-family: var(--font-display); font-weight: normal; font-style: italic;">Texto del Pitch Evaluado</h3>
      <p style="color: #374151; font-style: italic; line-height: 1.6; max-height: 150px; overflow-y: auto; padding-right: 0.5rem;">"${state.textoAnalizar}"</p>
    </div>

    <div class="dims-grid">
  `;

  for (const [dimId, modData] of Object.entries(modulos)) {
    const score = sc.scores_por_dimension[dimId];
    const disponible = score !== null && score !== undefined;
    const scoreDisplay = disponible ? score : 'N/A';
    const barPct = disponible ? (score / 5) * 100 : 0;

    let detalles = '';
    if (dimId === 'D3' && modData && modData.disponible) {
      detalles = (modData.observaciones || []).map(o => `<li>${o}</li>`).join('');
    } else if (modData) {
      if (modData.fortaleza) detalles += `<li><strong>Fortaleza:</strong> ${modData.fortaleza}</li>`;
      if (modData.mejora)    detalles += `<li><strong>Mejora:</strong> ${modData.mejora}</li>`;
    }

    html += `
      <div class="dim-card" id="res-${dimId.toLowerCase()}">
        <div class="dim-header">
          <span class="dim-id">${dimId}</span>
          <span class="dim-nombre">${nombresDims[dimId]}</span>
          <span class="dim-score">${scoreDisplay}${disponible ? '/5' : ''}</span>
        </div>
        <div class="dim-bar">
          <div class="dim-bar-fill" style="width: ${barPct}%"></div>
        </div>
        ${detalles ? `<ul class="dim-detalles">${detalles}</ul>` : ''}
      </div>
    `;
  }

  html += `</div>`;
  container.innerHTML = html;
}

// ─── DEMO DATA LOAD ──────────────────────────────────────────────────────────
const btnLoadDemo = document.getElementById('btn-load-demo');
if (btnLoadDemo) {
  btnLoadDemo.addEventListener('click', async () => {
    try {
      const res = await fetch('/static/config/demo_data.json?v=' + Date.now());
      const demoData = await res.json();
      const { escenario = {}, texto = '', D3_no_verbal = null, ...rest } = demoData;

      // Poblar campos de configuración
      if (escenario.interlocutor_id) {
        document.getElementById('audiencia-select').value = escenario.interlocutor_id;
        state.audiencia = escenario.interlocutor_id;
      }
      if (escenario.medicamento_id) {
        const nombreEl = document.getElementById('producto-nombre');
        if (nombreEl) nombreEl.value = escenario.medicamento_id;
        state.productoId = escenario.medicamento_id;
      }

      // Poblar el textarea de contexto del producto con la ficha demo
      const fichaEl = document.getElementById('ficha-custom');
      if (fichaEl) {
        fichaEl.value = [
          'Producto: ' + (escenario.medicamento_id || ''),
          'Indicación aprobada INVIMA: Dislipidemia mixta e hipercolesterolemia primaria en pacientes de alto riesgo cardiovascular con LDL > 130 mg/dL.',
          'Dosis: 40 mg/día oral. Ajuste a 80 mg si LDL no alcanza meta en 3 meses.',
          'Contraindicaciones: Insuficiencia hepática activa, embarazo, lactancia.',
          'Efectos adversos relevantes: Miopatía (<0.1% a 40mg), elevación de transaminasas (monitoreo hepático a 3 meses).',
          'Evidencia clave: Estudio PLANET-HPS 2021 (n=12.412, 4.8 años) — reducción 18% en MACE vs. genérico equivalente (Annals of Internal Medicine).',
          'Costo hospitalización SCA en Colombia: 18–22 M COP (Ministerio de Salud 2023).',
          'Diferencial mensual vs. genérico: aprox. 34.000 COP.'
        ].join('\n');
      }

      // Estado de texto y D3
      state.textoAnalizar = texto || 'Buenos días...';
      const d3Disponible = demoData.scorecard?.d3_disponible || false;
      state.tieneVideo = d3Disponible;
      if (d3Disponible && D3_no_verbal?.metricas_raw) {
        state.metricasNoVerbal = D3_no_verbal.metricas_raw;
      }

      // Actualizar textarea de transcripción live para que muestre el texto demo
      const liveTextEl = document.getElementById('transcripcion-live-texto');
      if (liveTextEl) {
        liveTextEl.value = texto;
        liveTextEl.readOnly = false;
        document.getElementById('transcripcion-live').style.display = 'block';
      }
      document.getElementById('btn-evaluar').disabled = false;

      renderResultados(demoData);
      document.getElementById('sec-resultados').style.display = 'block';
      document.getElementById('btn-reset').style.display = 'inline-flex';
      document.getElementById('sec-resultados').scrollIntoView({ behavior: 'smooth' });
      showToast('Demo cargado — puedes editar el texto y el contexto antes de analizar.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al cargar datos de prueba.', 'error');
    }
  });
}
