import pandas as pd
import json
import os
import sys

# Change working directory so main.py can find 'static' dir
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Import calcular_metricas from main.py in the same directory
from main import calcular_metricas

def main():
    # Paths to the data
    tesis_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Avances_tesis", "Herramientas", "resultados")
    fb_path = os.path.join(tesis_dir, "facebook_full.csv")
    tt_path = os.path.join(tesis_dir, "tiktok_full.csv")

    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "data", "social_metrics.json")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    candidato_texts = {}

    # Process Facebook
    if os.path.exists(fb_path):
        print(f"Processing Facebook data from {fb_path}")
        df_fb = pd.read_csv(fb_path, sep=';', dtype={'id_candidato': str})
        for _, row in df_fb.iterrows():
            cand_id = str(row.get('id_candidato', ''))
            if not cand_id or cand_id == 'nan':
                cand_id = str(row.get('pageName', 'Desconocido'))
            
            text = str(row.get('text', ''))
            if text != 'nan' and text.strip():
                if cand_id not in candidato_texts:
                    candidato_texts[cand_id] = []
                candidato_texts[cand_id].append(text)

    # Process TikTok
    if os.path.exists(tt_path):
        print(f"Processing TikTok data from {tt_path}")
        df_tt = pd.read_csv(tt_path, sep=';', dtype={'id_candidato': str})
        for _, row in df_tt.iterrows():
            cand_id = str(row.get('id_candidato', ''))
            if not cand_id or cand_id == 'nan':
                # Try getting from channel username if possible, but title or channel can be used
                cand_id = str(row.get('channel', 'Desconocido'))
            
            title = str(row.get('title', ''))
            if title != 'nan' and title.strip():
                if cand_id not in candidato_texts:
                    candidato_texts[cand_id] = []
                candidato_texts[cand_id].append(title)

    # Calculate metrics
    results = {}
    print(f"Calculating metrics for {len(candidato_texts)} candidates...")
    for cand_id, texts in candidato_texts.items():
        combined_text = " ".join(texts)
        if not combined_text.strip():
            continue
        
        metrics = calcular_metricas(combined_text)
        results[cand_id] = {
            "post_count": len(texts),
            "metrics": metrics
        }
        print(f"  - {cand_id}: {len(texts)} posts processed.")

    # Save results
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"Results saved to {output_path}")

if __name__ == "__main__":
    main()
