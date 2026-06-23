# Spec de Transformación: PitchLab360-comercial → PitchMed360

**Fecha:** Junio 2026  
**Para:** Antigravity  
**Contexto:** Repo base en `https://github.com/Juansotag/PitchLab360-comercial`  
**Objetivo:** Convertir la Cabina de Defensa Clínica (médico vs. auditor EPS) en una herramienta de evaluación de pitch médico con input de audio/video, orientada a simposios farmacéuticos.

---

## 0. Estado actual del repo (no tocar sin instrucción)

```
main.py                         ← Backend FastAPI con 6 endpoints
process_data.py                 ← (vacío / scratchpad)
static/index.html               ← Frontend vanilla JS (225 líneas)
static/app.js                   ← Lógica frontend
static/style.css                ← Estilos
static/config/rubrica.json      ← Pesos de dimensiones actuales (REEMPLAZAR)
static/config/medicamentos.json ← Fichas técnicas (AMPLIAR)
static/config/interlocutores.json ← Perfiles de interlocutor (AMPLIAR)
static/config/categorias.json
static/config/personas.json
static/config/stakeholders.json
assets/Govlab.png
assets/PitchLab360.jpg
requirements.txt
Procfile
.env.example
```

**Arquitectura actual:** FastAPI + Anthropic SDK + textstat + ThreadPoolExecutor (3 workers). Input: texto plano. Análisis en 4–5 módulos LLM en paralelo. Output: JSON con scorecard.

---

## 1. Cambios en `requirements.txt`

Agregar al final del archivo existente (NO eliminar las líneas actuales):

```
openai-whisper
ffmpeg-python
torch
numpy
fpdf2
```

> **Nota para Antigravity:** `openai-whisper` requiere `torch`. En Railway, esto incrementa el build time significativamente. Agregar al `Procfile` el flag `--timeout 120` en uvicorn si hay timeouts en deploy.

---

## 2. Nuevo archivo: `transcriber.py` (crear en raíz)

Este módulo recibe el archivo de audio/video y devuelve texto transcrito.

```python
# transcriber.py
import whisper
import tempfile
import os

_model = None

def get_model():
    global _model
    if _model is None:
        _model = whisper.load_model("base")  # "small" si hay memoria suficiente en Railway
    return _model

def transcribir(file_bytes: bytes, extension: str) -> dict:
    """
    Recibe bytes del archivo y su extensión (.mp3, .mp4, .wav, .webm).
    Devuelve {"texto": str, "idioma": str, "duracion_seg": float}
    """
    model = get_model()
    with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name
    try:
        result = model.transcribe(tmp_path, language="es", verbose=False)
        duracion = result.get("segments", [{}])[-1].get("end", 0) if result.get("segments") else 0
        return {
            "texto": result["text"].strip(),
            "idioma": result.get("language", "es"),
            "duracion_seg": round(duracion, 1)
        }
    finally:
        os.unlink(tmp_path)
```

---

## 3. Cambios en `main.py`

### 3a. Agregar imports al inicio (después de los imports existentes)

```python
from fastapi import File, UploadFile, Form
from transcriber import transcribir
import tempfile
```

### 3b. Reemplazar `static/config/rubrica.json` con nueva estructura

**Crear el archivo `static/config/rubrica.json` con este contenido exacto** (reemplaza el actual):

```json
{
  "dimensiones": [
    {
      "id": "D1",
      "nombre": "Precisión Científica y Evidencia Clínica",
      "peso_paciente": 0.20,
      "peso_institucion": 0.25,
      "limite_duro": false
    },
    {
      "id": "D2",
      "nombre": "Claridad y Lenguaje según Audiencia",
      "peso_paciente": 0.25,
      "peso_institucion": 0.20,
      "limite_duro": false
    },
    {
      "id": "D3",
      "nombre": "Comunicación No Verbal",
      "peso_paciente": 0.20,
      "peso_institucion": 0.15,
      "limite_duro": false
    },
    {
      "id": "D4",
      "nombre": "Cumplimiento Regulatorio INVIMA/Fedesalud",
      "peso_paciente": 0.15,
      "peso_institucion": 0.20,
      "limite_duro": true
    },
    {
      "id": "D5",
      "nombre": "Estructura Narrativa del Pitch",
      "peso_paciente": 0.20,
      "peso_institucion": 0.20,
      "limite_duro": false
    }
  ],
  "regla_limite_duro": "Si D4 score <= 1, el puntaje global se topa en 35/100.",
  "bandas": [
    {"min": 85, "max": 100, "label": "Destacado", "color": "#1A7A4A"},
    {"min": 70, "max": 84,  "label": "Competente", "color": "#B8860B"},
    {"min": 55, "max": 69,  "label": "En desarrollo", "color": "#CC5500"},
    {"min": 0,  "max": 54,  "label": "Insuficiente", "color": "#CC0000"}
  ]
}
```

### 3c. Agregar al `static/config/interlocutores.json` un tercer perfil

Abrir el archivo, encontrar el cierre del array `"interlocutores": [...]` y agregar antes del `]` final:

```json
,
{
  "id": "institución",
  "tipo": "institucion",
  "nombre": "Comité de Farmacia / IPS",
  "tiempo_min": 7,
  "objeciones_tipicas": [
    "¿cuál es el costo por paciente vs. alternativa?",
    "¿hay estudios head-to-head con el medicamento que ya usamos?",
    "¿aplica para el perfil de pacientes de nuestra institución?",
    "¿cuál es el NNT reportado en el estudio pivotal?"
  ],
  "system_prompt": "Eres el coordinador de un comité de farmacia de una IPS de tercer nivel colombiana. Evalúas la incorporación de nuevos medicamentos al formulario institucional. Eres técnico, exiges evidencia head-to-head, costo-efectividad y pertinencia para el perfil epidemiológico local. No aceptas presentaciones genéricas."
}
```

### 3d. Reemplazar los prompts LLM en `main.py`

Encontrar la variable `PROMPTS = {` en `main.py` y **reemplazar el bloque completo** con:

```python
PROMPTS_PITCHMED = {
  "D1_evidencia_cientifica": """
{base}
Evalúa la precisión científica del pitch. Contrasta cada afirmación clínica contra la ficha técnica del producto.
Estructura requerida (JSON puro, sin markdown):
{{
  "score": <int 0-5>,
  "evidencia_encontrada": [<str>],
  "afirmaciones_sin_respaldo": [<str>],
  "fortaleza": <str>,
  "mejora": <str>
}}
REGLA: score <= 1 si hay afirmaciones off-label sin justificación.
""",

  "D2_claridad_lenguaje": """
{base}
Evalúa si el lenguaje está calibrado para la audiencia declarada ({audiencia_tipo}).
Para paciente: ¿evitó jerga? ¿usó analogías? Para institución: ¿usó terminología técnica precisa?
Estructura requerida (JSON puro):
{{
  "score": <int 0-5>,
  "nivel_tecnico_apropiado": <bool>,
  "ejemplos_bien_calibrados": [<str>],
  "deslices_de_registro": [<str>],
  "fortaleza": <str>,
  "mejora": <str>
}}
""",

  "D4_cumplimiento_regulatorio": """
{base}
Evalúa el cumplimiento con el marco regulatorio colombiano (INVIMA, Fedesalud).
Estructura requerida (JSON puro):
{{
  "score": <int 0-5>,
  "indicaciones_correctas": <bool>,
  "menciona_efectos_adversos": <bool>,
  "comparaciones_sin_respaldo": [<str>],
  "afirmaciones_absolutas": [<str>],
  "fortaleza": <str>,
  "mejora": <str>
}}
REGLA DURA: Si hay promesas de resultado garantizado o afirmaciones off-label graves => score = 0 o 1.
""",

  "D5_estructura_narrativa": """
{base}
Evalúa si el pitch sigue una estructura narrativa efectiva: problema → evidencia → solución → llamado a la acción.
Estructura requerida (JSON puro):
{{
  "score": <int 0-5>,
  "abre_con_problema": <bool>,
  "presenta_evidencia_en_contexto": <bool>,
  "cierre_con_llamado_accion": <bool>,
  "maneja_objeciones_anticipadas": <bool>,
  "fortaleza": <str>,
  "mejora": <str>
}}
"""
}
```

> **Nota:** D3 (comunicación no verbal) se calcula desde el análisis de video con reglas deterministas, no con un prompt LLM (ver sección 4).

### 3e. Reemplazar `construir_scorecard()` en `main.py`

Encontrar la función `def construir_scorecard(` y **reemplazar la función completa** con:

```python
def construir_scorecard_med(resultados: dict, audiencia: str) -> dict:
    rubrica = _cargar_json("rubrica.json")
    dims_config = {d["id"]: d for d in rubrica["dimensiones"]}
    
    peso_key = "peso_paciente" if audiencia == "paciente" else "peso_institucion"
    
    scores = {}
    for dim_id in ["D1", "D2", "D4", "D5"]:
        modulo_key = [k for k in resultados if k.startswith(dim_id)][0] if any(k.startswith(dim_id) for k in resultados) else None
        if modulo_key:
            scores[dim_id] = resultados[modulo_key].get("data", {}).get("score", 0)
        else:
            scores[dim_id] = 0
    
    # D3 viene del análisis de video (determinista)
    scores["D3"] = resultados.get("D3_no_verbal", {}).get("score", 0)
    
    puntaje = 0
    for dim_id, cfg in dims_config.items():
        puntaje += scores.get(dim_id, 0) * 20 * cfg.get(peso_key, 0.2)
    puntaje = round(puntaje)
    
    # Límite duro: D4 regulatorio
    if scores.get("D4", 5) <= 1:
        puntaje = min(puntaje, 35)
    
    # Banda
    banda = "Insuficiente"
    for b in rubrica["bandas"]:
        if b["min"] <= puntaje <= b["max"]:
            banda = b["label"]
            break
    
    return {
        "puntaje_total": puntaje,
        "banda": banda,
        "scores_por_dimension": scores,
        "audiencia": audiencia
    }
```

### 3f. Agregar endpoint de transcripción en `main.py`

Agregar al final de `main.py`, antes del bloque `if __name__ == "__main__":`:

```python
@app.post("/transcribir")
async def transcribir_audio(
    file: UploadFile = File(...),
    audiencia: str = Form("paciente"),
    producto_id: str = Form("demo")
):
    """
    Recibe archivo de audio o video, devuelve transcripción y dispara análisis completo.
    Formatos soportados: .mp3, .mp4, .wav, .webm, .m4a
    """
    extension = os.path.splitext(file.filename)[-1].lower()
    if extension not in [".mp3", ".mp4", ".wav", ".webm", ".m4a", ".ogg"]:
        raise HTTPException(status_code=400, detail=f"Formato no soportado: {extension}")
    
    file_bytes = await file.read()
    
    try:
        resultado_transcripcion = transcribir(file_bytes, extension)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en transcripción: {str(e)}")
    
    return {
        "transcripcion": resultado_transcripcion,
        "audiencia": audiencia,
        "producto_id": producto_id,
        "siguiente_paso": "POST /analizar/pitchmed con el texto transcrito"
    }


@app.post("/analizar/pitchmed")
def analizar_pitchmed(req: AnalizarRequest):
    """
    Endpoint principal de PitchMed360.
    Recibe texto (transcripto o directo), audiencia y producto.
    Corre D1, D2, D4, D5 en paralelo. D3 se evalúa por separado si hay video.
    """
    metricas = calcular_metricas(req.texto)
    audiencia = req.escenario.interlocutor_id  # "paciente" | "institucion"
    
    modulos_activos = ["D1_evidencia_cientifica", "D2_claridad_lenguaje", 
                       "D4_cumplimiento_regulatorio", "D5_estructura_narrativa"]
    
    resultados = {"metricas": metricas}
    metadatos_dict = req.escenario.model_dump()
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        f2m = {
            executor.submit(ejecutar_modulo_med, modulo, req.texto, metadatos_dict, metricas, audiencia, req.api_key): modulo
            for modulo in modulos_activos
        }
        for future in concurrent.futures.as_completed(f2m):
            modulo = f2m[future]
            resultados[modulo] = future.result()
    
    resultados["scorecard"] = construir_scorecard_med(resultados, audiencia)
    return resultados


def ejecutar_modulo_med(modulo: str, texto: str, metadatos: dict, metricas: dict, audiencia: str, api_key: str = None) -> dict:
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return {"ok": False, "error": "API Key no configurada"}
    
    http_client = httpx.Client(verify=_SSL_VERIFY, timeout=90.0)
    client = anthropic.Anthropic(api_key=key, http_client=http_client)
    
    ficha = cargar_ficha(metadatos.get("medicamento_id", "demo"))
    interlocutor = cargar_interlocutor(metadatos.get("interlocutor_id", "paciente"))
    
    base = BASE_CONTEXTO.format(
        interlocutor_tipo=interlocutor.get("tipo", audiencia),
        medicamento=ficha.get("nombre_comercial", "No especificado"),
        interlocutor=interlocutor.get("nombre", audiencia),
        reto=metadatos.get("reto", "Presentar el producto de forma efectiva y compliant"),
        ficha_tecnica=json.dumps(ficha, ensure_ascii=False, indent=2),
        contexto_cobertura=json.dumps(ficha.get("contexto_cobertura", {}), ensure_ascii=False, indent=2),
        metricas=json.dumps(metricas, ensure_ascii=False, indent=2),
        texto=texto
    )
    
    prompt_template = PROMPTS_PITCHMED.get(modulo, "")
    prompt = prompt_template.format(base=base, audiencia_tipo=audiencia)
    
    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = response.content[0].text.strip().replace("```json", "").replace("```", "").strip()
        return {"ok": True, "data": json.loads(raw)}
    except Exception as e:
        return {"ok": False, "error": str(e)}
```

---

## 4. Análisis D3 (Comunicación No Verbal) — reglas deterministas

Este módulo NO usa LLM. Se calcula con señales extraídas del video si está disponible. Si solo hay audio, D3 se evalúa únicamente en base a variables de voz (velocidad, pausas).

### Agregar función `calcular_d3_no_verbal()` en `main.py`

```python
def calcular_d3_no_verbal(duracion_seg: float, palabras_total: int, tiene_video: bool = False) -> dict:
    """
    Calificación determinista de D3 basada en métricas de voz.
    Con video: el frontend puede enviar señales adicionales (contacto_visual_pct, postura).
    Sin video: evalúa solo ritmo y fluidez vocal.
    """
    score = 3  # baseline
    observaciones = []
    
    # Velocidad de habla (palabras por minuto)
    if duracion_seg > 0:
        wpm = (palabras_total / duracion_seg) * 60
        if 120 <= wpm <= 160:
            score += 1
            observaciones.append(f"Velocidad apropiada: {round(wpm)} ppm")
        elif wpm > 200:
            score -= 1
            observaciones.append(f"Habla demasiado rápido: {round(wpm)} ppm")
        elif wpm < 90:
            score -= 1
            observaciones.append(f"Ritmo muy lento: {round(wpm)} ppm")
    
    score = max(0, min(5, score))
    
    return {
        "score": score,
        "tiene_video": tiene_video,
        "observaciones": observaciones,
        "nota": "Evaluación completa de video disponible en versión con cámara activa"
    }
```

### Agregar endpoint D3 en `main.py`

```python
@app.post("/analizar/no-verbal")
def analizar_no_verbal(
    duracion_seg: float = Form(0),
    palabras_total: int = Form(0),
    tiene_video: bool = Form(False)
):
    return calcular_d3_no_verbal(duracion_seg, palabras_total, tiene_video)
```

---

## 5. Cambios en el frontend (`static/index.html` y `static/app.js`)

### 5a. En `static/index.html` — reemplazar el título del `<head>`

```html
<title>PitchMed360 - GovLab | Universidad de La Sabana</title>
```

### 5b. En `static/index.html` — agregar panel de captura antes del textarea existente

Encontrar el primer `<textarea` o el contenedor de input de texto, e insertar **antes** de él:

```html
<!-- PANEL DE CAPTURA PITCHMED360 -->
<div class="capture-panel" id="capture-panel">
  <h3 class="panel-title">📹 Cargar pitch</h3>
  
  <div class="capture-tabs">
    <button class="tab-btn active" data-tab="file">Subir archivo</button>
    <button class="tab-btn" data-tab="text">Texto directo</button>
  </div>

  <div class="tab-content" id="tab-file">
    <label class="upload-label" for="pitch-file">
      <i class="fa-solid fa-cloud-arrow-up"></i>
      <span id="upload-label-text">Arrastra o selecciona audio/video (.mp3, .mp4, .wav, .webm)</span>
    </label>
    <input type="file" id="pitch-file" accept=".mp3,.mp4,.wav,.webm,.m4a,.ogg" style="display:none">
    <div id="transcripcion-preview" class="transcripcion-preview" style="display:none">
      <strong>Transcripción:</strong>
      <p id="transcripcion-texto"></p>
      <small id="transcripcion-meta"></small>
    </div>
  </div>

  <div class="tab-content" id="tab-text" style="display:none">
    <!-- aquí va el textarea existente de entrada de texto -->
  </div>

  <div class="audiencia-selector">
    <label>Audiencia del pitch:</label>
    <select id="audiencia-select">
      <option value="paciente">Paciente</option>
      <option value="institucion">Institución (IPS / EPS)</option>
    </select>
  </div>

  <button class="btn-evaluar" id="btn-evaluar" disabled>
    <i class="fa-solid fa-microscope"></i> Evaluar pitch
  </button>
</div>
```

### 5c. En `static/app.js` — agregar lógica de upload y transcripción

Agregar al final del archivo `app.js`:

```javascript
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
  });
});

// Upload label click
document.querySelector('.upload-label').addEventListener('click', () => {
  pitchFileInput.click();
});

// File selected → upload to /transcribir
pitchFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  uploadLabel.textContent = `Transcribiendo "${file.name}"…`;
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

      transcripcionTexto.textContent = textoParaAnalizar.substring(0, 400) + (textoParaAnalizar.length > 400 ? '…' : '');
      transcripcionMeta.textContent = `Duración: ${duracionSeg}s · Palabras: ${palabrasTotal} · Idioma: ${data.transcripcion.idioma}`;
      transcripcionPreview.style.display = 'block';
      uploadLabel.textContent = `✓ ${file.name} transcrito`;
      btnEvaluar.disabled = false;
    }
  } catch (err) {
    uploadLabel.textContent = `Error: ${err.message}`;
  }
});

// Botón evaluar → POST /analizar/pitchmed
btnEvaluar.addEventListener('click', async () => {
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
    renderResultados(data); // función ya existente o adaptar la del repo actual
  } catch (err) {
    console.error(err);
  } finally {
    btnEvaluar.disabled = false;
    btnEvaluar.innerHTML = '<i class="fa-solid fa-microscope"></i> Evaluar pitch';
  }
});
```

### 5d. En `static/style.css` — agregar estilos del panel

Agregar al final de `style.css`:

```css
/* ─── PITCHMED360 CAPTURE PANEL ─── */
.capture-panel {
  background: var(--surface, #fff);
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.panel-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 1rem;
  color: #1B3A6B;
}

.capture-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.tab-btn {
  padding: 0.4rem 1rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 0.85rem;
}

.tab-btn.active {
  background: #1B3A6B;
  color: white;
  border-color: #1B3A6B;
}

.upload-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem;
  border: 2px dashed #ccc;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  color: #555;
  transition: border-color 0.2s;
}

.upload-label:hover {
  border-color: #1B3A6B;
}

.transcripcion-preview {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #f0f4fa;
  border-radius: 6px;
  font-size: 0.85rem;
  color: #333;
}

.audiencia-selector {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
  font-size: 0.9rem;
}

.audiencia-selector select {
  padding: 0.4rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 0.9rem;
}

.btn-evaluar {
  margin-top: 1rem;
  width: 100%;
  padding: 0.75rem;
  background: #1A7A4A;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-evaluar:hover:not(:disabled) {
  background: #145f38;
}

.btn-evaluar:disabled {
  background: #ccc;
  cursor: not-allowed;
}
```

---

## 6. Scorecard en el frontend — adaptar `renderResultados()`

La función `renderResultados()` existente en `app.js` espera la estructura del scorecard antiguo. Adaptar para que muestre el nuevo formato:

El nuevo `scorecard` tiene esta estructura:
```json
{
  "puntaje_total": 78,
  "banda": "Competente",
  "scores_por_dimension": {
    "D1": 4, "D2": 3, "D3": 3, "D4": 4, "D5": 3
  },
  "audiencia": "paciente"
}
```

En la función de render, cambiar el acceso de `data.scorecard.global` a `data.scorecard.puntaje_total` y `data.scorecard.dimensiones` a `data.scorecard.scores_por_dimension`.

---

## 7. Variable de entorno nueva (`.env.example`)

Agregar al `.env.example`:

```
# Modelo de Whisper a usar (base, small, medium). Base recomendado para Railway.
WHISPER_MODEL=base
```

Y en `transcriber.py`, leer esta variable:

```python
import os
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")
_model = None

def get_model():
    global _model
    if _model is None:
        _model = whisper.load_model(MODEL_SIZE)
    return _model
```

---

## 8. Orden de implementación recomendado para Antigravity

Ejecutar en este orden estricto — cada tarea es independiente y verificable:

1. **Tarea 1:** Actualizar `requirements.txt` con las 5 nuevas dependencias
2. **Tarea 2:** Crear `transcriber.py` en la raíz del proyecto
3. **Tarea 3:** Reemplazar `static/config/rubrica.json` con la nueva estructura de 5 dimensiones
4. **Tarea 4:** Agregar el tercer interlocutor ("institución") a `static/config/interlocutores.json`
5. **Tarea 5:** Reemplazar `PROMPTS` por `PROMPTS_PITCHMED` en `main.py` y agregar `PROMPTS_PITCHMED`
6. **Tarea 6:** Reemplazar `construir_scorecard()` por `construir_scorecard_med()` en `main.py`
7. **Tarea 7:** Agregar `calcular_d3_no_verbal()` en `main.py`
8. **Tarea 8:** Agregar los 3 nuevos endpoints en `main.py` (`/transcribir`, `/analizar/pitchmed`, `/analizar/no-verbal`)
9. **Tarea 9:** Actualizar el `<title>` y agregar el HTML del panel de captura en `index.html`
10. **Tarea 10:** Agregar el bloque JS de upload/transcripción al final de `app.js`
11. **Tarea 11:** Agregar los estilos CSS al final de `style.css`
12. **Tarea 12:** Adaptar `renderResultados()` en `app.js` para el nuevo formato de scorecard
13. **Tarea 13:** Agregar `WHISPER_MODEL` a `.env.example` y leerlo en `transcriber.py`

---

## 9. Verificación post-implementación

Una vez implementadas todas las tareas, verificar con:

```bash
# 1. El servidor arranca sin errores
uvicorn main:app --reload

# 2. El endpoint de transcripción responde
curl -X POST http://localhost:8000/transcribir \
  -F "file=@test.mp3" \
  -F "audiencia=paciente"

# 3. El análisis completo responde con scorecard de 5 dimensiones
curl -X POST http://localhost:8000/analizar/pitchmed \
  -H "Content-Type: application/json" \
  -d '{"texto":"El paciente presenta hipertensión resistente...","escenario":{"medicamento_id":"demo","interlocutor_id":"paciente"}}'
```

El scorecard de respuesta debe tener `puntaje_total` (0–100), `banda` y `scores_por_dimension` con claves D1–D5.

---

*Laboratorio de Gobierno · Universidad de La Sabana · Junio 2026*
