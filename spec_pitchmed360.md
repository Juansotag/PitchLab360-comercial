# Spec de Transformación: PitchLab360-comercial → PitchMed360
## Versión 2.0 — Consolidado

**Fecha:** Junio 2026  
**Para:** Antigravity  
**Repo base:** `https://github.com/Juansotag/PitchLab360-comercial`  
**Objetivo:** Convertir la Cabina de Defensa Clínica en una herramienta de evaluación de pitch médico con captura en vivo por cámara, análisis de comunicación no verbal via MediaPipe + Web Speech API, y evaluación LLM de 4 dimensiones textuales. Orientada a simposios farmacéuticos, cliente objetivo Boehringer Ingelheim Colombia.

---

## 0. Estado actual del repo

```
main.py                           ← Backend FastAPI (6 endpoints — varios se eliminan)
process_data.py                   ← Vacío, ignorar
static/index.html                 ← Frontend vanilla (225 líneas — reemplazar casi todo)
static/app.js                     ← Lógica frontend (reemplazar casi todo)
static/style.css                  ← Estilos (ampliar)
static/config/rubrica.json        ← Reemplazar
static/config/medicamentos.json   ← Conservar, ampliar después
static/config/interlocutores.json ← Ampliar con perfil institución
static/config/categorias.json     ← Conservar sin cambios
static/config/personas.json       ← ELIMINAR
static/config/stakeholders.json   ← ELIMINAR
assets/Govlab.png                 ← Conservar
assets/PitchLab360.jpg            ← Conservar
requirements.txt                  ← Ampliar
Procfile                          ← Modificar
.env.example                      ← Ampliar
```

**Arquitectura actual:** FastAPI + Anthropic SDK + textstat + ThreadPoolExecutor (3 workers). Input: texto plano. 5 endpoints de análisis LLM + 1 endpoint conversacional.

**Arquitectura objetivo:** FastAPI + Anthropic SDK + Whisper + textstat + ThreadPoolExecutor (4 workers). Input: cámara en vivo (principal) o archivo de audio. Frontend con MediaPipe + Web Speech API para D3 determinista. Sin módulo conversacional.

---

## TAREA 0 — Limpieza del repo (hacer primero, antes de cualquier otra tarea)

### 0a. Eliminar archivos

Borrar del repositorio:
- `static/config/personas.json`
- `static/config/stakeholders.json`

### 0b. Eliminar de `main.py`

Encontrar y eliminar los siguientes bloques completos:

**Eliminar el modelo `TurnoRequest`:**
```python
class TurnoRequest(BaseModel):
    historial: list
    interlocutor_id: str
    medicamento_id: str
    api_key: Optional[str] = None
```

**Eliminar la constante `SYSTEM_INTERLOCUTOR`:**
```python
SYSTEM_INTERLOCUTOR = """
{persona_prompt}
...
"""
```

**Eliminar el endpoint `/conversar` completo:**
```python
@app.post("/conversar")
def conversar(req: TurnoRequest):
    ...
```

**Eliminar los endpoints de análisis individuales del sistema anterior:**
```python
@app.post("/analizar/metrico")
def analizar_metrico(req: AnalizarRequest):
    ...

@app.post("/analizar/todo")
def analizar_todo(req: AnalizarRequest):
    ...

@app.post("/analizar/{modulo}")
def analizar_modulo(modulo: str, req: AnalizarRequest):
    ...
```

**Eliminar la variable `PESOS` y `PROMPTS` del sistema anterior:**
```python
PESOS = {
  "auditor_eps": {...},
  "paciente_dudoso": {...},
}

PROMPTS = {
  "exactitud_evidencia": ...,
  ...
}
```

**Eliminar la función `construir_scorecard()` del sistema anterior:**
```python
def construir_scorecard(resultados: dict, interlocutor_id: str) -> dict:
    ...
```

**Eliminar la función `ejecutar_modulo()` del sistema anterior:**
```python
def ejecutar_modulo(modulo: str, texto: str, metadatos: dict, metricas: dict, api_key: str = None) -> dict:
    ...
```

### 0c. Eliminar de `static/index.html`

Eliminar cualquier sección del HTML que referencie:
- El simulador conversacional (chat de turnos con interlocutor)
- El panel de YouTube / limpieza de subtítulos
- El módulo `/limpiar-texto`
- Referencias a `personas.json` o `stakeholders.json`

Conservar: estructura base HTML, imports de fuentes y FontAwesome, el sidebar con logo, el contenedor principal vacío (se reescribe en Tarea 9).

### 0d. Eliminar de `static/app.js`

Eliminar toda la lógica de:
- El chat conversacional (envío de turnos, render de mensajes)
- La limpieza de texto de YouTube
- Cualquier referencia a `TurnoRequest` o `/conversar`

Conservar: la función `renderResultados()` (se adapta en Tarea 12).

---

## TAREA 1 — Actualizar `requirements.txt`

Agregar al final (NO eliminar las líneas existentes):

```
openai-whisper
ffmpeg-python
torch
numpy
fpdf2
```

> **Nota Railway:** `torch` incrementa el build time a ~8 minutos. Agregar en el `Procfile` el flag `--timeout 180` al comando uvicorn.

**`Procfile` actualizado:**
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT --timeout-keep-alive 180
```

---

## TAREA 2 — Crear `transcriber.py` en la raíz

Archivo nuevo, crear desde cero:

```python
# transcriber.py
import whisper
import tempfile
import os

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")
_model = None

def get_model():
    global _model
    if _model is None:
        _model = whisper.load_model(MODEL_SIZE)
    return _model

def transcribir(file_bytes: bytes, extension: str) -> dict:
    """
    Recibe bytes del archivo y su extensión (.mp3, .mp4, .wav, .webm, .m4a, .ogg).
    Devuelve {"texto": str, "idioma": str, "duracion_seg": float}
    """
    model = get_model()
    with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name
    try:
        result = model.transcribe(tmp_path, language="es", verbose=False)
        segments = result.get("segments", [])
        duracion = segments[-1].get("end", 0) if segments else 0
        return {
            "texto": result["text"].strip(),
            "idioma": result.get("language", "es"),
            "duracion_seg": round(duracion, 1)
        }
    finally:
        os.unlink(tmp_path)
```

---

## TAREA 3 — Reemplazar `static/config/rubrica.json`

Contenido exacto (reemplaza el archivo completo):

```json
{
  "dimensiones": [
    {
      "id": "D1",
      "nombre": "Precisión Científica y Evidencia Clínica",
      "peso_paciente": 0.20,
      "peso_institucion": 0.25,
      "limite_duro": false,
      "requiere_video": false
    },
    {
      "id": "D2",
      "nombre": "Claridad y Lenguaje según Audiencia",
      "peso_paciente": 0.25,
      "peso_institucion": 0.20,
      "limite_duro": false,
      "requiere_video": false
    },
    {
      "id": "D3",
      "nombre": "Comunicación No Verbal",
      "peso_paciente": 0.20,
      "peso_institucion": 0.15,
      "limite_duro": false,
      "requiere_video": true
    },
    {
      "id": "D4",
      "nombre": "Cumplimiento Regulatorio INVIMA/Fedesalud",
      "peso_paciente": 0.15,
      "peso_institucion": 0.20,
      "limite_duro": true,
      "requiere_video": false
    },
    {
      "id": "D5",
      "nombre": "Estructura Narrativa del Pitch",
      "peso_paciente": 0.20,
      "peso_institucion": 0.20,
      "limite_duro": false,
      "requiere_video": false
    }
  ],
  "regla_limite_duro": "Si D4 score <= 1, el puntaje global se topa en 35/100.",
  "regla_sin_video": "Si D3 no está disponible (sin cámara), redistribuir su peso proporcionalmente entre D1, D2, D4 y D5.",
  "bandas": [
    {"min": 85, "max": 100, "label": "Destacado",     "color": "#1A7A4A"},
    {"min": 70, "max": 84,  "label": "Competente",    "color": "#B8860B"},
    {"min": 55, "max": 69,  "label": "En desarrollo", "color": "#CC5500"},
    {"min": 0,  "max": 54,  "label": "Insuficiente",  "color": "#CC0000"}
  ]
}
```

---

## TAREA 4 — Ampliar `static/config/interlocutores.json`

Abrir el archivo. Encontrar el `]` de cierre del array `"interlocutores"` e insertar antes de él:

```json
,
{
  "id": "institucion",
  "tipo": "institucion",
  "nombre": "Comité de Farmacia / IPS",
  "tiempo_min": 7,
  "objeciones_tipicas": [
    "¿cuál es el costo por paciente vs. la alternativa del formulario?",
    "¿hay estudios head-to-head con el medicamento que ya usamos?",
    "¿aplica para el perfil epidemiológico de nuestra institución?",
    "¿cuál es el NNT reportado en el estudio pivotal?"
  ]
}
```

> El campo `system_prompt` se elimina de todos los perfiles — ya no hay módulo conversacional.

---

## TAREA 5 — Agregar imports y constantes nuevas en `main.py`

### 5a. Agregar imports al bloque de imports existente

```python
from fastapi import File, UploadFile, Form
from transcriber import transcribir as transcribir_audio
```

### 5b. Agregar después de las funciones `cargar_ficha()` y `cargar_interlocutor()` existentes

```python
# --- PROMPTS PITCHMED360 ---
PROMPTS_PITCHMED = {
  "D1_evidencia_cientifica": """
{base}
Evalúa la precisión científica del pitch. Contrasta cada afirmación clínica contra la ficha técnica del producto.
No uses conocimiento externo: si no está en la ficha, es sin_respaldo.
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
Evalúa si el lenguaje está calibrado para la audiencia declarada: {audiencia_tipo}.
Para paciente: ¿evitó jerga sin explicar? ¿usó analogías cotidianas? ¿verificó comprensión?
Para institución: ¿usó terminología técnica precisa? ¿habló de costo-efectividad?
Estructura requerida (JSON puro, sin markdown):
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
Estructura requerida (JSON puro, sin markdown):
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
Estructura requerida (JSON puro, sin markdown):
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

---

## TAREA 6 — Agregar funciones nuevas en `main.py`

Agregar después del bloque `PROMPTS_PITCHMED`:

### 6a. Ejecutor de módulos PitchMed

```python
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
        reto=metadatos.get("reto", "Presentar el producto de forma efectiva y con cumplimiento regulatorio"),
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

### 6b. Calculador D3 determinista

```python
def calcular_d3_no_verbal(metricas_no_verbal: dict) -> dict:
    """
    Calcula D3 a partir de métricas enviadas por el frontend (MediaPipe + Web Speech).
    metricas_no_verbal esperado:
    {
      "contacto_visual_pct": float,   # % de frames con mirada a cámara (MediaPipe iris)
      "postura": str,                 # "abierta" | "cerrada" | "mixta" (MediaPipe pose)
      "gestos": str,                  # "ilustrativos" | "reguladores" | "ninguno" (MediaPipe hands)
      "velocidad_ppm": float,         # palabras por minuto (Web Speech timestamps)
      "fillers_pct": float,           # % de palabras que son fillers (Web Speech transcript)
      "tiene_video": bool
    }
    """
    if not metricas_no_verbal.get("tiene_video", False):
        return {
            "score": None,
            "disponible": False,
            "nota": "D3 requiere cámara activa. Activar el modo de grabación en vivo para evaluar comunicación no verbal."
        }

    score = 3
    observaciones = []

    # Contacto visual (peso: 35%)
    cv = metricas_no_verbal.get("contacto_visual_pct", 0)
    if cv >= 70:
        score += 1
        observaciones.append(f"Contacto visual alto: {round(cv)}% del tiempo mirando a cámara")
    elif cv < 40:
        score -= 1
        observaciones.append(f"Contacto visual bajo: {round(cv)}% del tiempo mirando a cámara")

    # Postura (peso: 25%)
    postura = metricas_no_verbal.get("postura", "mixta")
    if postura == "abierta":
        score += 0.5
        observaciones.append("Postura abierta y receptiva")
    elif postura == "cerrada":
        score -= 0.5
        observaciones.append("Postura cerrada — brazos cruzados o cuerpo retraído")

    # Gestos (peso: 20%)
    gestos = metricas_no_verbal.get("gestos", "ninguno")
    if gestos == "ilustrativos":
        score += 0.5
        observaciones.append("Gestos ilustrativos que refuerzan el mensaje")
    elif gestos == "reguladores":
        observaciones.append("Gestos reguladores frecuentes — pueden distraer")

    # Velocidad de habla (peso: 15%)
    ppm = metricas_no_verbal.get("velocidad_ppm", 0)
    if 120 <= ppm <= 160:
        score += 0.5
        observaciones.append(f"Velocidad apropiada: {round(ppm)} palabras/minuto")
    elif ppm > 200:
        score -= 0.5
        observaciones.append(f"Habla demasiado rápido: {round(ppm)} palabras/minuto")
    elif 0 < ppm < 90:
        score -= 0.5
        observaciones.append(f"Ritmo muy lento: {round(ppm)} palabras/minuto")

    # Fillers (peso: 5%)
    fillers = metricas_no_verbal.get("fillers_pct", 0)
    if fillers > 5:
        score -= 0.5
        observaciones.append(f"Uso excesivo de muletillas: {round(fillers, 1)}% de las palabras")

    score = round(max(0, min(5, score)))

    return {
        "score": score,
        "disponible": True,
        "observaciones": observaciones,
        "metricas_raw": metricas_no_verbal
    }
```

### 6c. Constructor de scorecard

```python
def construir_scorecard_med(resultados: dict, audiencia: str, tiene_video: bool) -> dict:
    rubrica = _cargar_json("rubrica.json")
    dims_config = {d["id"]: d for d in rubrica["dimensiones"]}

    peso_key = "peso_paciente" if audiencia == "paciente" else "peso_institucion"

    scores = {}
    for dim_id in ["D1", "D2", "D4", "D5"]:
        modulo_key = next((k for k in resultados if k.startswith(dim_id)), None)
        scores[dim_id] = resultados[modulo_key].get("data", {}).get("score", 0) if modulo_key else 0

    d3 = resultados.get("D3_no_verbal", {})
    scores["D3"] = d3.get("score") if d3.get("disponible") else None

    # Redistribuir pesos si D3 no está disponible
    if scores["D3"] is None:
        peso_d3 = dims_config["D3"].get(peso_key, 0)
        dims_activas = ["D1", "D2", "D4", "D5"]
        total_peso_activo = sum(dims_config[d].get(peso_key, 0) for d in dims_activas)
        pesos_efectivos = {
            d: dims_config[d].get(peso_key, 0) + (dims_config[d].get(peso_key, 0) / total_peso_activo) * peso_d3
            for d in dims_activas
        }
    else:
        pesos_efectivos = {d: dims_config[d].get(peso_key, 0) for d in dims_config}

    puntaje = 0
    for dim_id, peso in pesos_efectivos.items():
        s = scores.get(dim_id)
        if s is not None:
            puntaje += s * 20 * peso
    puntaje = round(puntaje)

    # Límite duro D4
    if scores.get("D4", 5) <= 1:
        puntaje = min(puntaje, 35)

    banda = next(
        (b["label"] for b in rubrica["bandas"] if b["min"] <= puntaje <= b["max"]),
        "Insuficiente"
    )

    return {
        "puntaje_total": puntaje,
        "banda": banda,
        "scores_por_dimension": scores,
        "audiencia": audiencia,
        "d3_disponible": tiene_video
    }
```

---

## TAREA 7 — Agregar endpoints nuevos en `main.py`

Agregar antes del bloque `if __name__ == "__main__":`:

```python
# ─── ENDPOINTS PITCHMED360 ───────────────────────────────────────────────────

@app.post("/transcribir")
async def endpoint_transcribir(
    file: UploadFile = File(...),
    audiencia: str = Form("paciente"),
    producto_id: str = Form("demo")
):
    """Recibe archivo de audio/video, devuelve transcripción."""
    extension = os.path.splitext(file.filename)[-1].lower()
    formatos = [".mp3", ".mp4", ".wav", ".webm", ".m4a", ".ogg"]
    if extension not in formatos:
        raise HTTPException(status_code=400, detail=f"Formato no soportado: {extension}")

    file_bytes = await file.read()
    try:
        resultado = transcribir_audio(file_bytes, extension)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en transcripción: {str(e)}")

    return {
        "transcripcion": resultado,
        "audiencia": audiencia,
        "producto_id": producto_id
    }


@app.post("/analizar/pitchmed")
def endpoint_analizar_pitchmed(req: AnalizarRequest):
    """
    Endpoint principal. Recibe texto + métricas no verbales opcionales.
    Corre D1, D2, D4, D5 en paralelo con LLM. D3 es determinista desde métricas del frontend.
    """
    metricas_texto = calcular_metricas(req.texto)
    audiencia = req.escenario.interlocutor_id
    metadatos = req.escenario.model_dump()

    # D3: métricas no verbales vienen en el campo `reto` como JSON si tiene_video=True
    # El frontend las empaqueta así: reto = json.dumps(metricas_no_verbal) si hay video
    metricas_no_verbal = {}
    tiene_video = False
    try:
        candidato = json.loads(metadatos.get("reto", "{}"))
        if "tiene_video" in candidato:
            metricas_no_verbal = candidato
            tiene_video = candidato.get("tiene_video", False)
            metadatos["reto"] = "Presentar el producto de forma efectiva y con cumplimiento regulatorio"
    except (json.JSONDecodeError, TypeError):
        pass

    resultados = {"metricas": metricas_texto}
    modulos = ["D1_evidencia_cientifica", "D2_claridad_lenguaje",
               "D4_cumplimiento_regulatorio", "D5_estructura_narrativa"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(ejecutar_modulo_med, m, req.texto, metadatos, metricas_texto, audiencia, req.api_key): m
            for m in modulos
        }
        for future in concurrent.futures.as_completed(futures):
            resultados[futures[future]] = future.result()

    resultados["D3_no_verbal"] = calcular_d3_no_verbal(
        {**metricas_no_verbal, "tiene_video": tiene_video}
    )
    resultados["scorecard"] = construir_scorecard_med(resultados, audiencia, tiene_video)
    return resultados
```

---

## TAREA 8 — Actualizar `.env.example`

Agregar al final:

```
# Modelo Whisper: base (rápido), small (más preciso), medium (lento, alta RAM)
WHISPER_MODEL=base
```

---

## TAREA 9 — Reescribir `static/index.html`

Conservar: el `<head>` completo con todos los imports de fuentes, FontAwesome y CSS.  
Conservar: el sidebar con logo y estructura `.app-container`.  
Reemplazar: todo el contenido del `<main>` o área de trabajo con:

```html
<!-- PANEL PRINCIPAL PITCHMED360 -->
<main class="main-content">

  <!-- PASO 1: CONFIGURACIÓN -->
  <section class="pm-section" id="sec-config">
    <h2 class="pm-section-title">Configuración del pitch</h2>
    <div class="pm-row">
      <div class="pm-field">
        <label>Producto</label>
        <select id="producto-select">
          <option value="demo">Ejemplo XR (demo)</option>
        </select>
      </div>
      <div class="pm-field">
        <label>Audiencia</label>
        <select id="audiencia-select">
          <option value="paciente">Paciente</option>
          <option value="institucion">Institución (IPS / EPS)</option>
        </select>
      </div>
    </div>
  </section>

  <!-- PASO 2: CAPTURA -->
  <section class="pm-section" id="sec-captura">
    <h2 class="pm-section-title">Captura del pitch</h2>

    <div class="capture-tabs">
      <button class="tab-btn active" data-tab="camara">
        <i class="fa-solid fa-camera"></i> Cámara en vivo
      </button>
      <button class="tab-btn" data-tab="archivo">
        <i class="fa-solid fa-file-audio"></i> Subir archivo
      </button>
      <button class="tab-btn" data-tab="texto">
        <i class="fa-solid fa-keyboard"></i> Texto directo
      </button>
    </div>

    <!-- TAB: CÁMARA EN VIVO (principal) -->
    <div class="tab-content active" id="tab-camara">
      <div class="camera-container">
        <video id="video-preview" autoplay muted playsinline></video>
        <canvas id="mediapipe-canvas"></canvas>
        <div class="camera-overlay" id="camera-overlay">
          <span>Cámara inactiva</span>
        </div>
      </div>

      <div class="camera-stats" id="camera-stats" style="display:none">
        <div class="stat-pill" id="stat-cv">👁 Contacto visual: --</div>
        <div class="stat-pill" id="stat-postura">🧍 Postura: --</div>
        <div class="stat-pill" id="stat-ppm">💬 -- ppm</div>
        <div class="stat-pill" id="stat-fillers">Fillers: --%</div>
      </div>

      <div class="camera-controls">
        <button class="btn-secondary" id="btn-iniciar-camara">
          <i class="fa-solid fa-video"></i> Iniciar cámara
        </button>
        <button class="btn-primary" id="btn-grabar" disabled>
          <i class="fa-solid fa-circle-dot"></i> Iniciar grabación
        </button>
        <button class="btn-danger" id="btn-detener" disabled>
          <i class="fa-solid fa-stop"></i> Detener y evaluar
        </button>
      </div>

      <div id="transcripcion-live" class="transcripcion-preview" style="display:none">
        <strong>Transcripción en vivo:</strong>
        <p id="transcripcion-live-texto"></p>
      </div>
    </div>

    <!-- TAB: SUBIR ARCHIVO -->
    <div class="tab-content" id="tab-archivo">
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
      <p class="pm-note">
        <i class="fa-solid fa-circle-info"></i>
        Al subir archivo, D3 (comunicación no verbal) no estará disponible. Se redistribuirán los pesos entre las demás dimensiones.
      </p>
    </div>

    <!-- TAB: TEXTO DIRECTO -->
    <div class="tab-content" id="tab-texto">
      <textarea id="texto-directo" rows="10" placeholder="Pega o escribe aquí el texto del pitch..."></textarea>
      <p class="pm-note">
        <i class="fa-solid fa-circle-info"></i>
        Con texto directo, D3 no está disponible.
      </p>
    </div>
  </section>

  <!-- BOTÓN EVALUAR -->
  <button class="btn-evaluar" id="btn-evaluar" disabled>
    <i class="fa-solid fa-microscope"></i> Evaluar pitch
  </button>

  <!-- RESULTADOS -->
  <section class="pm-section" id="sec-resultados" style="display:none">
    <h2 class="pm-section-title">Resultados</h2>
    <div id="resultados-container"></div>
  </section>

</main>
```

---

## TAREA 10 — Reescribir `static/app.js`

Reemplazar el contenido completo del archivo con:

```javascript
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
  palabrasLive: [],
  fillers: ['eh', 'eeh', 'uhm', 'mm', 'mmm', 'este', 'osea', 'o sea', 'pues', 'bueno'],
  inicioGrabacion: null,
  holisticModel: null,
  contactoFrames: [],
  posturaFrames: [],
  gestosFrames: []
};

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
    await iniciarMediaPipe();
  } catch (err) {
    alert('No se pudo acceder a la cámara: ' + err.message);
  }
}

async function iniciarMediaPipe() {
  // Carga MediaPipe Holistic desde CDN
  const { Holistic } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/holistic.js');
  const holistic = new Holistic({
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
  const ctx = canvas.getContext('2d');

  async function loop() {
    if (state.mediaStream) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      await holistic.send({ image: video });
    }
    requestAnimationFrame(loop);
  }
  loop();
}

function procesarResultadosMediaPipe(results) {
  if (!state.grabando) return;

  // Contacto visual: detectar si iris mira hacia la cámara
  // MediaPipe Face Mesh landmarks 468-472 son los iris
  const face = results.faceLandmarks;
  let mirandoCamara = false;
  if (face && face[468] && face[473]) {
    const irisIzq = face[468];
    const irisDer = face[473];
    // Si el promedio x de los iris está entre 0.4 y 0.6, mira al centro (cámara)
    const promedioX = (irisIzq.x + irisDer.x) / 2;
    mirandoCamara = promedioX > 0.35 && promedioX < 0.65;
  }
  state.contactoFrames.push(mirandoCamara ? 1 : 0);

  // Postura: landmark 11 (hombro izq) y 12 (hombro der) de pose
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
  const gestosMode = state.gestosFrames.filter(v => v === 'ilustrativos').length > state.gestosFrames.length * 0.3 ? 'ilustrativos' : 'ninguno';

  document.getElementById('stat-cv').textContent = `👁 Contacto visual: ${cvPct}%`;
  document.getElementById('stat-postura').textContent = `🧍 Postura: ${posturaMode}`;

  if (state.palabrasLive.length > 0 && state.inicioGrabacion) {
    const seg = (Date.now() - state.inicioGrabacion) / 1000;
    const ppm = Math.round((state.palabrasLive.length / seg) * 60);
    document.getElementById('stat-ppm').textContent = `💬 ${ppm} ppm`;
  }
}

function iniciarWebSpeech() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.warn('Web Speech API no disponible en este browser');
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'es-CO';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let transcripcionParcial = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const texto = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        state.transcripcionLive += texto + ' ';
        const palabras = texto.toLowerCase().split(/\s+/).filter(Boolean);
        state.palabrasLive.push(...palabras);
      } else {
        transcripcionParcial = texto;
      }
    }
    const display = (state.transcripcionLive + transcripcionParcial).slice(-300);
    document.getElementById('transcripcion-live-texto').textContent = '...' + display;
    document.getElementById('transcripcion-live').style.display = 'block';
  };

  recognition.onerror = (e) => console.warn('Speech error:', e.error);
  recognition.onend = () => { if (state.grabando) recognition.start(); };
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
  state.textoAnalizar = state.transcripcionLive.trim();
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
  state.palabrasLive = [];
  document.getElementById('camera-stats').style.display = 'flex';
  document.getElementById('btn-grabar').disabled = true;
  document.getElementById('btn-detener').disabled = false;
  iniciarWebSpeech();
});

document.getElementById('btn-detener').addEventListener('click', () => {
  state.grabando = false;
  if (state.recognition) state.recognition.stop();
  finalizarMetricasNoVerbal();
  document.getElementById('btn-detener').disabled = true;
  document.getElementById('btn-evaluar').disabled = false;
  document.getElementById('btn-evaluar').textContent = 'Evaluar pitch';
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
    }
  } catch (err) {
    label.textContent = `Error: ${err.message}`;
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
  } catch (err) {
    alert('Error al evaluar: ' + err.message);
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
    <div class="scorecard-header" style="border-left: 4px solid ${colorBanda[sc.banda] || '#888'}">
      <div class="scorecard-puntaje">${sc.puntaje_total}<span>/100</span></div>
      <div class="scorecard-banda" style="color: ${colorBanda[sc.banda] || '#888'}">${sc.banda}</div>
      <div class="scorecard-audiencia">Audiencia: ${sc.audiencia === 'paciente' ? 'Paciente' : 'Institución'}</div>
      ${!sc.d3_disponible ? '<div class="scorecard-nota">⚠ D3 no evaluado — grabación sin cámara</div>' : ''}
    </div>

    <div class="dims-grid">
  `;

  for (const [dimId, modData] of Object.entries(modulos)) {
    const score = sc.scores_por_dimension[dimId];
    const disponible = score !== null;
    const scoreDisplay = disponible ? score : 'N/A';
    const barPct = disponible ? (score / 5) * 100 : 0;

    let detalles = '';
    if (dimId === 'D3' && modData) {
      detalles = (modData.observaciones || []).map(o => `<li>${o}</li>`).join('');
    } else if (modData) {
      if (modData.fortaleza) detalles += `<li><strong>Fortaleza:</strong> ${modData.fortaleza}</li>`;
      if (modData.mejora)    detalles += `<li><strong>Mejora:</strong> ${modData.mejora}</li>`;
    }

    html += `
      <div class="dim-card">
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
```

---

## TAREA 11 — Agregar estilos en `static/style.css`

Agregar al final del archivo:

```css
/* ─── PITCHMED360 ─────────────────────────────────────────── */
.main-content { padding: 1.5rem; max-width: 860px; }

.pm-section { margin-bottom: 2rem; }
.pm-section-title { font-size: 1rem; font-weight: 700; color: #1B3A6B; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
.pm-row { display: flex; gap: 1rem; }
.pm-field { display: flex; flex-direction: column; gap: 0.4rem; flex: 1; font-size: 0.9rem; }
.pm-field select { padding: 0.4rem 0.75rem; border: 1px solid #ccc; border-radius: 6px; font-size: 0.9rem; }
.pm-note { font-size: 0.82rem; color: #888; margin-top: 0.75rem; }

/* Tabs */
.capture-tabs { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; }
.tab-btn { padding: 0.45rem 1rem; border: 1px solid #ccc; border-radius: 6px; background: white; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; }
.tab-btn.active { background: #1B3A6B; color: white; border-color: #1B3A6B; }
.tab-content { display: none; }
.tab-content.active { display: block; }

/* Cámara */
.camera-container { position: relative; width: 100%; aspect-ratio: 16/9; background: #111; border-radius: 10px; overflow: hidden; margin-bottom: 0.75rem; }
.camera-container video, .camera-container canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
.camera-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 0.9rem; background: rgba(0,0,0,0.5); }
.camera-stats { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
.stat-pill { background: #f0f4fa; border-radius: 999px; padding: 0.3rem 0.8rem; font-size: 0.8rem; color: #1B3A6B; font-weight: 600; }
.camera-controls { display: flex; gap: 0.75rem; margin-bottom: 0.75rem; }

/* Botones */
.btn-primary { padding: 0.5rem 1.25rem; background: #1B3A6B; color: white; border: none; border-radius: 7px; cursor: pointer; font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem; }
.btn-secondary { padding: 0.5rem 1.25rem; background: white; color: #1B3A6B; border: 1px solid #1B3A6B; border-radius: 7px; cursor: pointer; font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem; }
.btn-danger { padding: 0.5rem 1.25rem; background: #CC0000; color: white; border: none; border-radius: 7px; cursor: pointer; font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem; }
.btn-primary:disabled, .btn-secondary:disabled, .btn-danger:disabled { opacity: 0.4; cursor: not-allowed; }

/* Upload */
.upload-label { display: flex; align-items: center; gap: 0.75rem; padding: 1.5rem; border: 2px dashed #ccc; border-radius: 8px; cursor: pointer; font-size: 0.9rem; color: #555; transition: border-color 0.2s; }
.upload-label:hover { border-color: #1B3A6B; }

/* Transcripción preview */
.transcripcion-preview { margin-top: 0.75rem; padding: 0.75rem; background: #f0f4fa; border-radius: 6px; font-size: 0.85rem; }

/* Botón evaluar */
.btn-evaluar { width: 100%; padding: 0.85rem; background: #1A7A4A; color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: 700; cursor: pointer; margin-bottom: 2rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: background 0.2s; }
.btn-evaluar:hover:not(:disabled) { background: #145f38; }
.btn-evaluar:disabled { background: #ccc; cursor: not-allowed; }

/* Resultados */
.scorecard-header { padding: 1.25rem 1.5rem; background: #f9f9f9; border-radius: 10px; margin-bottom: 1.5rem; }
.scorecard-puntaje { font-size: 3rem; font-weight: 800; color: #1B3A6B; line-height: 1; }
.scorecard-puntaje span { font-size: 1.2rem; color: #999; }
.scorecard-banda { font-size: 1.1rem; font-weight: 700; margin-top: 0.25rem; }
.scorecard-audiencia { font-size: 0.85rem; color: #888; margin-top: 0.25rem; }
.scorecard-nota { font-size: 0.82rem; color: #CC5500; margin-top: 0.5rem; }

.dims-grid { display: flex; flex-direction: column; gap: 1rem; }
.dim-card { background: white; border: 1px solid #e5e5e5; border-radius: 8px; padding: 1rem 1.25rem; }
.dim-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
.dim-id { font-size: 0.75rem; font-weight: 800; color: white; background: #1B3A6B; padding: 0.15rem 0.5rem; border-radius: 4px; }
.dim-nombre { flex: 1; font-size: 0.9rem; font-weight: 600; color: #333; }
.dim-score { font-size: 1rem; font-weight: 700; color: #1B3A6B; }
.dim-bar { height: 6px; background: #eee; border-radius: 3px; margin-bottom: 0.75rem; }
.dim-bar-fill { height: 100%; background: #1A7A4A; border-radius: 3px; transition: width 0.6s ease; }
.dim-detalles { font-size: 0.83rem; color: #555; padding-left: 1.25rem; margin: 0; line-height: 1.7; }
```

---

## TAREA 12 — Actualizar `.env.example`

Agregar al final:

```
# Modelo Whisper: base (rápido, <1GB RAM), small (más preciso, ~2GB RAM)
WHISPER_MODEL=base
```

---

## Orden de ejecución para Antigravity

Ejecutar una tarea a la vez en este orden estricto. Verificar que el servidor arranca después de cada tarea backend:

| # | Tarea | Archivos tocados | Verificación |
|---|---|---|---|
| 0 | Limpieza del repo | `main.py`, `index.html`, `app.js`, 2 JSON eliminados | `uvicorn main:app` arranca sin errores |
| 1 | requirements + Procfile | `requirements.txt`, `Procfile` | `pip install -r requirements.txt` sin errores |
| 2 | Crear `transcriber.py` | `transcriber.py` (nuevo) | `python -c "from transcriber import transcribir; print('ok')"` |
| 3 | Nueva `rubrica.json` | `static/config/rubrica.json` | JSON válido |
| 4 | Ampliar `interlocutores.json` | `static/config/interlocutores.json` | JSON válido |
| 5 | Agregar prompts y constantes en `main.py` | `main.py` | Servidor arranca |
| 6 | Agregar funciones nuevas en `main.py` | `main.py` | Servidor arranca |
| 7 | Agregar endpoints nuevos en `main.py` | `main.py` | `GET /docs` muestra `/transcribir` y `/analizar/pitchmed` |
| 8 | Actualizar `.env.example` | `.env.example` | — |
| 9 | Reescribir `index.html` | `static/index.html` | Browser muestra los 3 tabs |
| 10 | Reescribir `app.js` | `static/app.js` | Consola sin errores JS |
| 11 | Agregar CSS | `static/style.css` | UI se ve correcta |
| 12 | Actualizar `.env.example` | `.env.example` | — |

---

## Verificación post-implementación completa

```bash
# 1. Servidor arranca
uvicorn main:app --reload

# 2. Endpoint transcripción (requiere archivo de prueba)
curl -X POST http://localhost:8000/transcribir \
  -F "file=@test.mp3" \
  -F "audiencia=paciente"
# Esperado: {"transcripcion": {"texto": "...", "idioma": "es", "duracion_seg": ...}}

# 3. Endpoint análisis sin video
curl -X POST http://localhost:8000/analizar/pitchmed \
  -H "Content-Type: application/json" \
  -d '{"texto":"Buenos días. Quiero contarle sobre empagliflozina...","escenario":{"medicamento_id":"demo","interlocutor_id":"paciente","reto":""}}'
# Esperado: scorecard con puntaje_total, banda, scores D1-D5 (D3: null)

# 4. Endpoint análisis con métricas de video simuladas
curl -X POST http://localhost:8000/analizar/pitchmed \
  -H "Content-Type: application/json" \
  -d '{"texto":"Buenos días...","escenario":{"medicamento_id":"demo","interlocutor_id":"paciente","reto":"{\"tiene_video\":true,\"contacto_visual_pct\":72,\"postura\":\"abierta\",\"gestos\":\"ilustrativos\",\"velocidad_ppm\":138,\"fillers_pct\":1.2}"}}'
# Esperado: scorecard con D3 score numérico disponible
```

---

## Notas de compatibilidad de browser para MediaPipe

MediaPipe Holistic requiere WebAssembly y acceso a cámara. Compatible con:
- Chrome 88+ (recomendado)
- Edge 88+
- Firefox 89+ (requiere habilitar `dom.workers.modules.enabled` en about:config)
- Safari 15.4+

Para el demo con Boehringer, recomendar Chrome en laptop. No mobile por restricciones de WASM en algunos iOS.

---

*Laboratorio de Gobierno · Universidad de La Sabana · Junio 2026 · v2.0*