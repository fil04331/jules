# tests/test_main.py
import pytest
import uuid
import io
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from main import app, access_secret_version

client = TestClient(app)

# --- Unit Tests for Helper Functions ---

@patch('main.secretmanager.SecretManagerServiceClient')
def test_access_secret_version_success(mock_secret_manager_service_client):
    """
    Tests that the `access_secret_version` function correctly decodes and returns the secret payload
    when the client call is successful.
    """
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.payload.data = b'my-secret-key'
    mock_client.access_secret_version.return_value = mock_response
    mock_secret_manager_service_client.return_value = mock_client

    secret_value = access_secret_version("projects/my-project/secrets/my-secret/versions/latest")

    assert secret_value == 'my-secret-key'
    mock_client.access_secret_version.assert_called_once_with(name="projects/my-project/secrets/my-secret/versions/latest")

@patch('main.secretmanager.SecretManagerServiceClient')
def test_access_secret_version_failure(mock_secret_manager_service_client):
    """
    Tests that the `access_secret_version` function returns None when the client call
    raises an exception.
    """
    mock_client = MagicMock()
    mock_client.access_secret_version.side_effect = Exception("API call failed")
    mock_secret_manager_service_client.return_value = mock_client

    secret_value = access_secret_version("projects/my-project/secrets/my-secret/versions/latest")

    assert secret_value is None

# --- Integration Tests for API Endpoints ---

def test_read_root():
    """
    Tests that the root endpoint returns a successful response with the expected message.
    """
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "message": "Backend de Jules.google v0.5.0 avec RAG (Vertex AI)."}

@patch('main.db')
@patch('main.model')
@patch('uuid.uuid4')
def test_generate_code_success(mock_uuid, mock_model, mock_db):
    """
    Tests that the /api/generate-code endpoint successfully generates and stores code.
    """
    mock_uuid.return_value = "test-uuid"

    mock_gemini_response = MagicMock()
    mock_gemini_response.text = "print('hello world')"
    mock_model.generate_content.return_value = mock_gemini_response

    mock_db_collection = MagicMock()
    mock_db_document = MagicMock()
    mock_db.collection.return_value = mock_db_collection
    mock_db_collection.document.return_value = mock_db_document

    request_data = {"prompt": "hello", "filename": "hello.py"}
    response = client.post("/api/generate-code", json=request_data)

    assert response.status_code == 200
    assert response.json()["code_id"] == "test-uuid"
    assert response.json()["filename"] == "hello.py"
    mock_db_collection.document.assert_called_once_with("test-uuid")
    mock_db_document.set.assert_called_once()

@patch('main.db')
def test_download_code_success(mock_db):
    """
    Tests successful retrieval and deletion of code from the download endpoint.
    """
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = {'code': 'print("hello")'}

    mock_doc_ref = MagicMock()
    mock_doc_ref.get.return_value = mock_doc

    mock_collection_ref = MagicMock()
    mock_collection_ref.document.return_value = mock_doc_ref
    mock_db.collection.return_value = mock_collection_ref

    response = client.get("/api/download-code/some-id?filename=test.py")

    assert response.status_code == 200
    assert response.content == b'print("hello")'
    mock_doc_ref.delete.assert_called_once()

@patch('main.db')
def test_download_code_not_found(mock_db):
    """
    Tests that the download endpoint returns a 404 if the code_id is not found.
    """
    mock_doc = MagicMock()
    mock_doc.exists = False
    mock_doc_ref = MagicMock()
    mock_doc_ref.get.return_value = mock_doc
    mock_collection_ref = MagicMock()
    mock_collection_ref.document.return_value = mock_doc_ref
    mock_db.collection.return_value = mock_collection_ref

    response = client.get("/api/download-code/non-existent-id?filename=test.py")

    assert response.status_code == 404

@patch('main.db')
@patch('main.model')
@patch('main.vector_search_endpoint', new=None)
def test_handle_chat_no_rag_context(mock_model, mock_db):
    """
    Tests chat functionality without RAG context.
    """
    mock_history_stream = []
    mock_messages_ref = MagicMock()
    mock_messages_ref.order_by.return_value.stream.return_value = mock_history_stream

    mock_session_ref = MagicMock()
    mock_session_ref.collection.return_value = mock_messages_ref
    mock_user_ref = MagicMock()
    mock_user_ref.collection.return_value.document.return_value = mock_session_ref
    mock_db.collection.return_value.document.return_value = mock_user_ref

    mock_chat_session = MagicMock()
    mock_gemini_response = MagicMock()
    mock_gemini_response.text = "This is a direct reply."
    mock_chat_session.send_message.return_value = mock_gemini_response
    mock_model.start_chat.return_value = mock_chat_session

    request_data = {
        "prompt": "Hello", "user_id": "test-user", "session_id": "test-session"
    }
    response = client.post("/api/chat", json=request_data)

    assert response.status_code == 200
    assert response.json()["reply"] == "This is a direct reply."
    assert mock_messages_ref.add.call_count == 2

@patch('main.db')
@patch('main.vector_search_endpoint')
@patch('main.genai.embed_content')
@patch('uuid.uuid4')
def test_upload_knowledge_txt_success(mock_uuid, mock_embed, mock_vector_search, mock_db):
    """
    Tests that a .txt file is successfully processed by the upload endpoint.
    """
    mock_uuid.side_effect = [f"test-uuid-{i}" for i in range(5)]
    mock_embed.return_value = {'embedding': [[0.1, 0.2, 0.3]]}

    file_content = b"This is a test file."
    files = {'file': ('test.txt', io.BytesIO(file_content), 'text/plain')}

    response = client.post("/api/upload", files=files)

    assert response.status_code == 200
    assert response.json()["filename"] == "test.txt"
    assert response.json()["chunks_added"] == 1

    mock_vector_search.upsert_datapoints.assert_called_once()
    mock_db.batch.return_value.commit.assert_called_once()
