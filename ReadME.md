# PitchLab360 — Contexto para análisis y recomendaciones de mejora

> Pega este documento en Claude (o cualquier LLM) para obtener recomendaciones de mejora informadas sobre el proyecto.

---

## ¿Qué es PitchLab360?

PitchLab360 es una herramienta web de **análisis de discurso político** desarrollada por el Laboratorio de Gobierno de la Universidad de La Sabana. Permite analizar textos de candidatos políticos usando inteligencia artificial (Claude de Anthropic) y métricas computacionales del lenguaje.

**Casos de uso:**
- Equipos de campaña que quieren entender cómo comunica su candidato
- Investigadores de comunicación política
- Consultores de gobernanza y comunicación pública

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Python · FastAPI · Uvicorn |
| LLM | Anthropic Claude (`claude-haiku-4-5-20251001`) |
| Métricas locales | `textstat` (pure Python, sin spaCy) |
| Frontend | HTML · CSS · Vanilla JS (sin frameworks) |
| Fuentes | Google Fonts (Inter) · Font Awesome |
| Deploy | Railway (Procfile + runtime.txt incluidos) |

---

## Estructura del proyecto

```
PitchLab360/
├── main.py                   # Backend completo (FastAPI)
├── requirements.txt
├── Procfile                  # Deploy Railway
├── runtime.txt               # Python 3.11
├── .env                      # ANTHROPIC_API_KEY (no subir a git)
├── .env.example
├── discursos/                # Textos de discursos de prueba (.txt)
│   ├── Abelardo_de_la_espriella.txt
│   ├── Claudia_Lopez.txt
│   ├── Paloma_Valencia.txt
│   ├── Roy_Barreras.txt
│   └── Sergio_Fajardo.txt
├── assets/
│   └── PitchLab360.jpg       # Logo principal
└── static/
    ├── index.html            # UI completa (una sola página)
    ├── app.js                # Motor de rendering y lógica frontend
    ├── style.css             # Diseño y paleta de colores
    └── config/               # JSONs editables de configuración
        ├── demo_data.json    # Datos del botón "Datos de Prueba"
        ├── categorias.json   # Tipos de discurso, emociones, plataformas
        └── stakeholders.json # Categorías de actores y relaciones
```

---

## Flujo de análisis (backend)

1. **Usuario pega texto** del discurso en el frontend
2. **`POST /limpiar-texto`** — Claude limpia y normaliza el texto en chunks paralelos
3. **`POST /analizar/todo`** — Ejecuta **5 módulos en paralelo** con `ThreadPoolExecutor`:
   - `estilo` — formalidad (1–10), tipo de discurso (con justificación por categoría), perfil comunicativo
   - `frases_clave` — índice de tono (-1 a 1), frases memorables clasificadas por tipo
   - `potencial_digital` — fragmentos viralizables con plataformas sugeridas y razones
   - `marcos_narrativos` — encuadres emocionales (%), complejidad del lenguaje (1–10 con justificación)
   - `stakeholders` — actores mencionados, categoría, % del discurso, tipo de relación, subcategoría, evidencia textual
4. **Métricas locales** (sin API): TTR, Flesch, longitud de oraciones, negaciones, ratio nosotros/ellos, palabras frecuentes (filtradas de stopwords)

---

## Estructura del sidebar (resultado)

Los resultados se muestran en un panel lateral colapsable con 4 secciones:

### 0. Introducción
- Tarjeta de descripción de la herramienta
- Índice de secciones
- Placeholder QR para video tutorial

### 1. Perfil Comunicativo
- **a. Nivel de Formalidad** — gauge circular 1–10 con justificación
- **b. Tipo de Discurso** — lista de categorías con justificación individual y categoría dominante
- **c. Perfil Comunicativo** — párrafo cualitativo de síntesis

### 2. Análisis Emocional
- **a. Índice de Tono** — barra deslizante negativo↔positivo con descripción
- **b. Unidades de Sentido** — frases memorables clasificadas por tipo con justificación
- **c. Potencial Digital** — fragmentos viralizables con badges de plataformas y razones
- **d. Encuadres Emocionales** — barras de porcentaje por emoción con interpretación

### 3. Análisis Semántico
- **a. Palabras Más Frecuentes** — chips de términos (sin stopwords)
- **b. Nivel de Complejidad Discursiva** — gauge circular 1–10 (generado por LLM)
- **c. Identificación de Stakeholders** — dos gráficos de torta SVG (por actor y por categoría) + lista detallada con barras de relación

---

## Sistema de colores

Paleta calibrada al logo institucional:

| Variable CSS | Hex | Uso |
|---|---|---|
| `--c-blue-dark` | `#1e3a6e` | Texto principal, títulos |
| `--c-blue-light` | `#2563a8` | Acentos, botones secundarios |
| `--c-red` | `#d51437` | CTA principal, relación negativa |
| `--c-orange` | `#fb6f1a` | Arco del logo, acentos cálidos |
| `--c-purple` | `#762372` | Gauge de formalidad, stakeholder % |
| `--c-yellow` | `#f8a719` | Índice de tono positivo |

**Relaciones en gráficos de torta:**
- Positiva → `#2563a8` (azul acero)
- Negativa → `#d51437` (rojo)
- Neutra → `#94a3b8` (gris)
- Mixta → promedio RGB ponderado por % del discurso

---

## Configuración editable (sin tocar código)

### `static/config/demo_data.json`
Datos completos del botón **"Datos de Prueba"**. Modificable para cambiar el candidato demo, frases, stakeholders, etc. sin gastar créditos de API.

### `static/config/categorias.json`
Listas que usa el LLM como referencia:
- `tipos_discurso` — con descripción de cada tipo
- `emociones_politicas` — catálogo de 10 emociones
- `tipos_frases_memorables` — 10 tipos de frases
- `plataformas_digitales` — 7 plataformas (sin LinkedIn)

### `static/config/stakeholders.json`
- `categorias_stakeholders` — 15 categorías de actores
- `relaciones` — subcategorías y colores por tipo (positiva/negativa/neutra)

---

## Variables de entorno requeridas

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Se puede ingresar también desde la UI (campo en el panel lateral) sin necesidad de reiniciar el servidor.

---

## Cómo correr localmente

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# Abrir http://localhost:8000
```

---

## Limitaciones conocidas

- El modelo `claude-haiku-4-5-20251001` tiene un límite de rate que puede causar errores con textos muy largos en simultáneo → se mitiga con `ThreadPoolExecutor(max_workers=3)` y chunks de 800 palabras
- Los JSONs de configuración (`categorias.json`) son referencia para los prompts pero el LLM puede generar valores fuera de las listas — el frontend renderiza lo que reciba
- El análisis de stakeholders depende de que el texto mencione actores explícitamente; en discursos muy abstractos puede devolver lista vacía
- No hay persistencia: cada sesión es independiente, no se guardan análisis anteriores

---

## Prompt para Claude — solicitar recomendaciones

```
Eres un experto en desarrollo de software, comunicación política y análisis de datos. 
Revisa el contexto completo de PitchLab360 descrito arriba y dame recomendaciones 
concretas de mejora en estas áreas:

1. **Calidad del análisis** — ¿Qué módulos adicionales o mejoras a los prompts 
   enriquecerían el valor analítico para equipos de campaña?

2. **Experiencia de usuario** — ¿Qué elementos del sidebar o del flujo de trabajo 
   podrían simplificarse o potenciarse?

3. **Arquitectura técnica** — ¿Qué cambios mejorarían rendimiento, escalabilidad 
   o mantenibilidad?

4. **Casos de uso adicionales** — ¿Qué otras aplicaciones o audiencias podría 
   servir esta herramienta con ajustes menores?

Prioriza las recomendaciones de mayor impacto con menor costo de implementación.
```