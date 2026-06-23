from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import os
import tempfile
from transcriber import transcribir

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

def ejecutar_modulo(modulo: str, texto: str, metadatos: dict, metricas: dict, api_key: str = None) -> dict:
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return {"ok": False, "error": "API Key de Anthropic no configurada."}
        
    http_client = httpx.Client(verify=_SSL_VERIFY, timeout=60.0)
    client = anthropic.Anthropic(api_key=key, http_client=http_client)

    ficha = cargar_ficha(metadatos.get("medicamento_id", ""))
    interlocutor = cargar_interlocutor(metadatos.get("interlocutor_id", ""))

    base = BASE_CONTEXTO.format(
        interlocutor_tipo=interlocutor.get("tipo", "interlocutor"),
        medicamento=ficha.get("nombre_comercial", metadatos.get("medicamento_id", "No especificado")),
        interlocutor=interlocutor.get("nombre", metadatos.get("interlocutor_id", "No especificado")),
        reto=metadatos.get("reto", "No especificado"),
        ficha_tecnica=json.dumps(ficha, ensure_ascii=False, indent=2),
        contexto_cobertura=json.dumps(ficha.get("contexto_cobertura", {}), ensure_ascii=False, indent=2),
        metricas=json.dumps(metricas, ensure_ascii=False, indent=2),
        texto=texto
    )
    prompt = PROMPTS[modulo].format(base=base)
    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = response.content[0].text.strip()
        try:
            return {"ok": True, "data": json.loads(raw)}
        except json.JSONDecodeError:
            clean = raw.replace("```json", "").replace("```", "").strip()
            return {"ok": True, "data": json.loads(clean)}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/analizar/metrico")
def analizar_metrico(req: AnalizarRequest):
    return {"metricas": calcular_metricas(req.texto)}

PESOS = {
  "auditor_eps": {"exactitud_evidencia": 0.30, "fuerza_justificacion": 0.25,
                  "manejo_objeciones": 0.20, "argumentacion_cobertura": 0.25},
  "paciente_dudoso": {"exactitud_evidencia": 0.30, "fuerza_justificacion": 0.20,
                      "manejo_objeciones": 0.20, "comunicacion_empatia": 0.30},
}

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

@app.post("/analizar/todo")
def analizar_todo(req: AnalizarRequest):
    return analizar_pitchmed(req)

@app.post("/analizar/{modulo}")
def analizar_modulo(modulo: str, req: AnalizarRequest):
    if modulo not in PROMPTS_PITCHMED:
        return {"error": f"Módulo '{modulo}' no existe"}
    metricas = calcular_metricas(req.texto)
    audiencia = req.escenario.interlocutor_id
    return ejecutar_modulo_med(modulo, req.texto, req.escenario.model_dump(), metricas, audiencia, api_key=req.api_key)

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

@app.post("/analizar/no-verbal")
def analizar_no_verbal(
    duracion_seg: float = Form(0),
    palabras_total: int = Form(0),
    tiene_video: bool = Form(False)
):
    return calcular_d3_no_verbal(duracion_seg, palabras_total, tiene_video)

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
    
    # Evaluar D3 no verbal basado en la duración estimada del pitch
    palabras_total = len(req.texto.split())
    # Si no nos pasan la duración, la estimamos a un ritmo normal de 130 palabras por minuto
    duracion_est = (palabras_total / 130.0) * 60.0
    resultados["D3_no_verbal"] = calcular_d3_no_verbal(duracion_est, palabras_total, tiene_video=False)
    
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
    inter_id = metadatos.get("interlocutor_id", "paciente")
    if inter_id in ["paciente", "paciente_dudoso"]:
        inter_id = "paciente_dudoso"
    elif inter_id in ["institucion", "institución"]:
        inter_id = "institución"
    interlocutor = cargar_interlocutor(inter_id)
    
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

SYSTEM_INTERLOCUTOR = """
{persona_prompt}
Conoces a fondo esta evidencia y este contexto de cobertura, y SOLO aceptas
justificaciones ancladas en ellos:
FICHA: {ficha}
COBERTURA: {cobertura}
Mantente en personaje. Busca el punto débil de la defensa. Turnos breves.
"""

@app.post("/conversar")
def conversar(req: TurnoRequest):
    inter = cargar_interlocutor(req.interlocutor_id)
    ficha = cargar_ficha(req.medicamento_id)
    system = SYSTEM_INTERLOCUTOR.format(
        persona_prompt=inter.get("system_prompt", ""),
        ficha=json.dumps(ficha, ensure_ascii=False),
        cobertura=json.dumps(ficha.get("contexto_cobertura", {}), ensure_ascii=False)
    )
    
    key = req.api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise HTTPException(status_code=400, detail="API Key de Anthropic no configurada.")
        
    client = anthropic.Anthropic(
        api_key=key,
        http_client=httpx.Client(verify=_SSL_VERIFY, timeout=60.0)
    )
    
    try:
        res = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system,
            messages=req.historial
        )
        return {"respuesta": res.content[0].text}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # En Railway se usa la variable de entorno PORT
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)