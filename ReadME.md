# PitchMed360

Herramienta de entrenamiento en argumentacion clinica para medicos. Permite practicar y evaluar la defensa de una decision terapeutica frente a dos tipos de interlocutores: un auditor medico de EPS y un paciente con dudas.

Desarrollada por el Laboratorio de Gobierno de la Universidad de La Sabana.

---

## Que hace

El medico graba o escribe su pitch justificando el uso de un medicamento. La plataforma evalua el discurso en cinco dimensiones y devuelve un scorecard con retroalimentacion cualitativa:

- **D1 — Precision cientifica:** contrasta cada afirmacion clinica contra la ficha tecnica proporcionada.
- **D2 — Claridad y lenguaje:** nivel tecnico, calibracion al interlocutor, jerga y deslices de registro.
- **D3 — Comunicacion no verbal:** analisis de postura, contacto visual, velocidad y fillers, obtenidos en tiempo real via camara.
- **D4 — Cumplimiento regulatorio:** indicaciones aprobadas por INVIMA, mencion de efectos adversos y contraindicaciones.
- **D5 — Estructura narrativa:** apertura con problema, evidencia en contexto, manejo de objeciones, cierre con llamado a la accion.

---

## Stack

| Capa | Tecnologia |
|---|---|
| Backend | Python · FastAPI · Uvicorn |
| LLM | Anthropic Claude (`claude-haiku-4-5-20251001`) |
| Metricas locales | `textstat` (sin spaCy) |
| Transcripcion audio | OpenAI Whisper (local) |
| Vision en tiempo real | MediaPipe Holistic (WebAssembly, CDN) |
| Frontend | HTML · CSS · Vanilla JS |
| Deploy | Railway (Procfile + runtime.txt) |

---

## Estructura del proyecto

```
PitchMed360/
├── main.py                 # Backend FastAPI — endpoints, prompts, scorecard
├── transcriber.py          # Transcripcion de audio con Whisper
├── requirements.txt
├── Procfile                # Deploy Railway
├── runtime.txt             # Python 3.11
├── .env                    # ANTHROPIC_API_KEY (no subir a git)
├── .env.example
├── assets/
│   └── PitchLab360.jpg     # Logo
└── static/
    ├── index.html          # Interfaz principal
    ├── app.js              # Logica frontend — MediaPipe, grabacion, evaluacion
    ├── style.css           # Diseno — paleta institucional
    ├── PublicoBannerWeb-LightItalic_govlab.woff2
    └── config/
        ├── demo_data.json  # Caso demo precalculado (Atorvastatina 40mg vs EPS)
        ├── medicamentos.json
        └── interlocutores.json
```

---

## Flujo de uso

1. El usuario configura el contexto: tipo de audiencia (paciente o EPS) y ficha tecnica del medicamento.
2. Graba su pitch por camara (con analisis no verbal en tiempo real) o pega el texto directamente.
3. Hace clic en "Analizar pitch".
4. El backend ejecuta cinco modulos en paralelo con `ThreadPoolExecutor` y devuelve el scorecard.
5. Los resultados se muestran en la misma pagina: puntaje total, banda (Destacado / Competente / En desarrollo / Insuficiente), y detalle por dimension.

---

## Endpoints principales

| Metodo | Ruta | Descripcion |
|---|---|---|
| `POST` | `/analizar/pitchmed` | Evaluacion completa en cinco dimensiones |
| `POST` | `/transcribir` | Transcripcion de archivo de audio con Whisper |
| `POST` | `/limpiar-texto` | Correccion y normalizacion del texto con Claude |

---

## Variables de entorno

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Se puede ingresar tambien desde la interfaz sin necesidad de reiniciar el servidor.

---

## Ejecutar localmente

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Abrir en el navegador: http://localhost:8000

---

## Contexto del escenario (editable)

La seccion "Contexto del escenario" permite configurar antes de cada pitch:

- **Tipo de audiencia:** paciente o auditor de EPS / IPS.
- **Nombre del producto:** identificador libre del medicamento a defender.
- **Informacion del producto:** ficha tecnica, indicaciones aprobadas, estudios clinicos, contraindicaciones, datos de cobertura. Si se deja vacio, se usa el escenario de ejemplo (Ejemplo XR).

Este contexto se envia al backend como `ficha_custom` y reemplaza la ficha por defecto en todos los modulos de evaluacion.

---

## Demo

El boton "Cargar demo" carga un caso precalculado: defensa de Atorvastatina 40mg ante un auditor de EPS, con discurso completo (~5 minutos), metricas no verbales de camara (D3 con video) y scorecard de referencia (85/100 — Destacado).

---

## Despliegue en Railway

El repositorio incluye `Procfile` y `runtime.txt`. Configurar la variable de entorno `ANTHROPIC_API_KEY` en el panel de Railway. El servidor escucha en el puerto definido por la variable `PORT`.

---

## Notas tecnicas

- La deteccion de postura y contacto visual usa MediaPipe Holistic en el navegador (WebAssembly). El esqueleto se dibuja sobre el video en tiempo real con canvas 2D.
- La transcripcion en vivo usa Web Speech API (Chrome/Edge). La transcripcion de archivos usa Whisper en el servidor.
- No hay persistencia de sesiones: cada evaluacion es independiente.
- El modelo Claude puede rechazar o truncar respuestas si el texto es muy largo. Se recomienda un pitch de entre 3 y 7 minutos.

---

Laboratorio de Gobierno — Universidad de La Sabana
