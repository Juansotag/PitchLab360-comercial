document.addEventListener('DOMContentLoaded', () => {

    /* --- GLOBALS --- */
    const discourseText = document.getElementById('discourse-text');

    /* --- AUDIO: STT GLOBALS --- */
    const btnMic = document.getElementById('btn-mic');
    let isRecording = false;
    let recognition = null;

    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.interimResults = true;
        recognition.continuous = false;

        recognition.onstart = () => {
            isRecording = true;
            btnMic.style.backgroundColor = '#fee2e2'; 
            btnMic.style.color = '#dc2626'; 
            btnMic.style.borderColor = '#dc2626';
            btnMic.innerHTML = '<i class="fa-solid fa-microphone-lines fa-beat"></i>';
        };

        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            discourseText.value = transcript;
            discourseText.dispatchEvent(new Event('input'));
        };

        recognition.onend = () => {
            isRecording = false;
            btnMic.style.backgroundColor = '';
            btnMic.style.color = '';
            btnMic.style.borderColor = '';
            btnMic.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        };

        recognition.onerror = (e) => {
            console.error('Speech recognition error', e.error);
            showToast('Error en el micrófono: ' + e.error, 'error');
            isRecording = false;
            btnMic.style.backgroundColor = '';
            btnMic.style.color = '';
            btnMic.style.borderColor = '';
            btnMic.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        };
    } else {
        if(btnMic) {
            btnMic.disabled = true;
            btnMic.title = "Tu navegador no soporta dictado por voz";
        }
    }

    if (btnMic) {
        btnMic.addEventListener('click', () => {
            if (!recognition) return showToast('Dictado por voz no soportado en este navegador.', 'error');
            if (isRecording) {
                recognition.stop();
            } else {
                discourseText.value = '';
                recognition.start();
            }
        });
    }

    /* --- TOAST HELPER --- */
    function showToast(msg, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        const icons = { success: 'circle-check', error: 'circle-xmark', warning: 'triangle-exclamation', info: 'circle-info' };
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<i class="fa-solid fa-${icons[type] || 'circle-info'}"></i> ${msg}`;
        container.appendChild(toast);
        requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, duration);
    }

    /* --- SIDEBAR VIEW SWITCHING --- */
    const sidebarModulesView = document.getElementById('sidebar-modules-view');
    const sidebarResultsView = document.getElementById('sidebar-results-view');
    const btnExportHtml = document.getElementById('btn-export-html');

    function showResultsInSidebar() {
        sidebarModulesView.style.display = 'none';
        sidebarResultsView.style.display = 'block';
        btnExportHtml.style.display = '';
        const introSection = document.getElementById('res-scorecard');
        if (introSection && !introSection.classList.contains('open')) {
            introSection.classList.add('open');
        }
        sidebarResultsView.scrollTop = 0;
    }

    /* ── Exportar HTML ── */
    btnExportHtml.addEventListener('click', () => {
        showToast('La exportación HTML estará disponible próximamente.', 'info');
    });

    // Module card navigation: click → show results & scroll to section
    document.querySelectorAll('.module-card[data-target]').forEach(card => {
        card.addEventListener('click', () => {
            if (sidebarResultsView.style.display === 'none' || !sidebarResultsView.style.display) return;
            const target = document.getElementById(card.dataset.target);
            if (target) {
                target.classList.add('open');
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Accordion toggle for result section headers
    document.querySelectorAll('.res-section-hdr').forEach(hdr => {
        hdr.addEventListener('click', (e) => {
            hdr.closest('.res-section-sb').classList.toggle('open');
        });
    });

    /* --- SIDEBAR RESIZE LOGIC --- */
    const sidebar = document.getElementById('sidebar');
    const handle = document.getElementById('drag-handle');
    let dragging = false;

    handle.addEventListener('mousedown', () => {
        dragging = true;
        document.body.style.cursor = 'col-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        document.body.style.userSelect = 'none';
        const maxWidth = window.innerWidth * 0.85;
        const newWidth = Math.min(maxWidth, Math.max(200, e.clientX));
        sidebar.style.width = newWidth + 'px';
        sidebar.style.minWidth = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        }
    });

    function errBlock(msg) { 
        return `<div class="error-block"><i class="fa-solid fa-circle-exclamation"></i> ${msg}</div>`; 
    }

    function gaugeCircle(score, max = 100) {
        const pct = Math.round((score / max) * 100);
        return `<div class="gauge-circle" style="--pct:${pct}%"><span class="gauge-val">${score}</span></div>`;
    }

    function renderScorecard(scorecard, escenario) {
        const body = document.getElementById('body-scorecard');
        if (!scorecard) { body.innerHTML = errBlock('Sin datos'); return; }
        
        let warningBanner = '';
        if (scorecard.scores_por_dimension?.D4 <= 1) {
            warningBanner = `<div style="background-color: var(--c-red); color: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; font-weight: bold; text-align: center;">
                <i class="fa-solid fa-triangle-exclamation"></i> Límite regulatorio aplicado (D4 <= 1): El puntaje global se limitó a 35/100.
            </div>`;
        }

        body.innerHTML = `
            ${warningBanner}
            <div class="result-card">
                <div class="result-card-title">Resultado del Pitch</div>
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; margin: 1.5rem 0;">
                    ${gaugeCircle(scorecard.puntaje_total || 0, 100)}
                    <span style="font-size: 1.25rem; font-weight: bold; color: var(--c-blue-dark);">${scorecard.banda || ''}</span>
                </div>
            </div>
            <div class="result-card">
                <div class="result-card-title">Resumen por Dimensión</div>
                <div style="display:flex;flex-direction:column;gap:0.6rem; margin-top: 0.5rem;">
                    ${Object.entries(scorecard.scores_por_dimension || {}).map(([k, v]) => `
                        <div style="display:flex; justify-content:space-between; align-items: center; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                            <strong>Dimensión ${k}:</strong>
                            <div style="display: flex; gap: 0.25rem;">
                                ${'<i class="fa-solid fa-star" style="color: var(--c-yellow);"></i>'.repeat(v)}${'<i class="fa-regular fa-star" style="color: var(--text-muted);"></i>'.repeat(5-v)}
                                <span style="margin-left: 0.5rem; font-weight: bold;">(${v}/5)</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function renderD1(d1) {
        const body = document.getElementById('body-d1');
        if (!d1?.ok) { body.innerHTML = errBlock(d1?.error || 'Sin datos'); return; }
        const d = d1.data;
        body.innerHTML = `
            <div class="result-card">
                <div class="result-card-title">Puntaje: ${d.score || 0}/5</div>
                <div style="margin-top: 0.5rem;">
                    <p><strong>Fortaleza:</strong> ${d.fortaleza || 'N/A'}</p>
                    <p style="margin-top: 0.5rem;"><strong>Sugerencia de mejora:</strong> ${d.mejora || 'N/A'}</p>
                </div>
            </div>
            <div class="result-card">
                <div class="result-card-title">Evidencia Encontrada</div>
                <ul style="padding-left: 1.25rem; margin-top: 0.5rem;">
                    ${(d.evidencia_encontrada || []).map(item => `<li>${item}</li>`).join('') || '<li>Ninguna</li>'}
                </ul>
            </div>
            ${d.afirmaciones_sin_respaldo?.length ? `
            <div class="result-card" style="border-left: 4px solid var(--c-red);">
                <div class="result-card-title" style="color: var(--c-red);">Afirmaciones Sin Respaldo / Off-Label</div>
                <ul style="padding-left: 1.25rem; margin-top: 0.5rem;">
                    ${d.afirmaciones_sin_respaldo.map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>
            ` : ''}
        `;
    }

    function renderD2(d2) {
        const body = document.getElementById('body-d2');
        if (!d2?.ok) { body.innerHTML = errBlock(d2?.error || 'Sin datos'); return; }
        const d = d2.data;
        body.innerHTML = `
            <div class="result-card">
                <div class="result-card-title">Puntaje: ${d.score || 0}/5</div>
                <div style="margin-top: 0.5rem;">
                    <p><strong>Nivel técnico apropiado:</strong> ${d.nivel_tecnico_apropiado ? 'Sí' : 'No'}</p>
                    <p style="margin-top: 0.25rem;"><strong>Fortaleza:</strong> ${d.fortaleza || 'N/A'}</p>
                    <p style="margin-top: 0.25rem;"><strong>Mejora:</strong> ${d.mejora || 'N/A'}</p>
                </div>
            </div>
            <div class="result-card">
                <div class="result-card-title">Ejemplos Bien Calibrados</div>
                <ul style="padding-left: 1.25rem; margin-top: 0.5rem;">
                    ${(d.ejemplos_bien_calibrados || []).map(item => `<li>${item}</li>`).join('') || '<li>Ninguno</li>'}
                </ul>
            </div>
            ${d.deslices_de_registro?.length ? `
            <div class="result-card" style="border-left: 4px solid var(--c-orange);">
                <div class="result-card-title" style="color: var(--c-orange);">Deslices de Registro</div>
                <ul style="padding-left: 1.25rem; margin-top: 0.5rem;">
                    ${d.deslices_de_registro.map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>
            ` : ''}
        `;
    }

    function renderD3(d3) {
        const body = document.getElementById('body-d3');
        if (!d3) { body.innerHTML = errBlock('Sin datos'); return; }
        body.innerHTML = `
            <div class="result-card">
                <div class="result-card-title">Puntaje: ${d3.score || 0}/5</div>
                <div style="margin-top: 0.5rem;">
                    <p><strong>Detección de Video:</strong> ${d3.tiene_video ? 'Cámara Activa' : 'Solo Audio'}</p>
                    <p style="margin-top: 0.25rem;"><strong>Nota:</strong> ${d3.nota || ''}</p>
                </div>
            </div>
            <div class="result-card">
                <div class="result-card-title">Observaciones de Ritmo y Fluidez</div>
                <ul style="padding-left: 1.25rem; margin-top: 0.5rem;">
                    ${(d3.observaciones || []).map(item => `<li>${item}</li>`).join('') || '<li>Ritmo adecuado</li>'}
                </ul>
            </div>
        `;
    }

    function renderD4(d4) {
        const body = document.getElementById('body-d4');
        if (!d4?.ok) { body.innerHTML = errBlock(d4?.error || 'Sin datos'); return; }
        const d = d4.data;
        body.innerHTML = `
            <div class="result-card" style="${d.score <= 1 ? 'border-left: 4px solid var(--c-red);' : ''}">
                <div class="result-card-title" style="${d.score <= 1 ? 'color: var(--c-red);' : ''}">Puntaje: ${d.score || 0}/5</div>
                <div style="margin-top: 0.5rem;">
                    <p><strong>Indicaciones correctas:</strong> ${d.indicaciones_correctas ? 'Sí' : 'No'}</p>
                    <p><strong>Menciona efectos adversos:</strong> ${d.menciona_efectos_adversos ? 'Sí' : 'No'}</p>
                    <p style="margin-top: 0.25rem;"><strong>Fortaleza:</strong> ${d.fortaleza || 'N/A'}</p>
                    <p style="margin-top: 0.25rem;"><strong>Mejora:</strong> ${d.mejora || 'N/A'}</p>
                </div>
            </div>
            ${d.afirmaciones_absolutas?.length ? `
            <div class="result-card">
                <div class="result-card-title">Afirmaciones Absolutas Detectadas</div>
                <ul style="padding-left: 1.25rem; margin-top: 0.5rem;">
                    ${d.afirmaciones_absolutas.map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>
            ` : ''}
            ${d.comparaciones_sin_respaldo?.length ? `
            <div class="result-card" style="border-left: 4px solid var(--c-orange);">
                <div class="result-card-title" style="color: var(--c-orange);">Comparaciones Sin Respaldo</div>
                <ul style="padding-left: 1.25rem; margin-top: 0.5rem;">
                    ${d.comparaciones_sin_respaldo.map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>
            ` : ''}
        `;
    }

    function renderD5(d5) {
        const body = document.getElementById('body-d5');
        if (!d5?.ok) { body.innerHTML = errBlock(d5?.error || 'Sin datos'); return; }
        const d = d5.data;
        body.innerHTML = `
            <div class="result-card">
                <div class="result-card-title">Puntaje: ${d.score || 0}/5</div>
                <div style="margin-top: 0.5rem;">
                    <p><strong>Abre con problema:</strong> ${d.abre_con_problema ? 'Sí' : 'No'}</p>
                    <p><strong>Presenta evidencia en contexto:</strong> ${d.presenta_evidencia_en_contexto ? 'Sí' : 'No'}</p>
                    <p><strong>Cierre con llamado a la acción:</strong> ${d.cierre_con_llamado_accion ? 'Sí' : 'No'}</p>
                    <p><strong>Maneja objeciones anticipadas:</strong> ${d.maneja_objeciones_anticipadas ? 'Sí' : 'No'}</p>
                    <p style="margin-top: 0.25rem;"><strong>Fortaleza:</strong> ${d.fortaleza || 'N/A'}</p>
                    <p style="margin-top: 0.25rem;"><strong>Mejora:</strong> ${d.mejora || 'N/A'}</p>
                </div>
            </div>
        `;
    }

    function renderResults(data, escenario) {
        renderScorecard(data.scorecard, escenario);
        renderD1(data.D1_evidencia_cientifica);
        renderD2(data.D2_claridad_lenguaje);
        renderD3(data.D3_no_verbal || (data.scorecard?.scores_por_dimension ? {score: data.scorecard.scores_por_dimension.D3} : null));
        renderD4(data.D4_cumplimiento_regulatorio);
        renderD5(data.D5_estructura_narrativa);
        showResultsInSidebar();
        showToast('Análisis completado. Revise los resultados en el panel lateral.', 'success', 5000);
    }

    /* ============================================================
       DEMO DATA LOAD
     ============================================================ */
    const btnLoadDemo = document.getElementById('btn-load-demo');
    if (btnLoadDemo) {
        btnLoadDemo.addEventListener('click', async () => {
            try {
                const res = await fetch('/static/config/demo_data.json?v=' + Date.now());
                const demoData = await res.json();
                const { escenario = {}, ...data } = demoData;

                const badges = document.querySelectorAll('.status-badge');
                badges.forEach(b => {
                    b.textContent = 'Completado';
                    b.className = 'status-badge completed';
                    b.style.backgroundColor = 'var(--c-blue-tint)';
                    b.style.color = 'var(--c-blue-dark)';
                });
                
                if (escenario.medicamento_id) document.getElementById('meta-medicamento').value = escenario.medicamento_id;
                if (escenario.interlocutor_id) document.getElementById('meta-interlocutor').value = escenario.interlocutor_id;
                if (escenario.reto) document.getElementById('meta-reto').value = escenario.reto;
                if (escenario.tiempo_min) document.getElementById('meta-tiempo').value = escenario.tiempo_min;

                renderResults(data, escenario);
                showToast('Datos de prueba cargados correctamente.', 'success');
            } catch (err) {
                console.error(err);
                showToast('Error al cargar datos de prueba.', 'error');
            }
        });
    }

    // ─── PITCHMED360: UPLOAD + TRANSCRIPCIÓN ───────────────────────────────────

    const pitchFileInput = document.getElementById('pitch-file');
    const uploadLabel = document.getElementById('upload-label-text');
    const transcripcionPreview = document.getElementById('transcripcion-preview');
    const transcripcionTexto = document.getElementById('transcripcion-texto');
    const transcripcionMeta = document.getElementById('transcripcion-meta');
    const btnEvaluar = document.getElementById('btn-evaluar');
    const audienciaSelect = document.getElementById('audiencia-select');

    let textoParaAnalizar = '';
    let audienciaActual = 'paciente';
    let duracionSeg = 0;
    let palabrasTotal = 0;

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
        
        // Enable/disable btnEvaluar based on tab status
        if (btn.dataset.tab === 'text') {
          btnEvaluar.disabled = !discourseText.value.trim();
        } else {
          btnEvaluar.disabled = !textoParaAnalizar;
        }
      });
    });

    // Enable evaluate button in text mode when user types
    discourseText.addEventListener('input', () => {
      const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
      if (activeTab === 'text') {
        btnEvaluar.disabled = !discourseText.value.trim();
      }
    });

    // Upload label click
    document.querySelector('.upload-label').addEventListener('click', () => {
      pitchFileInput.click();
    });

    // File selected → upload to /transcribir
    pitchFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      uploadLabel.textContent = `Transcribiendo "${file.name}"...`;
      transcripcionPreview.style.display = 'none';
      btnEvaluar.disabled = true;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('audiencia', audienciaSelect.value);
      formData.append('producto_id', 'demo'); // TODO: conectar con selector de producto

      try {
        const res = await fetch('/transcribir', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.transcripcion) {
          textoParaAnalizar = data.transcripcion.texto;
          duracionSeg = data.transcripcion.duracion_seg || 0;
          palabrasTotal = textoParaAnalizar.split(/\s+/).length;

          transcripcionTexto.textContent = textoParaAnalizar.substring(0, 400) + (textoParaAnalizar.length > 400 ? '...' : '');
          transcripcionMeta.textContent = `Duración: ${duracionSeg}s · Palabras: ${palabrasTotal} · Idioma: ${data.transcripcion.idioma}`;
          transcripcionPreview.style.display = 'block';
          uploadLabel.textContent = `Listo: ${file.name} transcrito`;
          btnEvaluar.disabled = false;
        } else {
          uploadLabel.textContent = `Error: ${data.detail || 'Fallo en la transcripción'}`;
        }
      } catch (err) {
        uploadLabel.textContent = `Error: ${err.message}`;
      }
    });

    // Botón evaluar → POST /analizar/pitchmed
    btnEvaluar.addEventListener('click', async () => {
      const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
      if (activeTab === 'text') {
        textoParaAnalizar = discourseText.value.trim();
      }

      if (!textoParaAnalizar) return;

      audienciaActual = audienciaSelect.value;
      btnEvaluar.disabled = true;
      btnEvaluar.textContent = 'Evaluando…';

      const payload = {
        texto: textoParaAnalizar,
        escenario: {
          medicamento_id: 'demo',
          interlocutor_id: audienciaActual,
          reto: 'Presentar el producto de forma efectiva y compliant'
        }
      };

      try {
        const res = await fetch('/analizar/pitchmed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        renderResults(data, payload.escenario);
      } catch (err) {
        console.error(err);
        showToast('Error al evaluar el pitch', 'error');
      } finally {
        btnEvaluar.disabled = false;
        btnEvaluar.innerHTML = '<i class="fa-solid fa-microscope"></i> Evaluar pitch';
      }
    });

});
