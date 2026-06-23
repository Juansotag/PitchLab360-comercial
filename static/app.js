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
document.getElementById('producto-select').addEventListener('change', e => {
  state.productoId = e.target.value;
});

// ─── CLICKS EN MÓDULOS DEL SIDEBAR ───────────────────────────────────────────
document.querySelectorAll('#sidebar-modules-view .module-card').forEach(card => {
  card.addEventListener('click', () => {
    const targetId = card.getAttribute('data-target');
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

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
    // Carga MediaPipe Holistic desde CDN (UMD bundle, se inyecta en el objeto global window)
    await import('https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/holistic.js');
    const HolisticClass = window.Holistic;
    if (!HolisticClass) {
      throw new Error('No se pudo encontrar Holistic en el objeto window global.');
    }
    const holistic = new HolisticClass({
      locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${file}`
    });
    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    holistic.onResults(procesarResultadosMediaPipe);
    state.holisticModel = holistic;

    const video = document.getElementById('video-preview');
    const canvas = document.getElementById('mediapipe-canvas');

    async function loop() {
      if (state.mediaStream) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
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

function procesarResultadosMediaPipe(results) {
  // Presencia y alineación en tiempo real (siempre disponible si la cámara está activa)
  const face = results.faceLandmarks;
  let presenciaText = 'No detectado';
  if (face && face[468] && face[473]) {
    const irisIzq = face[468];
    const irisDer = face[473];
    const promedioX = (irisIzq.x + irisDer.x) / 2;
    if (promedioX >= 0.4 && promedioX <= 0.6) {
      presenciaText = 'Centrado';
    } else if (promedioX < 0.4) {
      presenciaText = 'Desviado a la derecha';
    } else {
      presenciaText = 'Desviado a la izquierda';
    }
  }
  const elPresencia = document.getElementById('stat-presencia');
  if (elPresencia) {
    elPresencia.textContent = `Presencia: ${presenciaText}`;
  }

  if (!state.grabando) return;

  // Contacto visual: detectar si iris mira hacia la cámara
  let mirandoCamara = false;
  if (face && face[468] && face[473]) {
    const irisIzq = face[468];
    const irisDer = face[473];
    const promedioX = (irisIzq.x + irisDer.x) / 2;
    mirandoCamara = promedioX > 0.35 && promedioX < 0.65;
  }
  state.contactoFrames.push(mirandoCamara ? 1 : 0);

  // Postura: hombro izq y hombro der de pose
  const pose = results.poseLandmarks;
  if (pose && pose[11] && pose[12]) {
    const difY = Math.abs(pose[11].y - pose[12].y);
    const posturaFrame = difY < 0.05 ? 'abierta' : 'mixta';
    state.posturaFrames.push(posturaFrame);
  }

  // Gestos: detectar manos visibles
  const manos = results.leftHandLandmarks || results.rightHandLandmarks;
  state.gestosFrames.push(manos ? 'ilustrativos' : 'ninguno');

  // Actualizar stats en vivo
  actualizarStatsCamara();
}

function actualizarStatsCamara() {
  if (state.contactoFrames.length === 0) return;
  const cvPct = Math.round((state.contactoFrames.filter(v => v === 1).length / state.contactoFrames.length) * 100);
  const posturaMode = state.posturaFrames.filter(v => v === 'abierta').length > state.posturaFrames.length / 2 ? 'abierta' : 'mixta';
  
  document.getElementById('stat-cv').textContent = `Contacto visual: ${cvPct}%`;
  document.getElementById('stat-postura').textContent = `Postura: ${posturaMode}`;

  if (state.palabrasLive.length > 0) {
    const fillerCount = state.palabrasLive.filter(p => state.fillers.includes(p)).length;
    const fillersPct = (fillerCount / state.palabrasLive.length) * 100;
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
    const displaySliced = displayTexto.length > 500 ? '...' + displayTexto.slice(-500) : displayTexto;
    document.getElementById('transcripcion-live-texto').textContent = displaySliced;
    document.getElementById('transcripcion-live').style.display = 'block';
    
    state.textoLiveActual = displayTexto;
  };

  recognition.onerror = (e) => console.warn('Speech error:', e.error);
  
  recognition.onend = () => {
    if (state.grabando) {
      if (state.textoLiveActual && state.textoLiveActual.trim()) {
        state.transcripcionesPrevias = [state.textoLiveActual.trim()];
      }
      try {
        recognition.start();
      } catch (err) {
        console.warn('Speech restart error:', err);
      }
    }
  };
  
  recognition.start();
  state.recognition = recognition;
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
  document.getElementById('camera-stats').style.display = 'flex';
  document.getElementById('btn-grabar').disabled = true;
  document.getElementById('btn-detener').disabled = false;
  iniciarWebSpeech();
  showToast('Grabación iniciada. ¡Comienza a hablar!', 'info');
});

document.getElementById('btn-detener').addEventListener('click', () => {
  state.grabando = false;
  if (state.recognition) state.recognition.stop();
  finalizarMetricasNoVerbal();
  document.getElementById('btn-detener').disabled = true;
  document.getElementById('btn-evaluar').disabled = false;
  document.getElementById('btn-evaluar').textContent = 'Evaluar pitch';
  showToast('Grabación finalizada. Listo para evaluar.', 'success');
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

function actualizarBotonEvaluar() {
  document.getElementById('btn-evaluar').disabled = !state.textoAnalizar.trim();
}

// ─── EVALUAR ─────────────────────────────────────────────────────────────────
document.getElementById('btn-evaluar').addEventListener('click', async () => {
  const btn = document.getElementById('btn-evaluar');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Evaluando...';

  const payload = {
    texto: state.textoAnalizar,
    escenario: {
      medicamento_id: state.productoId,
      interlocutor_id: state.audiencia,
      reto: state.tieneVideo ? JSON.stringify(state.metricasNoVerbal) : 'Presentar el producto de forma efectiva'
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
    showToast('Evaluación completada con éxito.', 'success');
  } catch (err) {
    showToast('Error al evaluar: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-microscope"></i> Evaluar pitch';
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

  // Update status badges in the sidebar
  document.querySelectorAll('#sidebar-modules-view .module-card').forEach(card => {
    const target = card.getAttribute('data-target');
    const badge = card.querySelector('.status-badge');
    if (badge) {
      if (target === 'res-scorecard') {
        badge.textContent = sc.puntaje_total + '/100';
        badge.className = 'status-badge completed';
      } else {
        const dimId = target.replace('res-', '').toUpperCase(); // 'res-d1' -> 'D1'
        const score = sc.scores_por_dimension[dimId];
        if (score !== null && score !== undefined) {
          badge.textContent = score + '/5';
          badge.className = 'status-badge completed';
        } else {
          badge.textContent = 'N/A';
          badge.className = 'status-badge pending';
        }
      }
    }
  });
}

// ─── DEMO DATA LOAD ──────────────────────────────────────────────────────────
const btnLoadDemo = document.getElementById('btn-load-demo');
if (btnLoadDemo) {
  btnLoadDemo.addEventListener('click', async () => {
    try {
      const res = await fetch('/static/config/demo_data.json?v=' + Date.now());
      const demoData = await res.json();
      const { escenario = {}, ...data } = demoData;

      if (escenario.medicamento_id) document.getElementById('producto-select').value = escenario.medicamento_id;
      if (escenario.interlocutor_id) document.getElementById('audiencia-select').value = escenario.interlocutor_id;

      state.textoAnalizar = data.texto || "Buenos días. Quisiera presentarles Ejemplo XR...";
      state.tieneVideo = data.scorecard?.d3_disponible || false;
      if (state.tieneVideo) {
        state.metricasNoVerbal = data.D3_no_verbal?.metricas_raw || {
          contacto_visual_pct: 72,
          postura: "abierta",
          gestos: "ilustrativos",
          velocidad_ppm: 138,
          fillers_pct: 1.2,
          tiene_video: true
        };
      }

      renderResultados(demoData);
      document.getElementById('sec-resultados').style.display = 'block';
      document.getElementById('sec-resultados').scrollIntoView({ behavior: 'smooth' });
      showToast('Datos de prueba cargados correctamente.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al cargar datos de prueba.', 'error');
    }
  });
}
