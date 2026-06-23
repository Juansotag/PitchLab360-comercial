from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import os
import tempfile
from transcriber import transcribir as transcribir_audio


# Fix Anaconda Fortran MKL crash on Windows when pressing Ctrl+C
os.environ["FOR_DISABLE_CONSOLE_CTRL_HANDLER"] = "1"

import anthropic
import httpx
import textstat
textstat.set_lang('es')
from collections import Counter
import json
import re
from typing import Dict, Any, Optional
import concurrent.futures
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# SSL verification: set DISABLE_SSL_VERIFY=true in .env only for corporate proxies
_SSL_VERIFY = os.environ.get('DISABLE_SSL_VERIFY', 'false').lower() != 'true'

app = FastAPI(title="PitchLab360")

# Mount directories for static files and assets
app.mount("/static", StaticFiles(directory="static"), name="static")

# Make sure assets directory is mounted, so we can access images
if os.path.exists("assets"):
    app.mount("/assets", StaticFiles(directory="assets"), name="assets")

@app.get("/", response_class=HTMLResponse)
async def get_index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content, status_code=200)

# --- MODELS ---
class CleanRequest(BaseModel):
    texto: str
    api_key: Optional[str] = None

class EscenarioModel(BaseModel):
    medicamento_id: str = "demo"
    interlocutor_id: str = "auditor_eps"
    reto: Optional[str] = "Negar la autorización por costo"
    tiempo_min: Optional[int] = 5
    ficha_custom: Optional[str] = None  # Texto libre de contexto del producto/escenario

class AnalizarRequest(BaseModel):
    texto: str
    escenario: EscenarioModel
    api_key: Optional[str] = None

class TurnoRequest(BaseModel):
    historial: list
    interlocutor_id: str
    medicamento_id: str
    api_key: Optional[str] = None

# --- CONFIGURACIONES ---
def _cargar_json(nombre: str) -> dict:
    with open(f"static/config/{nombre}", "r", encoding="utf-8") as f:
        return json.load(f)

def cargar_ficha(medicamento_id: str) -> dict:
    meds = _cargar_json("medicamentos.json").get("medicamentos", [])
    return next((m for m in meds if m["id"] == medicamento_id), meds[0] if meds else {})

def cargar_interlocutor(inter_id: str) -> dict:
    its = _cargar_json("interlocutores.json").get("interlocutores", [])
    return next((i for i in its if i["id"] == inter_id), its[0] if its else {})

# --- ENDPOINTS ---
PROMPT_LIMPIEZA = """
El siguiente texto son subtítulos extraídos automáticamente de YouTube.
Corrígelo ÚNICAMENTE en:
- Puntuación
- Mayúsculas
- Eliminar repeticiones de frases consecutivas

NO cambies palabras, NO parafrasees, NO agregues ni quites contenido.
Devuelve SOLO el texto corregido, sin comentarios.

Texto: {texto}
"""

def chunk_text_for_cleaning(texto: str, word_chunk=1000) -> list:
    words = texto.split()
    return [" ".join(words[i:i+word_chunk]) for i in range(0, len(words), word_chunk)]

@app.post("/limpiar-texto")
def limpiar_texto(req: CleanRequest):
    key = req.api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return {"error": "API Key de Anthropic no configurada. Ingrésala en el panel de YouTube o en el archivo .env."}
        
    http_client = httpx.Client(verify=_SSL_VERIFY, timeout=60.0)
    client = anthropic.Anthropic(api_key=key, http_client=http_client)
    
    def clean_chunk(chunk: str) -> str:
        prompt = PROMPT_LIMPIEZA.format(texto=chunk)
        res = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )
        return res.content[0].text.strip()
        
    try:
        chunks = chunk_text_for_cleaning(req.texto, word_chunk=800)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(clean_chunk, ch) for ch in chunks]
            cleaned_chunks = [f.result() for f in futures]
            
        texto_limpio = " ".join(cleaned_chunks)
        return {"texto_limpio": texto_limpio}
    except Exception as e:
        return {"error": str(e)}

# --- CAPA 1: Métricas (Pure Python + Textstat) ---
STOPWORDS_EXTRA = {
    "entonces", "bueno", "bien",
    "señor", "señora", "hoy", "día", "año", "vez", "hacer"
}

NOSOTROS = {"nosotros", "nuestro", "nuestra", "nuestros", "nuestras"}
ELLOS = {"ellos", "ellas", "su", "sus", "ese", "esa", "esos", "esas"}
NEGACIONES = {"no", "nunca", "jamás", "tampoco", "ningún", "ninguna", "ni"}

def calcular_metricas(texto: str) -> dict:
    texto_limpio = re.sub(r'[^\w\s]', '', texto.lower())
    tokens = texto_limpio.split()
    
    STOPWORDS_BASIC = {
        "de", "la", "que", "el", "en", "y", "a", "los", "del", "se", "las", "por", "un", "para", "con", "no", "una", "su", "al", "lo", "como", "más", "pero", "sus", "le", "ya", "o", "este", "sí", "porque", "esta", "entre", "cuando", "muy", "sin", "sobre", "también", "me", "hasta", "hay", "donde", "quien", "desde", "todo", "nos", "durante", "todos", "uno", "les", "ni", "contra", "otros", "ese", "eso", "ante", "ellos", "e", "esto", "mí", "antes", "algunos", "qué", "unos", "yo", "otro", "otras", "otra", "él", "tanto", "esa", "estos", "mucho", "quienes", "nada", "si", "así", "aquí", "allí", "está", "están", "fue", "ha", "han", "ser", "son", "era", "esta", "esto"
    }
    
    palabras = [
        w for w in tokens 
        if w not in STOPWORDS_BASIC 
        and w not in STOPWORDS_EXTRA
        and len(w) > 3 
        and not w.isdigit()
    ]
    
    total_tokens = len(tokens)
    try:
        n_oraciones = textstat.sentence_count(texto) or 1
        legibilidad = textstat.flesch_reading_ease(texto)
    except Exception:
        n_oraciones = max(1, texto.count('.') + texto.count('?') + texto.count('!'))
        legibilidad = 0
    
    n_nos = sum(1 for t in tokens if t in NOSOTROS)
    n_ell = sum(1 for t in tokens if t in ELLOS)
    n_neg = sum(1 for t in tokens if t in NEGACIONES)

    conteo_cifras = len(re.findall(r'\d+%?', texto))
    
    jerga_medica = {"miligramos", "mg", "xr", "hipertensión", "pas", "pad", "renal", "cefalea", "mareo", "posología", "contraindicaciones", "eficacia", "ensayo", "clínico", "fase", "placebo", "evento", "adverso", "cardiovascular"}
    densidad_jerga = sum(1 for t in tokens if t in jerga_medica)

    return {
        "TTR": round(len(set(palabras)) / len(palabras), 3) if palabras else 0,
        "legibilidad_flesch": round(legibilidad, 2),
        "longitud_promedio_oracion": round(total_tokens / n_oraciones, 1) if n_oraciones > 0 else 0,
        "palabras_frecuentes": Counter(palabras).most_common(20),
        "nosotros_ellos": {
            "nosotros": n_nos,
            "ellos": n_ell,
            "ratio": round(n_nos / n_ell, 2) if n_ell > 0 else None
        },
        "negaciones": {
            "count": n_neg,
            "densidad_pct": round(n_neg / total_tokens * 100, 2) if total_tokens > 0 else 0
        },
        "conteo_cifras": conteo_cifras,
        "densidad_jerga": densidad_jerga
    }

# --- CAPA 2: LLM Prompts & Execution ---
BASE_CONTEXTO = """
Eres un evaluador experto en argumentación clínica y en el sistema de salud colombiano.
Evalúas cómo un médico DEFIENDE y JUSTIFICA el uso de un medicamento frente a {interlocutor_tipo}.

ESCENARIO:
- Medicamento: {medicamento}
- Interlocutor: {interlocutor}
- Reto que enfrenta el médico: {reto}

EVIDENCIA APROBADA (FUENTE DE VERDAD — no uses conocimiento externo; lo que no esté
aquí es "no respaldado"):
{ficha_tecnica}

CONTEXTO DE COBERTURA (financiación, alternativas, criterios):
{contexto_cobertura}

MÉTRICAS COMPUTADAS:
{metricas}

DEFENSA / TRANSCRIPCIÓN A EVALUAR:
{texto}

Devuelve ÚNICAMENTE JSON válido con la estructura indicada.
"""

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

def ejecutar_modulo_med(modulo: str, texto: str, metadatos: dict, metricas: dict, audiencia: str, api_key: str = None) -> dict:
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return {"ok": False, "error": "API Key no configurada"}

    http_client = httpx.Client(verify=_SSL_VERIFY, timeout=90.0)
    client = anthropic.Anthropic(api_key=key, http_client=http_client)

    ficha = cargar_ficha(metadatos.get("medicamento_id", "demo"))
    # Si el usuario proporcionó un contexto personalizado, usarlo como ficha técnica
    ficha_custom = metadatos.get("ficha_custom")
    if ficha_custom and ficha_custom.strip():
        ficha = {"nombre_comercial": metadatos.get("medicamento_id", "Producto"), "descripcion": ficha_custom}
        ficha_tecnica_str = ficha_custom
        contexto_cobertura_str = "{}"
    else:
        ficha_tecnica_str = json.dumps(ficha, ensure_ascii=False, indent=2)
        contexto_cobertura_str = json.dumps(ficha.get("contexto_cobertura", {}), ensure_ascii=False, indent=2)
    inter_id = metadatos.get("interlocutor_id", "paciente")
    if inter_id in ["paciente", "paciente_dudoso"]:
        inter_id = "paciente_dudoso"
    elif inter_id in ["institucion", "institución"]:
        inter_id = "institucion"
    interlocutor = cargar_interlocutor(inter_id)

    base = BASE_CONTEXTO.format(
        interlocutor_tipo=interlocutor.get("tipo", audiencia),
        medicamento=ficha.get("nombre_comercial", "No especificado"),
        interlocutor=interlocutor.get("nombre", audiencia),
        reto=metadatos.get("reto", "Presentar el producto de forma efectiva y con cumplimiento regulatorio"),
        ficha_tecnica=ficha_tecnica_str,
        contexto_cobertura=contexto_cobertura_str,
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

def calcular_d3_no_verbal(metricas_no_verbal: dict) -> dict:
    """
    Calcula D3 a partir de métricas enviadas por el frontend (MediaPipe + Web Speech).
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
    """
    metricas_texto = calcular_metricas(req.texto)
    audiencia = req.escenario.interlocutor_id
    metadatos = req.escenario.model_dump()

    # D3: métricas no verbales vienen en el campo `reto` como JSON si tiene_video=True
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

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)