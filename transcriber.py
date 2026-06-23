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
