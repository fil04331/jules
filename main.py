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
import logging
from dotenv import load_dotenv
import google.generativeai as genai
from fastapi import FastAPI, HTTPException, UploadFile, File, Response, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, HttpUrl
import firebase_admin
from firebase_admin import credentials, firestore
from pypdf import PdfReader
from google.cloud import secretmanager
import chroma_service
from auth import verify_token, verify_admin
import redis
import hashlib
from google.api_core import exceptions as google_exceptions
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# --- Helper Functions ---
def access_secret_version(secret_version_id):
    """
    Access the payload for the given secret version and return it.
    e.g., "projects/my-project/secrets/my-secret/versions/latest"
    """
    try:
        client = secretmanager.SecretManagerServiceClient()
        response = client.access_secret_version(name=secret_version_id)
        return response.payload.data.decode("UTF-8")
    except Exception as e:
        logger.error(f"Erreur lors de l'accès au secret: {e}")
        return None

# --- Configuration & Initialisation ---

# Charger les variables d'environnement depuis le fichier .env
load_dotenv()

# 1. Variables d'environnement et API Keys
try:
    GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID")
    GCP_REGION = os.environ.get("GCP_REGION")
    REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
    REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))


    # Récupérer le nom de la ressource du secret depuis les variables d'environnement
    google_api_key_secret = os.environ.get("GOOGLE_API_KEY_SECRET")
    if not google_api_key_secret:
        raise KeyError("La variable d'environnement GOOGLE_API_KEY_SECRET n'est pas définie.")

    # Accéder à la clé API depuis Secret Manager
    GOOGLE_API_KEY = access_secret_version(google_api_key_secret)
    if not GOOGLE_API_KEY:
        raise ValueError("Impossible de récupérer la clé API depuis Secret Manager.")

    if not all([GCP_PROJECT_ID, GCP_REGION]):
        logger.warning("One or more Google Cloud environment variables are missing.")

    genai.configure(api_key=GOOGLE_API_KEY)
except (KeyError, ValueError) as e:
    logger.critical(f"ERREUR de configuration critique: {e}")

# 2. Initialisation de Firebase Admin SDK
db = None
try:
    # Si GOOGLE_APPLICATION_CREDENTIALS est défini, utilisez-le. Sinon, ADC.
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        cred = credentials.Certificate(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))
    else:
        cred = credentials.ApplicationDefault()

    firebase_admin.initialize_app(cred, {'projectId': GCP_PROJECT_ID})
    logger.info("Connexion à Firestore réussie.")
    db = firestore.client()
except Exception as e:
    logger.critical(f"ERREUR: Impossible de se connecter à Firestore. Détails: {e}")

# 3. Initialisation de ChromaDB
if not chroma_service.is_ready():
    logger.critical("ERREUR: Le service ChromaDB n'a pas pu être initialisé. Les fonctionnalités RAG seront désactivées.")
else:
    logger.info("Le service ChromaDB est initialisé et prêt.")

# 4. Initialisation de Redis
redis_client = None
try:
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)
    redis_client.ping()
    logger.info("Connexion à Redis réussie.")
except redis.exceptions.ConnectionError as e:
    logger.warning(f"ERREUR: Impossible de se connecter à Redis. Le caching sera désactivé. Détails: {e}")
    redis_client = None

# 5. Initialisation du Rate Limiter
limiter = Limiter(key_func=get_remote_address, storage_uri=f"redis://{REDIS_HOST}:{REDIS_PORT}" if redis_client else "memory://")


# --- Modèles de Données (Pydantic) ---
class ChatRequest(BaseModel):
    prompt: str = Field(..., title="Prompt", max_length=5000)
    session_id: str = Field(..., title="Session ID")
    parent_message_id: str | None = Field(default=None, title="Parent Message ID")

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
    description="Le cerveau de l'agent IA personnel 'Jules', avec RAG sur ChromaDB.",
    version="0.7.0",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# --- Initialisation du Modèle Gemini ---
model = genai.GenerativeModel('gemini-1.5-flash-latest')

# --- Routes de l'API ---

@app.get("/", tags=["Status"])
async def read_root():
    return {"status": "ok", "message": "Backend de Jules.google v0.7.0 avec RAG (ChromaDB)."}

@app.post("/api/upload", tags=["Knowledge"])
@limiter.limit("20/minute")
async def upload_knowledge(request: Request, file: UploadFile = File(...), token: dict = Depends(verify_token)):
    if not chroma_service.is_ready() or not db:
        raise HTTPException(status_code=503, detail="Un service backend (ChromaDB ou Firestore) n'est pas disponible.")

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

        # Préparer les données pour ChromaDB
        ids = [f"{os.path.splitext(file.filename)[0]}-{uuid.uuid4()}" for _ in chunks]
        metadatas = [{"source_file": file.filename} for _ in chunks]

        # Insérer les documents dans ChromaDB
        chroma_service.upsert_documents(
            datapoint_ids=ids,
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas
        )

        return {"filename": file.filename, "status": "processed", "chunks_added": len(chunks)}
    except google_exceptions.GoogleAPICallError as e:
        logger.error(f"Erreur de communication avec l'API Google (Gemini Embeddings): {e}")
        raise HTTPException(status_code=502, detail=f"Erreur de communication avec l'API Google (Gemini Embeddings): {e}")
    except ConnectionError as e:
        logger.error(f"Erreur de communication avec ChromaDB: {e}")
        raise HTTPException(status_code=503, detail=f"Erreur de communication avec ChromaDB: {e}")
    except IOError as e:
        logger.error(f"Erreur d'entrée/sortie avec le fichier uploadé: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur d'entrée/sortie avec le fichier uploadé: {e}")
    except Exception as e:
        logger.error(f"Erreur inattendue lors du traitement de l'upload: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur inattendue lors du traitement du fichier: {str(e)}")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.post("/api/generate-code", response_model=CodeGenerationResponse, tags=["Code Generation"])
@limiter.limit("30/minute")
async def generate_code(request: Request, req_body: CodeGenerationRequest, token: dict = Depends(verify_token)):
    if not db:
        raise HTTPException(status_code=503, detail="La connexion à Firestore n'est pas disponible.")

    cache_key = f"code_gen:{hashlib.sha256(req_body.prompt.encode()).hexdigest()}"
    try:
        if redis_client:
            cached_result = redis_client.get(cache_key)
            if cached_result:
                logger.info(f"Cache HIT for prompt: '{req_body.prompt[:50]}...'")
                cached_data = json.loads(cached_result)
                return CodeGenerationResponse(**cached_data)
    except redis.exceptions.RedisError as e:
        logger.warning(f"Erreur Redis (GET): {e}. On continue sans cache.")

    logger.info(f"Cache MISS for prompt: '{req_body.prompt[:50]}...'")
    code_generation_prompt = f"""
    Ta tâche est de générer uniquement le code source pour la demande suivante.
    Ne fournis AUCUNE explication, commentaire en langage naturel, ou formatage de type Markdown avant ou après le bloc de code.
    Le résultat doit être directement compilable ou interprétable.
    Demande de l'utilisateur : "{req_body.prompt}"
    """
    try:
        response = model.generate_content(code_generation_prompt)
        generated_code = response.text

        if generated_code.strip().startswith("```"):
            lines = generated_code.strip().split('\n')
            generated_code = '\n'.join(lines[1:-1])

        code_id = str(uuid.uuid4())
        doc_ref = db.collection('generated_codes').document(code_id)
        doc_ref.set({'code': generated_code, 'filename': req_body.filename, 'createdAt': firestore.SERVER_TIMESTAMP})

        response_data = {"code_id": code_id, "filename": req_body.filename}

        try:
            if redis_client:
                redis_client.set(cache_key, json.dumps(response_data), ex=86400)  # Cache pour 24 heures
        except redis.exceptions.RedisError as e:
            logger.warning(f"Erreur Redis (SET): {e}. La réponse est envoyée mais non cachée.")

        return CodeGenerationResponse(**response_data)
    except google_exceptions.GoogleAPICallError as e:
        logger.error(f"Erreur lors de la communication avec l'API Gemini: {e}")
        raise HTTPException(status_code=502, detail=f"Erreur lors de la communication avec l'API Gemini: {e}")
    except Exception as e:
        logger.error(f"Erreur inattendue lors de la génération du code: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur inattendue lors de la génération du code: {e}")

@app.get("/api/download-code/{code_id}", tags=["Code Generation"])
@limiter.limit("60/minute")
async def download_code(request: Request, code_id: str, filename: str, token: dict = Depends(verify_token)):
    if not db:
        raise HTTPException(status_code=503, detail="La connexion à Firestore n'est pas disponible.")

    try:
        doc_ref = db.collection('generated_codes').document(code_id)
        doc = doc_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Code non trouvé, expiré, ou déjà téléchargé.")

        code_data = doc.to_dict()
        generated_code = code_data.get('code', '')

        response = Response(content=generated_code, media_type="application/octet-stream", headers={"Content-Disposition": f'attachment; filename="{filename}"'})

        doc_ref.delete()

        return response
    except google_exceptions.NotFound:
         raise HTTPException(status_code=404, detail="Le document de code n'a pas été trouvé dans Firestore.")
    except google_exceptions.GoogleAPICallError as e:
        logger.error(f"Erreur de communication avec Firestore: {e}")
        raise HTTPException(status_code=502, detail=f"Erreur de communication avec Firestore: {e}")
    except Exception as e:
        logger.error(f"Erreur inattendue lors du téléchargement du code: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur inattendue: {e}")

async def stream_chat_response(chat_session, augmented_prompt, messages_ref, user_prompt, parent_id, session_ref, user_message_id, model_message_id):
    """
    An async generator that streams the chat response and saves the full conversation with versioning.
    """
    try:
        # First, yield the IDs to the client
        yield f"__IDS__::{user_message_id}::{model_message_id}\n"

        response_stream = chat_session.send_message(augmented_prompt, stream=True)
        full_reply = ""
        for chunk in response_stream:
            if chunk.text:
                full_reply += chunk.text
                yield chunk.text
    except Exception as e:
        logger.error(f"Error during streaming response generation: {e}")
        yield f"ERREUR: {str(e)}"
    finally:
        logger.info(f"Streaming finished. Full reply length: {len(full_reply)}")
        if full_reply:
            try:
                user_message_doc = {
                    'message_id': user_message_id,
                    'parent_id': parent_id,
                    'role': 'user',
                    'parts': [user_prompt],
                    'timestamp': firestore.SERVER_TIMESTAMP
                }
                model_message_doc = {
                    'message_id': model_message_id,
                    'parent_id': user_message_id,
                    'role': 'model',
                    'parts': [full_reply],
                    'timestamp': firestore.SERVER_TIMESTAMP
                }

                batch = db.batch()
                batch.set(messages_ref.document(user_message_id), user_message_doc)
                batch.set(messages_ref.document(model_message_id), model_message_doc)
                batch.set(session_ref, {'latest_message_id': model_message_id}, merge=True)
                batch.commit()

                logger.info("Chat history successfully saved to Firestore with versioning.")
            except Exception as e:
                logger.error(f"Failed to save versioned chat history to Firestore: {e}")

def get_history_for_branch(messages_ref, leaf_message_id):
    """
    Constructs the conversation history for a specific branch by traversing parent_id.
    """
    if not leaf_message_id:
        return []

    history = []
    current_id = leaf_message_id
    # Limit history depth to prevent infinite loops and excessive reads
    for _ in range(50): # Limit to 50 turns (100 messages)
        if not current_id:
            break
        try:
            doc = messages_ref.document(current_id).get()
            if not doc.exists:
                logger.warning(f"History traversal stopped: message {current_id} not found.")
                break

            message_data = doc.to_dict()
            # Prepend the message to build the history in chronological order
            history.insert(0, {'role': message_data['role'], 'parts': message_data['parts']})
            current_id = message_data.get('parent_id')
        except Exception as e:
            logger.error(f"Error while fetching message {current_id} from history: {e}")
            break

    return history

@app.post("/api/chat", tags=["AI"])
@limiter.limit("60/minute")
async def handle_chat(request: Request, req_body: ChatRequest, token: dict = Depends(verify_token)):
    if not db:
        raise HTTPException(status_code=503, detail="La connexion à Firestore n'est pas disponible.")

    try:
        user_id = token.get('uid')
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID not found in token.")

        # --- RAG & Context Augmentation ---
        context = ""
        if chroma_service.is_ready():
            try:
                embedding_result = genai.embed_content(model="models/text-embedding-004", content=[req_body.prompt], task_type="RETRIEVAL_QUERY")
                prompt_embedding = embedding_result['embedding'][0]

                search_results = chroma_service.query_collection(query_embedding=prompt_embedding, num_results=3)

                # Les documents sont directement dans la réponse de ChromaDB
                documents = search_results.get('documents', [[]])[0]
                if documents:
                    context = "\n---\n".join(documents)
            except Exception as e:
                logger.error(f"Erreur pendant la recherche RAG avec ChromaDB: {e}")
                # On continue sans contexte en cas d'erreur

        if context:
            augmented_prompt = f"""En te basant sur le contexte suivant, réponds à la question de l'utilisateur.
Si le contexte ne contient pas la réponse, utilise tes connaissances générales mais mentionne que l'information ne vient pas des documents fournis.
Contexte:
---
{context}
---
Question de l'utilisateur: {req_body.prompt}"""
        else:
            augmented_prompt = req_body.prompt

        # --- Versioning Logic ---
        session_ref = db.collection('users').document(user_id).collection('sessions').document(req_body.session_id)
        messages_ref = session_ref.collection('messages')

        parent_id = req_body.parent_message_id
        if not parent_id:
            try:
                session_doc = session_ref.get()
                if session_doc.exists:
                    parent_id = session_doc.to_dict().get('latest_message_id')
            except Exception as e:
                logger.warning(f"Could not fetch session to get latest_message_id: {e}")
                parent_id = None

        # --- New History Retrieval & ID Generation ---
        history = get_history_for_branch(messages_ref, parent_id)
        chat_session = model.start_chat(history=history)

        user_message_id = str(uuid.uuid4())
        model_message_id = str(uuid.uuid4())

        return StreamingResponse(
            stream_chat_response(chat_session, augmented_prompt, messages_ref, req_body.prompt, parent_id, session_ref, user_message_id, model_message_id),
            media_type="text/plain"
        )
    except google_exceptions.GoogleAPICallError as e:
        logger.error(f"Erreur de communication avec une API Google: {e}")
        # Cannot return StreamingResponse here, so we raise an HTTP exception
        raise HTTPException(status_code=502, detail=f"Erreur de communication avec une API Google: {e}")
    except Exception as e:
        logger.error(f"Erreur interne lors du traitement du chat: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur interne lors du traitement du chat: {str(e)}")


@app.get("/api/is_admin", tags=["Auth"])
async def check_admin_status(token: dict = Depends(verify_admin)):
    """
    An endpoint to check if the current user is an admin.
    This endpoint is protected by the `verify_admin` dependency.
    """
    return {"is_admin": True}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
