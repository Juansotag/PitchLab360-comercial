document.addEventListener('DOMContentLoaded', () => {

    /* --- GLOBALS --- */
    let chatHistorial = [];
    const chatHistoryEl = document.getElementById('chat-history');
    const discourseText = document.getElementById('discourse-text');
    const btnSendChat = document.getElementById('btn-send-chat');
    const turnCountDisplay = document.getElementById('turn-count');
    const btnAnalyze = document.getElementById('btn-analyze');

    /* --- AUDIO: STT & TTS GLOBALS --- */
    const btnMic = document.getElementById('btn-mic');
    const btnToggleTts = document.getElementById('btn-toggle-tts');
    let ttsEnabled = false;
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

    if (btnToggleTts) {
        btnToggleTts.addEventListener('click', () => {
            ttsEnabled = !ttsEnabled;
            if (ttsEnabled) {
                btnToggleTts.innerHTML = '<i class="fa-solid fa-volume-high" id="tts-icon"></i> Voz IA: Activa';
                btnToggleTts.classList.replace('btn-outline', 'btn-primary');
                showToast('Lectura en voz alta activada.', 'info');
            } else {
                btnToggleTts.innerHTML = '<i class="fa-solid fa-volume-xmark" id="tts-icon"></i> Voz IA: Inactiva';
                btnToggleTts.classList.replace('btn-primary', 'btn-outline');
                window.speechSynthesis.cancel();
                showToast('Lectura en voz alta desactivada.', 'info');
            }
        });
    }

    function speakText(text) {
        if (!ttsEnabled || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        
        // Remove markdown or special characters before speaking
        let cleanText = text.replace(/[*_#]/g, '');
        
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'es-ES';
        
        // Use a good voice if available
        const voices = window.speechSynthesis.getVoices();
        const esVoice = voices.find(v => v.lang.startsWith('es') && v.name.includes('Google')) || voices.find(v => v.lang.startsWith('es'));
        if (esVoice) utterance.voice = esVoice;
        
        window.speechSynthesis.speak(utterance);
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

    /* --- CHAT LOGIC --- */
    function addMessageToChat(role, text) {
        // Eliminar mensaje del sistema si es el primer turno
        const sysMsg = chatHistoryEl.querySelector('.chat-message.system');
        if (sysMsg) sysMsg.remove();

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${role === 'user' ? 'medico' : 'interlocutor'}`;
        msgDiv.innerHTML = `<strong>${role === 'user' ? 'Médico' : 'Auditor (IA)'}:</strong><br/>${text.replace(/\n/g, '<br/>')}`;
        chatHistoryEl.appendChild(msgDiv);
        chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;

        chatHistorial.push({ role: role === 'user' ? 'user' : 'assistant', content: text });
        turnCountDisplay.textContent = `${chatHistorial.length} turnos`;
    }

    btnSendChat.addEventListener('click', async () => {
        const text = discourseText.value.trim();
        if (!text) return;

        discourseText.value = '';
        addMessageToChat('user', text);

        const medId = document.getElementById('meta-medicamento').value.trim() || 'demo';
        const interId = document.getElementById('meta-interlocutor').value.trim() || 'auditor_eps';

        // Add loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'chat-message interlocutor';
        loadingDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Escribiendo...';
        chatHistoryEl.appendChild(loadingDiv);
        chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;

        try {
            const res = await fetch('/conversar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    historial: chatHistorial,
                    interlocutor_id: interId,
                    medicamento_id: medId
                })
            });

            loadingDiv.remove();

            if (!res.ok) throw new Error('Error en la comunicación con la IA');
            const data = await res.json();
            addMessageToChat('assistant', data.respuesta);
            
            // Leer en voz alta si está activo
            speakText(data.respuesta);

        } catch (e) {
            loadingDiv.remove();
            showToast('Error al procesar el turno de la IA', 'error');
            console.error(e);
        }
    });

    // Enviar con Enter
    discourseText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            btnSendChat.click();
        }
    });

    /* --- EXECUTE BUTTON: MÓDULOS DE ANÁLISIS --- */
    btnAnalyze.addEventListener('click', async () => {
        if (chatHistorial.length === 0) {
            showToast('Debe haber al menos un turno en la conversación.', 'warning');
            return;
        }

        const medicamento = document.getElementById('meta-medicamento').value.trim() || 'demo';
        const interlocutor = document.getElementById('meta-interlocutor').value.trim() || 'auditor_eps';
        const reto = document.getElementById('meta-reto').value.trim() || '';
        const tiempo = document.getElementById('meta-tiempo').value.trim() || '5';

        const transcripcionCompleta = chatHistorial.map(t => `${t.role === 'user' ? 'Médico' : 'Interlocutor'}: ${t.content}`).join('\n\n');

        const originalText = btnAnalyze.innerHTML;
        btnAnalyze.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> PROCESANDO...';
        btnAnalyze.style.backgroundColor = 'var(--c-blue-dark)';
        btnAnalyze.disabled = true;

        const badges = document.querySelectorAll('.status-badge');
        badges.forEach(b => {
            b.textContent = 'Procesando...';
            b.style.backgroundColor = '#fef08a';
            b.style.color = '#854d0e';
        });

        const escenarioObj = {
            medicamento_id: medicamento,
            interlocutor_id: interlocutor,
            reto: reto,
            tiempo_min: parseInt(tiempo) || 5
        };

        try {
            const response = await fetch('/analizar/todo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texto: transcripcionCompleta, escenario: escenarioObj })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'Server Error');
            }

            const data = await response.json();

            btnAnalyze.innerHTML = originalText;
            btnAnalyze.style.backgroundColor = 'var(--c-red)';
            badges.forEach(b => {
                b.textContent = 'Completado';
                b.className = 'status-badge completed';
                b.style.backgroundColor = '#e8edf7';
                b.style.color = '#00205B';
            });

            renderResults(data, escenarioObj);

        } catch (err) {
            console.error(err);
            showToast('Error al procesar el análisis.', 'error', 6000);
            btnAnalyze.innerHTML = originalText;
            btnAnalyze.style.backgroundColor = '';
            badges.forEach(b => {
                b.textContent = 'Pendiente';
                b.style.backgroundColor = '#f3f4f6';
                b.style.color = '#374151';
            });
        } finally {
            btnAnalyze.disabled = false;
        }
    });

    /* ============================================================
       RESULTS RENDERING ENGINE
     ============================================================ */
    function errBlock(msg) { return `<div class="error-block"><i class="fa-solid fa-circle-exclamation"></i> ${msg}</div>`; }
    function gaugeCircle(score, max = 100) {
        const pct = Math.round((score / max) * 100);
        return `<div class="gauge-circle" style="--pct:${pct}%"><span class="gauge-val">${score}</span></div>`;
    }

    function renderScorecard(scorecard, escenario) {
        const body = document.getElementById('body-scorecard');
        if (!scorecard) { body.innerHTML = errBlock('Sin datos'); return; }
        
        let warningBanner = '';
        if (scorecard.veredicto_evidencia === 'violacion') {
            warningBanner = `<div style="background-color: var(--c-red); color: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; font-weight: bold; text-align: center;">
                <i class="fa-solid fa-triangle-exclamation"></i> Violación a la Ficha Técnica (Límite duro aplicado)
            </div>`;
        }

        body.innerHTML = `
            ${warningBanner}
            <div class="result-card">
                <div class="result-card-title">Scorecard Global</div>
                <div class="score-gauge" style="justify-content: center; transform: scale(1.2); margin: 2rem 0;">
                    ${gaugeCircle(scorecard.global || 0, 100)}
                </div>
            </div>
            <div class="result-card">
                <div class="result-card-title">Dimensiones</div>
                <div style="display:flex;flex-direction:column;gap:0.6rem">
                    ${Object.entries(scorecard.dimensiones || {}).map(([k, v]) => `
                        <div style="display:flex; justify-content:space-between; padding: 0.5rem; background: #f8fafc; border-radius: 4px;">
                            <strong>${k.replace(/_/g, ' ').toUpperCase()}:</strong> <span>${v}/100</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function renderExactitudEvidencia(exactitud) {
        const body = document.getElementById('body-exactitud-evidencia');
        if (!exactitud?.ok) { body.innerHTML = errBlock(exactitud?.error || 'Sin datos'); return; }
        const d = exactitud.data;
        
        let colorSemaforo = 'var(--c-blue-dark)';
        let icono = 'fa-check-circle';
        if (d.veredicto_global === 'violacion') { colorSemaforo = 'var(--c-red)'; icono = 'fa-xmark-circle'; }
        else if (d.veredicto_global === 'advertencia') { colorSemaforo = '#eab308'; icono = 'fa-exclamation-triangle'; }
        else if (d.veredicto_global === 'ok') { colorSemaforo = '#16a34a'; icono = 'fa-check-circle'; }

        const getClaimColor = (estado) => {
            if (estado === 'respaldado') return '#16a34a'; 
            if (estado === 'exagerado' || estado === 'falta_seguridad') return '#eab308'; 
            return 'var(--c-red)'; 
        };

        body.innerHTML = `
            <div class="result-card">
                <div class="result-card-title">a. Veredicto Global</div>
                <div style="display:flex; align-items:center; gap: 1rem; margin: 1rem 0;">
                    <i class="fa-solid ${icono}" style="font-size: 3rem; color: ${colorSemaforo}"></i>
                    <strong style="font-size: 1.5rem; text-transform: uppercase; color: ${colorSemaforo}">${d.veredicto_global}</strong>
                </div>
            </div>
            <div class="result-card">
                <div class="result-card-title">b. Afirmaciones vs Evidencia</div>
                <div style="display:flex;flex-direction:column;gap:1rem; margin-top: 1rem;">
                    ${(d.afirmaciones || []).map(c => `
                        <div style="border-left: 4px solid ${getClaimColor(c.estado)}; padding-left: 1rem; background: #f8fafc; padding: 0.5rem; border-radius: 0 4px 4px 0;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                                <strong style="color:var(--text-primary)">"${c.afirmacion}"</strong>
                                <span style="background:${getClaimColor(c.estado)}; color:white; padding: 0.2rem 0.6rem; border-radius: 99px; font-size: 0.8rem; height: fit-content; text-transform:uppercase;">${c.estado}</span>
                            </div>
                            <div style="font-size: 0.9rem; color: var(--text-secondary);">
                                <strong>Evidencia en Ficha:</strong> <i>${c.evidencia_ficha}</i>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function renderFuerzaDefensa(fuerza, objeciones, cobertura) {
        const body = document.getElementById('body-fuerza-defensa');
        let html = '';

        if (fuerza?.ok) {
            const d = fuerza.data;
            html += `
            <div class="result-card">
                <div class="result-card-title">a. Solidez de la Defensa</div>
                <div style="margin-top:0.5rem; display:flex; flex-direction:column; gap:0.5rem;">
                    <div><strong>¿Ancló en evidencia?:</strong> ${d.anclo_en_evidencia ? 'Sí <i class="fa-solid fa-check" style="color:green"></i>' : 'No <i class="fa-solid fa-xmark" style="color:red"></i>'}</div>
                    <div><strong>¿Ancló en caso particular?:</strong> ${d.anclo_en_caso_particular ? 'Sí <i class="fa-solid fa-check" style="color:green"></i>' : 'No <i class="fa-solid fa-xmark" style="color:red"></i>'}</div>
                    <div><strong>¿Justificó vs alternativa?:</strong> ${d.justifico_vs_alternativa ? 'Sí <i class="fa-solid fa-check" style="color:green"></i>' : 'No <i class="fa-solid fa-xmark" style="color:red"></i>'}</div>
                    <div style="margin-top:0.5rem; color:var(--text-secondary); font-size:0.9rem;">
                        <strong>Observaciones:</strong>
                        <ul style="padding-left:1.5rem; margin-top:0.2rem;">
                            ${(d.observaciones || []).map(o => `<li>${o}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            </div>`;
        }

        if (objeciones?.ok) {
            const d = objeciones.data;
            html += `
            <div class="result-card">
                <div class="result-card-title">b. Manejo de Objeciones</div>
                <div style="margin-top:0.5rem;">
                    <div><strong>Objeción central detectada:</strong> ${d.objecion_central}</div>
                    <div><strong>¿Fue abordada?:</strong> ${d.fue_abordada ? 'Sí' : 'No'}</div>
                    <div><strong>Calidad de respuesta:</strong> ${d.calidad}</div>
                </div>
            </div>`;
        }

        if (cobertura?.ok) {
            const d = cobertura.data;
            html += `
            <div class="result-card">
                <div class="result-card-title">c. Argumentación de Cobertura</div>
                <div style="margin-top:0.5rem;">
                    <div><strong>Argumentos usados:</strong> ${(d.argumentos_usados || []).join(', ') || 'Ninguno'}</div>
                    <div style="margin-top:0.5rem;"><strong>Argumentos faltantes:</strong> ${(d.argumentos_faltantes || []).join(', ') || 'Ninguno'}</div>
                </div>
            </div>`;
        }

        body.innerHTML = html || errBlock('Sin datos');
    }

    function renderClaridad(claridad, metricas) {
        const body = document.getElementById('body-claridad-estructura');
        let html = '';
        if (metricas) {
            html += `
            <div class="result-card">
                <div class="result-card-title">Métricas de Complejidad</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                    <div style="background: #f8fafc; padding: 1rem; border-radius: 6px; text-align: center;">
                        <div style="font-size:2rem; font-weight:bold; color:var(--c-blue-dark)">${metricas.densidad_jerga || 0}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted)">Términos Médicos</div>
                    </div>
                    <div style="background: #f8fafc; padding: 1rem; border-radius: 6px; text-align: center;">
                        <div style="font-size:2rem; font-weight:bold; color:var(--c-blue-dark)">${metricas.conteo_cifras || 0}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted)">Cifras / Datos</div>
                    </div>
                </div>
            </div>`;
        }
        body.innerHTML = html || errBlock('Sin datos');
    }

    function renderResults(data, escenario) {
        renderScorecard(data.scorecard, escenario);
        renderExactitudEvidencia(data.exactitud_evidencia);
        renderFuerzaDefensa(data.fuerza_justificacion, data.manejo_objeciones, data.argumentacion_cobertura);
        renderClaridad(data.comunicacion_empatia, data.metricas);
        showResultsInSidebar();
        showToast('Análisis completado. Revise los resultados en el panel lateral.', 'success', 5000);
    }

    /* ============================================================
       DEMO DATA LOAD
     ============================================================ */
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'm') {
            e.preventDefault();
            document.getElementById('meta-medicamento').value = 'demo';
            document.getElementById('meta-interlocutor').value = 'auditor_eps';
            document.getElementById('meta-reto').value = 'Justificar el uso de Ejemplo XR frente a alternativas PBS por costo y eficacia';
            document.getElementById('meta-tiempo').value = '10';
            
            chatHistoryEl.innerHTML = `
                <div class="chat-message medico"><strong>Médico:</strong><br/>Doctora Restrepo, le presento Ejemplo XR. Es una nueva opción para pacientes con hipertensión resistente, con una reducción sostenida durante 24 horas y sin los efectos adversos clásicos.</div>
                <div class="chat-message interlocutor"><strong>Auditor (IA):</strong><br/>Doctor, entiendo. Pero no está financiado con la UPC y tenemos muchas alternativas costo-efectivas en el PBS como el Enalapril o Losartán. ¿Por qué deberíamos autorizar este por MIPRES?</div>
                <div class="chat-message medico"><strong>Médico:</strong><br/>Porque este paciente en particular ya falló con Enalapril y presentó tos severa. Además, con Losartán no ha logrado llegar a las metas tensionales, manteniéndose por encima de 150/90.</div>
                <div class="chat-message interlocutor"><strong>Auditor (IA):</strong><br/>El costo de Ejemplo XR es casi 5 veces mayor. Necesitaríamos una justificación médica muy fuerte basada en evidencia para justificar ese impacto financiero para la EPS.</div>
                <div class="chat-message medico"><strong>Médico:</strong><br/>La justificación se basa en el ensayo clínico REVERT-BP, donde Ejemplo XR demostró una reducción del 22% en eventos cardiovasculares mayores en pacientes refractarios, lo que a largo plazo le ahorra costos de hospitalización al sistema.</div>
                <div class="chat-message interlocutor"><strong>Auditor (IA):</strong><br/>Es un punto válido. Sin embargo, ¿cómo es el perfil de seguridad respecto al edema periférico, que es común en estos bloqueadores?</div>
                <div class="chat-message medico"><strong>Médico:</strong><br/>Precisamente, su mecanismo dual hace que la tasa de edema periférico sea menor al 2%, mucho más baja que con el amlodipino. Por eso es ideal para este paciente.</div>
            `;

            chatHistorial = [
                {role: "user", content: "Doctora Restrepo, le presento Ejemplo XR. Es una nueva opción para pacientes con hipertensión resistente, con una reducción sostenida durante 24 horas y sin los efectos adversos clásicos."},
                {role: "assistant", content: "Doctor, entiendo. Pero no está financiado con la UPC y tenemos muchas alternativas costo-efectivas en el PBS como el Enalapril o Losartán. ¿Por qué deberíamos autorizar este por MIPRES?"},
                {role: "user", content: "Porque este paciente en particular ya falló con Enalapril y presentó tos severa. Además, con Losartán no ha logrado llegar a las metas tensionales, manteniéndose por encima de 150/90."},
                {role: "assistant", content: "El costo de Ejemplo XR es casi 5 veces mayor. Necesitaríamos una justificación médica muy fuerte basada en evidencia para justificar ese impacto financiero para la EPS."},
                {role: "user", content: "La justificación se basa en el ensayo clínico REVERT-BP, donde Ejemplo XR demostró una reducción del 22% en eventos cardiovasculares mayores en pacientes refractarios, lo que a largo plazo le ahorra costos de hospitalización al sistema."},
                {role: "assistant", content: "Es un punto válido. Sin embargo, ¿cómo es el perfil de seguridad respecto al edema periférico, que es común en estos bloqueadores?"},
                {role: "user", content: "Precisamente, su mecanismo dual hace que la tasa de edema periférico sea menor al 2%, mucho más baja que con el amlodipino. Por eso es ideal para este paciente."}
            ];
            turnCountDisplay.textContent = "7 turnos";
            document.getElementById('discourse-text').value = '';
            
            showToast('Conversación avanzada de 7 turnos cargada (Ctrl+M).', 'info');
        }
    });

    const btnLoadDemo = document.getElementById('btn-load-demo');
    if (btnLoadDemo) {
        btnLoadDemo.addEventListener('click', async () => {
            try {
                const res = await fetch('/static/config/demo_data.json?v=' + Date.now());
                const demoData = await res.json();
                const { escenario = {}, ...data } = demoData;

                const badges = document.querySelectorAll('.status-badge');
                badges.forEach(b => {
                    b.textContent = 'Demo';
                    b.className = 'status-badge completed';
                    b.style.backgroundColor = 'var(--c-blue-tint)';
                    b.style.color = 'var(--c-blue-dark)';
                });
                
                if (escenario.medicamento_id) document.getElementById('meta-medicamento').value = escenario.medicamento_id;
                if (escenario.interlocutor_id) document.getElementById('meta-interlocutor').value = escenario.interlocutor_id;
                if (escenario.reto) document.getElementById('meta-reto').value = escenario.reto;
                if (escenario.tiempo_min) document.getElementById('meta-tiempo').value = escenario.tiempo_min;

                chatHistoryEl.innerHTML = `
                    <div class="chat-message medico"><strong>Médico:</strong><br/>Doctora Restrepo, sé que tiene poco tiempo, le presento Ejemplo XR. Es el único del mercado que no causa mareo y reduce la presión arterial de forma sostenida durante 24 horas. ¿Le gustaría probar algunas muestras con sus próximos pacientes?</div>
                    <div class="chat-message interlocutor"><strong>Auditor (IA):</strong><br/>No está financiado con la UPC y hay alternativas en el PBS. ¿Por qué no enalapril?</div>
                    <div class="chat-message medico"><strong>Médico:</strong><br/>Porque controla mejor la presión y este paciente tiene hipertensión resistente.</div>
                `;

                chatHistorial = [
                    {role: "user", content: "Doctora Restrepo, sé que tiene poco tiempo, le presento Ejemplo XR. Es el único del mercado que no causa mareo y reduce la presión arterial de forma sostenida durante 24 horas. ¿Le gustaría probar algunas muestras con sus próximos pacientes?"},
                    {role: "assistant", content: "No está financiado con la UPC y hay alternativas en el PBS. ¿Por qué no enalapril?"},
                    {role: "user", content: "Porque controla mejor la presión y este paciente tiene hipertensión resistente."}
                ];
                turnCountDisplay.textContent = "3 turnos";

                renderResults(data, escenario);
                showToast('Datos de prueba cargados correctamente.', 'success');
            } catch (err) {
                console.error(err);
                showToast('Error al cargar datos de prueba.', 'error');
            }
        });
    }

});
