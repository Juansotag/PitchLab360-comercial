# Cabina de Defensa Clínica — Guía de transformación (v2, alineada)

> Reemplaza el encuadre de la v1. El producto **no** entrena vendedores: entrena **médicos** a defender y justificar el uso de un medicamento que ya conocen, frente a quien lo cuestiona. Pega este documento (con el código de PitchLab360) en tu herramienta de vibe coding / Antigravity.

---

## 1. El producto, en claro

| Pregunta | Respuesta |
|---|---|
| ¿Quién es el usuario? | El **médico** (ya capacitado por la farmacéutica sobre el medicamento). |
| ¿Qué practica? | **Defender / justificar clínicamente** la decisión de usar el medicamento. No venderlo. |
| ¿Contra quién? (lo hace la IA) | Dos interlocutores: **(A) el auditor de la EPS** que busca negar la autorización, y **(B) el paciente** que duda. |
| ¿Quién compra/usa? | Farmacéuticas (como parte de su capacitación), Silvana como entrenadora, hospitales/IPS. |
| ¿Por qué es defendible? | Defender una decisión clínica legítima frente a una EPS o un paciente es una habilidad real y necesaria — no manipulación. Y el escenario EPS es un dolor único de Colombia que ningún tool gringo toca. |

**Mismo "músculo" que un pitch, apuntado a defender una decisión en vez de venderla.**

---

## 2. Cómo funciona la cabina

El médico entra (web/app o kiosko en un congreso), elige o recibe un escenario —*medicamento + interlocutor + el reto concreto*— y defiende su decisión hablando. La IA, en personaje, le busca el hueco. Ejemplo del escenario EPS:

> **Médico:** Para este paciente indico Ejemplo XR por su hipertensión resistente.
> **Auditor-IA (EPS):** No está financiado con la UPC y hay alternativas en el PBS. ¿Por qué no enalapril?
> **Médico:** Porque controla mejor la presión.
> **Auditor-IA:** "Mejor" no autoriza nada. Deme el desenlace, la cifra y por qué la alternativa no aplica en *este* paciente.

Al cerrar, **scorecard inmediato**: fuerza de la justificación, si se ancló en la evidencia y en el caso particular, manejo de la objeción real, y —en rojo— cualquier afirmación que se salga de la evidencia aprobada. Silvana ve después quién necesita reforzar qué; el médico practica solo, las veces que quiera.

---

## 3. Lo que cambia respecto a PitchLab360

El **motor se queda**: FastAPI, llamadas a Claude, módulos en paralelo (`ejecutar_modulo` + `/analizar/todo`), `calcular_metricas`, vanilla JS, deploy en Railway. La ficha técnica como **fuente de verdad** es ahora aún más central.

Cambian tres cosas: las **personas** (auditor-IA y paciente-IA), las **dimensiones del scorecard**, y se añade la **conversación** (porque una defensa es ida y vuelta, no un monólogo).

---

## 4. Roadmap por fases

**Fase 1 — Analizador de defensa escrita (reuso máximo, sin endpoints nuevos).** El médico escribe/dicta su justificación y `/analizar/todo` la evalúa contra la ficha técnica y el contexto de cobertura. Es el camino más corto a algo funcional.

**Fase 2 — La conversación con el auditor-IA (el corazón y el corte del prototipo recomendado).** Endpoint `/conversar` con historial stateless; el auditor objeta con base en la ficha y el contexto de cobertura. Al cerrar, `/analizar/todo` corre sobre la transcripción y produce el scorecard.

**Fase 3 — El paciente-IA + voz + persistencia.** Misma maquinaria, persona "paciente" con scoring hacia empatía/claridad; carga de audio/STT; panel para Silvana; Supabase.

> Arranca por el **auditor (Fase 2)**: es el diferenciador, el demo más vistoso y donde más pesa el motor de evidencia.

---

## 5. Cambios en `main.py`

### 5.1 Escenario en vez de metadatos políticos

```python
class EscenarioModel(BaseModel):
    medicamento_id: str = "demo"
    interlocutor_id: str = "auditor_eps"     # o "paciente_dudoso"
    reto: Optional[str] = "Negar la autorización por costo"
    tiempo_min: Optional[int] = 5

class AnalizarRequest(BaseModel):
    texto: str                 # la defensa escrita o la transcripción de la conversación
    escenario: EscenarioModel
    api_key: Optional[str] = None
```

### 5.2 Cargadores de configuración

```python
def _cargar_json(nombre): 
    with open(f"static/config/{nombre}", encoding="utf-8") as f: return json.load(f)

def cargar_ficha(med_id):
    meds = _cargar_json("medicamentos.json")["medicamentos"]
    return next((m for m in meds if m["id"] == med_id), meds[0])

def cargar_interlocutor(inter_id):
    its = _cargar_json("interlocutores.json")["interlocutores"]
    return next((i for i in its if i["id"] == inter_id), its[0])
```

### 5.3 `BASE_CONTEXTO` (para el análisis del scorecard)

```python
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
```

### 5.4 `PROMPTS` — los módulos médicos

`exactitud_evidencia` es el corazón y aplica para los dos interlocutores. Los demás cambian de peso según el interlocutor.

```python
PROMPTS = {
  "exactitud_evidencia": """
{base}
Contrasta CADA afirmación clínica de la defensa contra la evidencia aprobada. No uses
conocimiento externo: si no está en la ficha, es "sin_respaldo".
Estructura requerida:
{{
  "veredicto_global": "ok" | "advertencia" | "violacion",
  "afirmaciones": [
    {{ "afirmacion": str, "estado": "respaldado" | "exagerado" | "off_label" | "sin_respaldo",
       "evidencia_ficha": str, "gravedad": "alta" | "media" | "baja" }}
  ]
}}
REGLA DURA: un "off_label" o "exagerado" de gravedad alta => veredicto_global = "violacion".
""",

  "fuerza_justificacion": """
{base}
Evalúa qué tan sólida fue la defensa: ¿ancló en la evidencia, en el CASO PARTICULAR del
paciente, y en por qué la alternativa no aplica? ¿O fueron afirmaciones genéricas?
Estructura requerida:
{{ "anclo_en_evidencia": bool, "anclo_en_caso_particular": bool,
   "justifico_vs_alternativa": bool, "puntaje": int (0-100), "observaciones": [str] }}
""",

  "manejo_objeciones": """
{base}
Identifica la objeción central del interlocutor y evalúa si el médico la abordó de frente
o la evadió.
Estructura requerida:
{{ "objecion_central": str, "fue_abordada": bool,
   "calidad": "con_evidencia" | "generica" | "evasiva", "puntaje": int (0-100) }}
""",

  # --- específico del AUDITOR/EPS ---
  "argumentacion_cobertura": """
{base}
Solo para interlocutor tipo auditor/EPS. ¿El médico usó los argumentos VÁLIDOS para
sustentar la autorización? (necesidad clínica del caso, fracaso/contraindicación de la
alternativa financiada, criterios de uso, costo-efectividad cuando aplica).
Estructura requerida:
{{ "argumentos_usados": [str], "argumentos_faltantes": [str], "puntaje": int (0-100) }}
""",

  # --- específico del PACIENTE (Fase 3) ---
  "comunicacion_empatia": """
{base}
Solo para interlocutor tipo paciente. Evalúa claridad sin jerga, empatía, manejo del miedo
y consentimiento informado. NO premies la venta dura.
Estructura requerida:
{{ "claridad_sin_jerga": bool, "reconocio_preocupacion": bool,
   "consentimiento_informado": bool, "puntaje": int (0-100) }}
"""
}
```

En `/analizar/todo`, corre solo los módulos que apliquen al `interlocutor_id` (auditor → `argumentacion_cobertura`; paciente → `comunicacion_empatia`).

### 5.5 Scorecard con límite duro

```python
PESOS = {
  "auditor_eps": {"exactitud_evidencia": .30, "fuerza_justificacion": .25,
                  "manejo_objeciones": .20, "argumentacion_cobertura": .25},
  "paciente_dudoso": {"exactitud_evidencia": .30, "fuerza_justificacion": .20,
                      "manejo_objeciones": .20, "comunicacion_empatia": .30},
}

def construir_scorecard(resultados, interlocutor_id):
    pesos = PESOS[interlocutor_id]
    dims, comp = {}, resultados.get("exactitud_evidencia", {}).get("data", {})
    veredicto = comp.get("veredicto_global", "ok")
    dims["exactitud_evidencia"] = {"ok":100,"advertencia":60,"violacion":25}[veredicto]
    for k in pesos:
        if k != "exactitud_evidencia":
            dims[k] = resultados.get(k, {}).get("data", {}).get("puntaje", 0)
    g = round(sum(dims[k]*pesos[k] for k in pesos))
    if veredicto == "violacion": g = min(g, 40)   # límite duro
    return {"global": g, "dimensiones": dims, "veredicto_evidencia": veredicto}
```

### 5.6 (Fase 2) Endpoint de conversación

```python
class TurnoRequest(BaseModel):
    historial: list                 # [{"role","content"}]
    interlocutor_id: str
    medicamento_id: str
    api_key: Optional[str] = None

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
        persona_prompt=inter["system_prompt"],
        ficha=json.dumps(ficha, ensure_ascii=False),
        cobertura=json.dumps(ficha.get("contexto_cobertura", {}), ensure_ascii=False))
    client = anthropic.Anthropic(api_key=req.api_key or os.environ.get("ANTHROPIC_API_KEY"),
                                 http_client=httpx.Client(verify=_SSL_VERIFY, timeout=60.0))
    res = client.messages.create(model="claude-sonnet-4-20250514",
        max_tokens=1024, system=system, messages=req.historial)
    return {"respuesta": res.content[0].text}
```

`/limpiar-texto` se mantiene; `/extraer-subtitulos` (YouTube) se elimina del MVP.

---

## 6. Configuración nueva (`static/config/`)

### `medicamentos.json`

```json
{
  "medicamentos": [{
    "id": "demo",
    "nombre_comercial": "Ejemplo XR",
    "principio_activo": "ejemplafenina 50 mg",
    "indicaciones_aprobadas": ["Hipertensión arterial esencial / resistente en adultos"],
    "eficacia": [{"desenlace": "Reducción PAS a 12 sem", "dato": "-14 mmHg vs -9 mmHg comparador", "fuente": "fase III pivotal"}],
    "seguridad": {"adversos_frecuentes": ["cefalea","mareo"], "advertencias": ["Monitorear función renal >65"]},
    "contexto_cobertura": {
      "financiado_upc": false,
      "alternativas_pbs": ["enalapril","losartán"],
      "criterios_uso": ["Tras fracaso o intolerancia a IECA/ARA-II", "Hipertensión resistente documentada"],
      "costo_relativo": "alto"
    },
    "registro_invima": "INVIMA-0000000"
  }]
}
```

> El bloque `contexto_cobertura` debe cargarse con información **real y validada** (MIPRES, PBS/UPC, criterios). No dejes que el LLM lo invente: es el terreno donde un error cuesta credibilidad. Marca de qué fuente y fecha salió.

### `interlocutores.json`

```json
{
  "interlocutores": [
    {
      "id": "auditor_eps",
      "tipo": "auditor",
      "nombre": "Auditor médico de EPS",
      "tiempo_min": 5,
      "objeciones_tipicas": ["no financiado con la UPC", "hay alternativa en el PBS", "falta justificación del caso particular", "no se agotaron alternativas"],
      "system_prompt": "Eres un auditor médico de una EPS colombiana. Tu trabajo es no autorizar tecnologías de alto costo salvo justificación clínica sólida y específica del paciente. Eres escéptico, exiges cifras y fuentes, y rechazas adjetivos vagos."
    },
    {
      "id": "paciente_dudoso",
      "tipo": "paciente",
      "nombre": "Paciente con dudas",
      "tiempo_min": 5,
      "objeciones_tipicas": ["¿por qué este y no el de siempre?", "¿es muy caro?", "leí que tiene efectos secundarios", "¿es seguro siendo nuevo?"],
      "system_prompt": "Eres un paciente sin formación médica, algo asustado y preocupado por el costo. Haces preguntas sencillas y desconfías de lo nuevo. No entiendes tecnicismos."
    }
  ]
}
```

### `rubrica.json` y `demo_data.json`
Igual que en PitchLab360: `rubrica.json` documenta pesos por interlocutor y la regla dura; `demo_data.json` trae un escenario completo precalculado para el botón "Datos de Prueba" sin gastar API.

---

## 7. Frontend (sidebar re-rotulado)

| Sección actual | Sección nueva | Reutiliza |
|---|---|---|
| (encabezado) | **Scorecard** — gauge global + dimensiones | gauge circular |
| 1. Perfil Comunicativo | **1. Fundamento en evidencia** — semáforo + afirmaciones con estado y cita de la ficha | gauge + lista |
| 2. Análisis Emocional | **2. Fuerza de la defensa** — justificación, manejo de la objeción, y (auditor) argumentos de cobertura usados/faltantes | barras + chips |
| 3. Análisis Semántico | **3. Claridad** — métricas locales, jerga (mala con paciente, necesaria con auditor), legibilidad | métricas + tortas SVG |

Banner rojo (reusa `--c-red`) si `veredicto_evidencia == "violacion"`. Conserva el sistema de variables CSS; agrega un verde/teal para "respaldado". **(Fase 2/3)** Panel de chat sobre el flujo actual: turno → `POST /conversar` → burbuja del interlocutor; botón "Terminar" arma la transcripción y dispara `/analizar/todo`.

---

## 8. Corte del prototipo (Fase 2, auditor-IA)

1. Un medicamento (`demo`) y un interlocutor (`auditor_eps`), leídos de los JSON.
2. Panel de chat: el médico defiende, el auditor-IA objeta (`/conversar`).
3. Botón "Terminar" → `/analizar/todo` con `exactitud_evidencia` + `fuerza_justificacion` + `argumentacion_cobertura` → `construir_scorecard`.
4. Render: Scorecard arriba + afirmaciones con estado y cita de la ficha. El "wow" es ver al auditor pedir la cifra del comparador y el scorecard marcar la afirmación vaga.
5. Deploy igual que hoy (Railway, `PORT`).

---

## 9. Riesgos

- **Alucinación de evidencia / cobertura.** Exige citas textuales de la ficha y márca `sin_respaldo`; carga el contexto de cobertura desde fuente real, no del LLM.
- **Precisión normativa.** Las reglas de MIPRES/PBS/UPC cambian y son delicadas. Versiona ese contenido y deja claro que es referencia, no asesoría jurídica.
- **Costo de tokens en la conversación.** El historial crece por turno; limita turnos o resume.
- **Encuadre.** Es defensa de una decisión clínica legítima, no entrenamiento para "vender" medicamentos a pacientes. Mantén ese marco en todo el copy del producto.

---

## 10. Prompt para Antigravity

```
Tengo la app FastAPI PitchLab360 (analiza discursos con Claude). Adjunto su código.
Transfórmala en "Cabina de Defensa Clínica" según la guía adjunta, empezando por la
Fase 2 (conversación con el auditor-IA de una EPS).

1. Reemplaza MetadatosModel por EscenarioModel (medicamento_id, interlocutor_id, reto, tiempo_min).
2. Añade cargar_ficha() y cargar_interlocutor() leyendo de static/config/.
3. Reescribe BASE_CONTEXTO al rol de evaluador de argumentación clínica e inyecta ficha + contexto_cobertura.
4. Reemplaza PROMPTS por: exactitud_evidencia, fuerza_justificacion, manejo_objeciones, argumentacion_cobertura.
5. Añade el endpoint /conversar con historial stateless y SYSTEM_INTERLOCUTOR.
6. Añade construir_scorecard() con la regla de límite duro de evidencia.
7. Crea static/config/medicamentos.json e interlocutores.json con un registro de ejemplo (auditor_eps).
8. Frontend: panel de chat para la defensa + Scorecard + sección "Fundamento en evidencia".
9. Elimina /extraer-subtitulos; conserva /limpiar-texto. Mantén Procfile, runtime.txt y las variables CSS.
```

---

*Cabina de Defensa Clínica · v2 · Laboratorio de Gobierno · Universidad de La Sabana*
