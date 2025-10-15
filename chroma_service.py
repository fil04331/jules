# chroma_service.py
# --- Imports ---
import chromadb
import logging
import os

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- ChromaDB Service ---

# 1. Client Initialization
CHROMA_DATA_PATH = "chroma_db"
COLLECTION_NAME = "jules_knowledge"

try:
    # Ensure the directory exists
    if not os.path.exists(CHROMA_DATA_PATH):
        os.makedirs(CHROMA_DATA_PATH)

    # Initialize the persistent client
    client = chromadb.PersistentClient(path=CHROMA_DATA_PATH)
    logger.info(f"ChromaDB client initialized successfully. Path: {CHROMA_DATA_PATH}")

    # 2. Get or Create Collection
    # This ensures the collection is ready when the module is imported.
    collection = client.get_or_create_collection(name=COLLECTION_NAME)
    logger.info(f"ChromaDB collection '{COLLECTION_NAME}' loaded/created successfully.")

except Exception as e:
    logger.critical(f"Failed to initialize ChromaDB client or collection: {e}")
    client = None
    collection = None

def is_ready():
    """Check if the ChromaDB client and collection are available."""
    return client is not None and collection is not None

def upsert_documents(datapoint_ids: list[str], documents: list[str], embeddings: list[list[float]], metadatas: list[dict]):
    """
    Upsert documents and their embeddings into the ChromaDB collection.

    Args:
        datapoint_ids (list[str]): A list of unique IDs for each document chunk.
        documents (list[str]): The text content of the document chunks.
        embeddings (list[list[float]]): The vector embeddings for each chunk.
        metadatas (list[dict]): A list of metadata dictionaries for each chunk.
    """
    if not is_ready():
        logger.error("ChromaDB service is not ready. Cannot upsert documents.")
        raise ConnectionError("ChromaDB service is not available.")

    try:
        collection.upsert(
            ids=datapoint_ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas
        )
        logger.info(f"Successfully upserted {len(datapoint_ids)} documents into '{COLLECTION_NAME}'.")
    except Exception as e:
        logger.error(f"An error occurred while upserting to ChromaDB: {e}")
        # Depending on the desired error handling, you might want to re-raise or handle differently
        raise

def query_collection(query_embedding: list[float], num_results: int = 3):
    """
    Query the collection to find the most similar documents.

    Args:
        query_embedding (list[float]): The embedding of the query text.
        num_results (int): The number of results to return.

    Returns:
        dict: The query results from ChromaDB.
    """
    if not is_ready():
        logger.error("ChromaDB service is not ready. Cannot query collection.")
        raise ConnectionError("ChromaDB service is not available.")

    try:
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=num_results
        )
        logger.info(f"Query returned {len(results.get('ids', [[]])[0])} results from '{COLLECTION_NAME}'.")
        return results
    except Exception as e:
        logger.error(f"An error occurred while querying ChromaDB: {e}")
        # Depending on the desired error handling, you might want to re-raise or handle differently
        raise
