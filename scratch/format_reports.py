import os
import re

results_dir = 'c:/Users/juansoag/Downloads/Github/PitchLab360/Resultados'

# Anglicisms (Italics)
anglicisms = [
    'NLP', 'Natural Language Processing', 
    'LLM', 'Large Language Model', 
    'TTR', 'Type-Token Ratio', 
    'stakeholders', 'framing',
    'titularización'
]

# Colombianismos (Quotes)
colombianismos = ['chulo']

def format_content(content):
    # Process Anglicisms (Italics)
    for term in anglicisms:
        # Avoid double nesting if already has <em> or <i>
        # This regex matches the term not inside <em> or <i> tags
        # and not part of an HTML attribute
        pattern = r'(?i)(?<![<\"/])\b(' + re.escape(term) + r')\b(?![^<]*>)'
        content = re.sub(pattern, r'<em>\1</em>', content)

    # Process Colombianismos (Quotes)
    for term in colombianismos:
        pattern = r'(?i)(?<![<\"/])\b(' + re.escape(term) + r')\b(?![^<]*>)'
        content = re.sub(pattern, r'"\1"', content)
        
    # Fix potential double formatting if the script is run twice
    content = content.replace('<em><em>', '<em>').replace('</em></em>', '</em>')
    return content

for filename in os.listdir(results_dir):
    if filename.endswith('.html'):
        path = os.path.join(results_dir, filename)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            new_content = format_content(content)
            
            if new_content != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f'Formatted: {filename}')
        except Exception as e:
            print(f'Error processing {filename}: {e}')
