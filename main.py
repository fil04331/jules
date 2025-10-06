# main.py
# --- Imports ---
import os
import uvicorn
import shutil
import uuid
import google.generativeai as genai
from fastapi import FastAPI, HTTPException, UploadFile, File, Response
from pydantic import BaseModel, Field
import firebase_admin
from firebase_admin import credentials, firestore
import chromadb
from chromadb.utils import embedding_functions
from pypdf import PdfReader

# --- Configuration & Initialisation ---

# 1. Variables d'environnement et API Keys
# GOOGLE_API_KEY est nécessaire pour Gemini ET pour l'embedding.
try:
    GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
    if not GOOGLE_API_KEY:
        raise KeyError("GOOGLE_API_KEY n'est pas définie.")
    genai.configure(api_key=GOOGLE_API_KEY)
except KeyError as e:
    print(f"ERREUR: {e}")

# 2. Initialisation de Firebase Admin SDK (inchangé)
try:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)
    print("Connexion à Firestore réussie.")
    db = firestore.client()
except Exception as e:
    print(f"ERREUR: Impossible de se connecter à Firestore. Détails: {e}")
    db = None

# 3. NOUVEAU: Initialisation de la base de données vectorielle ChromaDB
# Crée un client qui stockera les données sur le disque dans le dossier 'chroma_db'
# Cela rend la connaissance persistante entre les redémarrages du serveur.
chroma_client = chromadb.PersistentClient(path="./chroma_db")

# NOUVEAU: Utilisation du modèle d'embedding de Google
# Ce modèle transforme le texte en vecteurs (nombres) que ChromaDB peut comprendre.
google_ef = embedding_functions.GoogleGenerativeAiEmbeddingFunction(api_key=GOOGLE_API_KEY)

# NOUVEAU: Récupère ou crée une "collection" dans ChromaDB.
# Une collection est comme une table dans une base de données SQL.
# Nous lui passons notre fonction d'embedding.
knowledge_collection = chroma_client.get_or_create_collection(
    name="jules_knowledge",
    embedding_function=google_ef
)

# --- Modèles de Données (Pydantic) ---
class ChatRequest(BaseModel):
    prompt: str = Field(..., title="Prompt", max_length=5000)
    user_id: str = Field(..., title="User ID")
    session_id: str = Field(..., title="Session ID")

class ChatResponse(BaseModel):
    reply: str = Field(..., title="Reply")
    session_id: str = Field(title="Session ID")

# NOUVEAU: Modèles pour la génération et le téléchargement de code
class CodeGenerationRequest(BaseModel):
    prompt: str = Field(..., title="Description du code à générer", max_length=5000)
    filename: str = Field("script.py", title="Nom de fichier suggéré pour le téléchargement")

class CodeGenerationResponse(BaseModel):
    code_id: str = Field(..., title="ID unique pour récupérer le code généré")
    filename: str = Field(..., title="Nom de fichier à utiliser pour le téléchargement")

# NOUVEAU: Cache en mémoire pour le code généré
# Un simple dictionnaire pour stocker temporairement le code.
# La clé sera un UUID, la valeur sera le code en string.
generated_code_cache = {}

# --- Initialisation de FastAPI ---
app = FastAPI(
    title="Jules.google Backend API",
    description="Le cerveau de l'agent IA personnel 'Jules', maintenant avec un entrepôt de connaissances (RAG).",
    version="0.4.0", # Version incrémentée
)

# --- Initialisation du Modèle Gemini ---
model = genai.GenerativeModel('gemini-1.5-flash-latest')

# --- Fonctions Utilitaires pour RAG ---
def process_document(file_path: str, file_name: str):
    """Lit un fichier, le découpe en morceaux (chunks) et le stocke dans ChromaDB."""
    text = ""
    if file_path.endswith(".pdf"):
        reader = PdfReader(file_path)
        for page in reader.pages:
            text += page.extract_text() or ""
    elif file_path.endswith(".txt"):
        with open(file_path, "r", encoding='utf-8') as f:
            text = f.read()
    else:
        return # Ne traite pas les autres types de fichiers pour l'instant

    # Découpage du texte en chunks de 1000 caractères avec 200 de chevauchement
    chunk_size = 1000
    overlap = 200
    chunks = [text[i:i+chunk_size] for i in range(0, len(text), chunk_size - overlap)]

    # Création des IDs uniques pour chaque chunk
    ids = [f"{file_name}-{i}" for i in range(len(chunks))]
    # Ajout des chunks, de leurs métadonnées et de leurs IDs à la collection
    knowledge_collection.add(
        documents=chunks,
        metadatas=[{"source": file_name} for _ in chunks],
        ids=ids
    )
    print(f"Document '{file_name}' traité et ajouté à l'entrepôt de connaissances avec {len(chunks)} chunks.")

# --- Routes de l'API ---

@app.get("/", tags=["Status"])
async def read_root():
    return {"status": "ok", "message": "Backend de Jules.google v0.4.0 avec RAG/ChromaDB."}

@app.post("/api/upload", tags=["Knowledge"])
async def upload_knowledge(file: UploadFile = File(...)):
    """
    NOUVEAU ENDPOINT: Permet d'uploader un fichier (.txt ou .pdf) pour l'ajouter à la base de connaissances.
    """
    # Crée un dossier temporaire s'il n'existe pas
    temp_dir = "temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)

    # Sauvegarde le fichier uploadé sur le disque
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # Traite le document et l'ajoute à ChromaDB
        process_document(file_path, file.filename)
        return {"filename": file.filename, "status": "added_to_knowledge_base"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du traitement du fichier: {e}")
    finally:
        # Supprime le fichier temporaire
        os.remove(file_path)

@app.post("/api/generate-code", response_model=CodeGenerationResponse, tags=["Code Generation"])
async def generate_code(request: CodeGenerationRequest):
    """
    NOUVEAU ENDPOINT: Génère du code à partir d'un prompt et le rend disponible pour le téléchargement.
    """
    # 1. Créer un prompt spécialisé pour la génération de code pur
    code_generation_prompt = f"""
    Ta tâche est de générer uniquement le code source pour la demande suivante.
    Ne fournis AUCUNE explication, commentaire en langage naturel, ou formatage de type Markdown avant ou après le bloc de code.
    Le résultat doit être directement compilable ou interprétable.

    Demande de l'utilisateur : "{request.prompt}"
    """

    try:
        # 2. Appeler l'API Gemini avec ce prompt
        response = model.generate_content(code_generation_prompt)
        generated_code = response.text

        # 3. Nettoyer la réponse pour enlever les ``` qui pourraient être ajoutés
        # par le modèle malgré les instructions.
        if generated_code.strip().startswith("```"):
            lines = generated_code.strip().split('\n')
            generated_code = '\n'.join(lines[1:-1])

        # 4. Stocker le code généré dans le cache
        code_id = str(uuid.uuid4())
        generated_code_cache[code_id] = generated_code

        # 5. Retourner l'ID et le nom de fichier au client
        return CodeGenerationResponse(code_id=code_id, filename=request.filename)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération du code: {e}")


@app.get("/api/download-code/{code_id}", tags=["Code Generation"])
async def download_code(code_id: str, filename: str):
    """
    NOUVEAU ENDPOINT: Permet de télécharger le code généré précédemment via son ID.
    """
    # 1. Récupérer le code depuis le cache
    generated_code = generated_code_cache.get(code_id)

    if not generated_code:
        # 2. Si l'ID n'existe pas, renvoyer une erreur 404
        raise HTTPException(status_code=404, detail="Code non trouvé ou expiré.")

    # 3. Créer une réponse avec le code en contenu
    # media_type="application/octet-stream" est un type générique pour les fichiers binaires.
    # On peut aussi utiliser "text/plain" pour du code pur.
    response = Response(
        content=generated_code,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )

    # 4. (Optionnel) Supprimer le code du cache après le téléchargement pour un usage unique
    del generated_code_cache[code_id]

    return response


@app.post("/api/chat", response_model=ChatResponse, tags=["AI"])
async def handle_chat(request: ChatRequest):
    """
    MODIFIÉ: Gère une conversation en utilisant la connaissance de l'entrepôt (RAG).
    """
    # 1. Chercher des informations pertinentes dans l'entrepôt de connaissances
    # La recherche se fait dans la collection avec le prompt de l'utilisateur. On demande les 3 résultats les plus pertinents.
    results = knowledge_collection.query(
        query_texts=[request.prompt],
        n_results=3
    )
    
    context_documents = results['documents'][0]
    context = "\n---\n".join(context_documents)
    
    # 2. Créer un prompt augmenté avec le contexte trouvé
    augmented_prompt = f"""En te basant sur le contexte suivant, réponds à la question de l'utilisateur.
Si le contexte ne contient pas la réponse, utilise tes connaissances générales mais mentionne que l'information ne vient pas des documents fournis.

Contexte:
---
{context}
---

Question de l'utilisateur: {request.prompt}
"""

    # La suite est similaire à avant, mais utilise le prompt augmenté
    messages_ref = db.collection('users').document(request.user_id).collection('sessions').document(request.session_id).collection('messages')
    history_docs = messages_ref.order_by("timestamp").stream()
    history = [doc.to_dict() for doc in history_docs]
    
    chat_session = model.start_chat(history=history)
    response = chat_session.send_message(augmented_prompt) # <-- Utilisation du prompt augmenté !
    ai_reply = response.text

    # Sauvegarde dans Firestore (inchangé)
    messages_ref.add({'role': 'user', 'parts': [request.prompt], 'timestamp': firestore.SERVER_TIMESTAMP})
    messages_ref.add({'role': 'model', 'parts': [ai_reply], 'timestamp': firestore.SERVER_TIMESTAMP})

    return ChatResponse(reply=ai_reply, session_id=request.session_id)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
