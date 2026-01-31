#!/usr/bin/env python3
"""
Script para extraer páginas de PDFs como imágenes para PsicoTrain App
Versión mejorada con mejor manejo de errores
"""
import fitz  # PyMuPDF
import os
import json
import sys
import warnings
from pathlib import Path

# Suprimir warnings de MuPDF
fitz.TOOLS.mupdf_display_errors(False)

# Configuración
OPEBASK_DIR = Path(__file__).parent.parent.parent
APP_DIR = OPEBASK_DIR / "PsicoTrain-App"
IMAGES_DIR = APP_DIR / "images"
DATA_DIR = APP_DIR / "data"
BASE_DIR = OPEBASK_DIR

# Estructura de categorías y PDFs
CATEGORIES = {
    "Percepción": {
        "path": BASE_DIR / "Percepción ",
        "exercises": []
    },
    "Razonamiento Abstracto": {
        "path": BASE_DIR / "Razonamiento Abstracto",
        "exercises": []
    },
    "Razonamiento Espacial": {
        "path": BASE_DIR / "Razonamiento Espacial" / "Espacial",
        "exercises": []
    },
    "Verbal": {
        "path": BASE_DIR / "Verbal",
        "exercises": []
    }
}

def sanitize_name(name):
    """Sanitiza nombres para usar en archivos/carpetas"""
    return name.replace(" ", "_").replace(".", "").replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u").replace("ñ", "n")

def extract_pdf_pages(pdf_path, output_dir, category_name, exercise_name):
    """Extrae todas las páginas de un PDF como imágenes"""
    if not pdf_path.exists():
        print(f"  ⚠️  No encontrado: {pdf_path}")
        return None
    
    exercise_data = {
        "name": exercise_name,
        "category": category_name,
        "pages": [],
        "total_pages": 0,
        "answers": {}
    }
    
    # Crear carpeta para este ejercicio
    safe_name = sanitize_name(exercise_name)
    exercise_dir = output_dir / sanitize_name(category_name) / safe_name
    exercise_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        doc = fitz.open(pdf_path)
        exercise_data["total_pages"] = len(doc)
        
        print(f"  📄 Extrayendo {len(doc)} páginas de {exercise_name}...")
        
        pages_extracted = 0
        for page_num in range(len(doc)):
            try:
                page = doc[page_num]
                
                # Renderizar página como imagen (100 DPI para balance calidad/tamaño)
                mat = fitz.Matrix(100/72, 100/72)
                pix = page.get_pixmap(matrix=mat)
                
                # Guardar imagen
                img_filename = f"page_{page_num + 1:03d}.jpg"
                img_path = exercise_dir / img_filename
                pix.save(str(img_path))
                
                # Ruta relativa para la web
                relative_path = f"images/{sanitize_name(category_name)}/{safe_name}/{img_filename}"
                exercise_data["pages"].append({
                    "number": page_num + 1,
                    "path": relative_path
                })
                pages_extracted += 1
                
            except Exception as e:
                # Si falla una página, intentar continuar con las demás
                print(f"    ⚠️  Error en página {page_num + 1}: {str(e)[:50]}")
                continue
        
        doc.close()
        
        if pages_extracted > 0:
            print(f"  ✅ Completado: {pages_extracted}/{exercise_data['total_pages']} páginas extraídas")
            return exercise_data
        else:
            print(f"  ❌ No se pudo extraer ninguna página")
            return None
        
    except Exception as e:
        print(f"  ❌ Error abriendo PDF: {str(e)[:50]}")
        return None

def process_all_pdfs():
    """Procesa todos los PDFs de todas las categorías"""
    all_exercises = {}
    
    for category_name, category_info in CATEGORIES.items():
        print(f"\n📁 Procesando categoría: {category_name}")
        category_path = category_info["path"]
        
        if not category_path.exists():
            print(f"  ⚠️  Carpeta no encontrada: {category_path}")
            all_exercises[category_name] = []
            continue
        
        all_exercises[category_name] = []
        
        # Obtener todos los PDFs de la categoría
        pdf_files = sorted([f for f in category_path.iterdir() 
                           if f.suffix.lower() == ".pdf" and not f.name.startswith("._")])
        
        for pdf_file in pdf_files:
            exercise_name = pdf_file.stem  # Nombre sin extensión
            exercise_data = extract_pdf_pages(pdf_file, IMAGES_DIR, category_name, exercise_name)
            
            if exercise_data and len(exercise_data["pages"]) > 0:
                all_exercises[category_name].append(exercise_data)
    
    return all_exercises

def create_database(exercises):
    """Crea el archivo JSON con la base de datos de ejercicios"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    db_path = DATA_DIR / "exercises.json"
    with open(db_path, "w", encoding="utf-8") as f:
        json.dump(exercises, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 Base de datos guardada en: {db_path}")
    
    # Crear archivo de respuestas vacío para que el usuario lo complete
    answers_path = DATA_DIR / "answers.json"
    
    # Crear estructura de respuestas vacía
    answers = {}
    for category, exs in exercises.items():
        answers[category] = {}
        for ex in exs:
            # Crear entradas vacías para cada página extraída
            answers[category][ex["name"]] = {
                str(p["number"]): "" for p in ex["pages"]
            }
    
    with open(answers_path, "w", encoding="utf-8") as f:
        json.dump(answers, f, ensure_ascii=False, indent=2)
    
    print(f"📝 Archivo de respuestas creado en: {answers_path}")
    print("   ⚠️  Por favor, rellena las respuestas correctas en este archivo")

def main():
    print("=" * 60)
    print("🧠 PsicoTrain - Extractor de Ejercicios v2")
    print("=" * 60)
    
    # Crear directorios si no existen
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    # Procesar todos los PDFs
    exercises = process_all_pdfs()
    
    # Crear base de datos
    create_database(exercises)
    
    # Resumen
    total_exercises = sum(len(exs) for exs in exercises.values())
    total_pages = sum(len(ex["pages"]) for exs in exercises.values() for ex in exs)
    
    print("\n" + "=" * 60)
    print("📊 RESUMEN")
    print("=" * 60)
    print(f"   Categorías: {len(exercises)}")
    print(f"   Ejercicios: {total_exercises}")
    print(f"   Páginas extraídas: {total_pages}")
    print("=" * 60)

if __name__ == "__main__":
    main()
