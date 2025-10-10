# main.py
# --- Imports ---
import os
import uvicorn
import shutil
import uuid
import json
import re
import tempfile
import subprocess
from dotenv import load_dotenv
import google.generativeai as genai
from fastapi import FastAPI, HTTPException, UploadFile, File, Response
from pydantic import BaseModel, Field, HttpUrl
import firebase_admin
from firebase_admin import credentials, firestore
from pypdf import PdfReader
from google.cloud import aiplatform

# --- Configuration & Initialisation ---

# Charger les variables d'environnement depuis le fichier .env
load_dotenv()

# 1. Variables d'environnement et API Keys
try:
    GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
    GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID")
    GCP_REGION = os.environ.get("GCP_REGION")
    VECTOR_SEARCH_INDEX_ID = os.environ.get("VECTOR_SEARCH_INDEX_ID")
    VECTOR_SEARCH_ENDPOINT_ID = os.environ.get("VECTOR_SEARCH_ENDPOINT_ID")

    if not all([GOOGLE_API_KEY, GCP_PROJECT_ID, GCP_REGION, VECTOR_SEARCH_INDEX_ID, VECTOR_SEARCH_ENDPOINT_ID]):
        print("WARNING: One or more Google Cloud environment variables are missing. RAG and code generation features may not work.")

    genai.configure(api_key=GOOGLE_API_KEY)
except KeyError as e:
    print(f"ERREUR de configuration: {e}")

# 2. Initialisation de Firebase Admin SDK
db = None
try:
    # Si GOOGLE_APPLICATION_CREDENTIALS est défini, utilisez-le. Sinon, ADC.
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        cred = credentials.Certificate(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))
    else:
        cred = credentials.ApplicationDefault()

    firebase_admin.initialize_app(cred, {'projectId': GCP_PROJECT_ID})
    print("Connexion à Firestore réussie.")
    db = firestore.client()
except Exception as e:
    print(f"ERREUR: Impossible de se connecter à Firestore. Détails: {e}")

# 3. Initialisation de Vertex AI et Vector Search
vector_search_endpoint = None
try:
    if all([GCP_PROJECT_ID, GCP_REGION, VECTOR_SEARCH_ENDPOINT_ID]):
        aiplatform.init(project=GCP_PROJECT_ID, location=GCP_REGION)
        print("Vertex AI SDK initialisé.")
        vector_search_endpoint = aiplatform.MatchingEngineIndexEndpoint(
            index_endpoint_name=VECTOR_SEARCH_ENDPOINT_ID
        )
        print(f"Endpoint Vector Search '{VECTOR_SEARCH_ENDPOINT_ID}' chargé.")
except Exception as e:
    print(f"ERREUR: Impossible d'initialiser Vertex AI ou Vector Search. Détails: {e}")

# --- Modèles de Données (Pydantic) ---
class ChatRequest(BaseModel):
    prompt: str = Field(..., title="Prompt", max_length=5000)
    user_id: str = Field(..., title="User ID")
    session_id: str = Field(..., title="Session ID")

class ChatResponse(BaseModel):
    reply: str = Field(..., title="Reply")
    session_id: str = Field(title="Session ID")

class CodeGenerationRequest(BaseModel):
    prompt: str = Field(..., title="Description du code à générer", max_length=5000)
    filename: str = Field("script.py", title="Nom de fichier suggéré pour le téléchargement")

class CodeGenerationResponse(BaseModel):
    code_id: str = Field(..., title="ID unique pour récupérer le code généré")
    filename: str = Field(..., title="Nom de fichier à utiliser pour le téléchargement")

# --- Initialisation de FastAPI ---
app = FastAPI(
    title="Jules.google Backend API",
    description="Le cerveau de l'agent IA personnel 'Jules', avec RAG sur Vertex AI.",
    version="0.5.0",
)

# --- Initialisation du Modèle Gemini ---
model = genai.GenerativeModel('gemini-1.5-flash-latest')

# --- Routes de l'API ---

@app.get("/", tags=["Status"])
async def read_root():
    return {"status": "ok", "message": "Backend de Jules.google v0.5.0 avec RAG (Vertex AI)."}

@app.post("/api/upload", tags=["Knowledge"])
async def upload_knowledge(file: UploadFile = File(...)):
    """
    Traite un fichier, le stocke dans Firestore, génère des embeddings, et upsert dans Vertex AI.
    """
    if not all([vector_search_endpoint, db]):
        raise HTTPException(status_code=503, detail="Un service backend (Vector Search ou Firestore) n'est pas disponible.")

    temp_dir = "temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        text = ""
        if file.filename.endswith(".pdf"):
            reader = PdfReader(file_path)
            for page in reader.pages:
                text += page.extract_text() or ""
        elif file.filename.endswith(".txt"):
            with open(file_path, "r", encoding='utf-8') as f:
                text = f.read()
        else:
            raise HTTPException(status_code=400, detail="Type de fichier non supporté. Uniquement .txt et .pdf.")

        chunk_size = 1000
        overlap = 200
        chunks = [text[i:i+chunk_size] for i in range(0, len(text), chunk_size - overlap)]

        if not chunks:
            return {"filename": file.filename, "status": "no_content", "message": "Le fichier ne contenait aucun texte à traiter."}

        embedding_result = genai.embed_content(model="models/text-embedding-004", content=chunks, task_type="RETRIEVAL_DOCUMENT")
        embeddings = embedding_result['embedding']

        datapoints = []
        firestore_batch = db.batch()
        chunks_collection_ref = db.collection('document_chunks')

        for i, (embedding_vector, chunk_text) in enumerate(zip(embeddings, chunks)):
            datapoint_id = f"{os.path.splitext(file.filename)[0]}-{uuid.uuid4()}"
            datapoints.append({"datapoint_id": datapoint_id, "feature_vector": embedding_vector})
            doc_ref = chunks_collection_ref.document(datapoint_id)
            firestore_batch.set(doc_ref, {"text": chunk_text, "source_file": file.filename, "created_at": firestore.SERVER_TIMESTAMP})

        vector_search_endpoint.upsert_datapoints(index=VECTOR_SEARCH_INDEX_ID, datapoints=datapoints)
        firestore_batch.commit()

        return {"filename": file.filename, "status": "processed", "chunks_added": len(chunks)}

    except Exception as e:
        print(f"Erreur lors du traitement de l'upload: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors du traitement du fichier: {str(e)}")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.post("/api/generate-code", response_model=CodeGenerationResponse, tags=["Code Generation"])
async def generate_code(request: CodeGenerationRequest):
    """
    Génère du code et le stocke dans Firestore pour un téléchargement ultérieur.
    """
    if not db:
        raise HTTPException(status_code=503, detail="La connexion à Firestore n'est pas disponible.")

    code_generation_prompt = f"""
    Ta tâche est de générer uniquement le code source pour la demande suivante.
    Ne fournis AUCUNE explication, commentaire en langage naturel, ou formatage de type Markdown avant ou après le bloc de code.
    Le résultat doit être directement compilable ou interprétable.
    Demande de l'utilisateur : "{request.prompt}"
    """
    try:
        response = model.generate_content(code_generation_prompt)
        generated_code = response.text

        if generated_code.strip().startswith("```"):
            lines = generated_code.strip().split('\n')
            generated_code = '\n'.join(lines[1:-1])

        code_id = str(uuid.uuid4())
        doc_ref = db.collection('generated_codes').document(code_id)
        doc_ref.set({'code': generated_code, 'filename': request.filename, 'createdAt': firestore.SERVER_TIMESTAMP})

        return CodeGenerationResponse(code_id=code_id, filename=request.filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération du code: {e}")

@app.get("/api/download-code/{code_id}", tags=["Code Generation"])
async def download_code(code_id: str, filename: str):
    """
    Télécharge le code généré depuis Firestore et supprime le document.
    """
    if not db:
        raise HTTPException(status_code=503, detail="La connexion à Firestore n'est pas disponible.")

    doc_ref = db.collection('generated_codes').document(code_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Code non trouvé, expiré, ou déjà téléchargé.")

    code_data = doc.to_dict()
    generated_code = code_data.get('code', '')

    response = Response(content=generated_code, media_type="application/octet-stream", headers={"Content-Disposition": f'attachment; filename="{filename}"'})
    doc_ref.delete()
    return response

@app.post("/api/chat", response_model=ChatResponse, tags=["AI"])
async def handle_chat(request: ChatRequest):
    """
    Gère une conversation avec RAG, en utilisant Vertex AI Vector Search et Firestore.
    """
    if not db:
        raise HTTPException(status_code=503, detail="La connexion à Firestore n'est pas disponible.")

    try:
        context = ""
        if vector_search_endpoint:
            embedding_result = genai.embed_content(model="models/text-embedding-004", content=[request.prompt], task_type="RETRIEVAL_QUERY")
            prompt_embedding = embedding_result['embedding'][0]

            search_results = vector_search_endpoint.find_neighbors(queries=[prompt_embedding], deployed_index_id=VECTOR_SEARCH_INDEX_ID.split('/')[-1], num_neighbors=3)

            if search_results and search_results[0]:
                neighbor_ids = [neighbor.datapoint.datapoint_id for neighbor in search_results[0]]
                docs_ref = db.collection('document_chunks').where(firestore.FieldPath.document_id(), 'in', neighbor_ids).stream()
                id_to_text_map = {doc.id: doc.to_dict().get('text', '') for doc in docs_ref}
                context_documents = [id_to_text_map.get(nid, '') for nid in neighbor_ids]
                context = "\n---\n".join(filter(None, context_documents))

        if context:
            augmented_prompt = f"""En te basant sur le contexte suivant, réponds à la question de l'utilisateur.
Si le contexte ne contient pas la réponse, utilise tes connaissances générales mais mentionne que l'information ne vient pas des documents fournis.
Contexte:
---
{context}
---
Question de l'utilisateur: {request.prompt}"""
        else:
            augmented_prompt = request.prompt

        messages_ref = db.collection('users').document(request.user_id).collection('sessions').document(request.session_id).collection('messages')
        history_docs = messages_ref.order_by("timestamp").stream()
        history = [doc.to_dict() for doc in history_docs]

        chat_session = model.start_chat(history=history)
        response = chat_session.send_message(augmented_prompt)
        ai_reply = response.text

        messages_ref.add({'role': 'user', 'parts': [request.prompt], 'timestamp': firestore.SERVER_TIMESTAMP})
        messages_ref.add({'role': 'model', 'parts': [ai_reply], 'timestamp': firestore.SERVER_TIMESTAMP})

        return ChatResponse(reply=ai_reply, session_id=request.session_id)
    except Exception as e:
        print(f"Erreur lors du chat: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur interne lors du traitement du chat: {str(e)}")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)