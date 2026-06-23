# transcriber.py
import anthropic
import base64
import os

# Mapping de extensiones a media types soportados por Anthropic
MEDIA_TYPES = {
    ".mp3":  "audio/mpeg",
    ".mp4":  "audio/mp4",
    ".m4a":  "audio/mp4",
    ".wav":  "audio/wav",
    ".webm": "audio/webm",
    ".ogg":  "audio/ogg",
}

PROMPT_TRANSCRIPCION = (
    "Transcribe el audio exactamente como se escucha, en el idioma original. "
    "Devuelve ÚNICAMENTE el texto transcrito, sin comentarios, sin etiquetas, sin explicaciones."
)

def transcribir(file_bytes: bytes, extension: str, api_key: str = None) -> dict:
    """
    Recibe bytes del archivo y su extensión (.mp3, .mp4, .wav, .webm, etc.).
    Devuelve {"texto": str, "idioma": str, "duracion_seg": float}
    Usa la API de Anthropic para transcribir (sin torch, sin OpenAI).
    """
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise ValueError("ANTHROPIC_API_KEY no configurada.")

    media_type = MEDIA_TYPES.get(extension.lower())
    if not media_type:
        raise ValueError(f"Formato de audio no soportado: {extension}")

    audio_b64 = base64.standard_b64encode(file_bytes).decode("utf-8")

    client = anthropic.Anthropic(api_key=key)

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": PROMPT_TRANSCRIPCION
                    },
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": audio_b64,
                        },
                    },
                ],
            }
        ],
    )

    texto = response.content[0].text.strip()

    return {
        "texto": texto,
        "idioma": "es",       # Anthropic no devuelve el idioma detectado
        "duracion_seg": 0.0   # No disponible sin procesamiento local
    }
