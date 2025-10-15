"""
This module contains utility functions for the RAG pipeline.
"""
import json
import re
import logging

logger = logging.getLogger(__name__)

def rerank_documents(query: str, documents: list[str], model, top_n: int = 3):
    """
    Re-ranks a list of documents based on their relevance to a query using a Gemini model.

    Args:
        query: The user's query.
        documents: A list of document texts to be re-ranked.
        model: The initialized GenerativeModel instance.
        top_n: The number of top documents to return.

    Returns:
        A list of the top N most relevant document texts, sorted by relevance.
        Returns the original top N documents if re-ranking fails.
    """
    if not documents:
        return []

    # Prepare the prompt for the model
    # Using a structured prompt to get a predictable JSON output.
    prompt = f"""You are a re-ranking expert. Your task is to evaluate the relevance of the following documents to the user's query.
Return a JSON array of objects, where each object has an "id" (the original index of the document) and a "relevance_score" (a float from 0.0 to 1.0).
Do not include any other text or explanations in your response, only the JSON array.

User Query: "{query}"

Documents to re-rank:
"""
    for i, doc in enumerate(documents):
        # Adding a separator and limiting doc length to avoid overly long prompts
        doc_snippet = doc[:1500] + '...' if len(doc) > 1500 else doc
        prompt += f'--- Document {i} ---\n{doc_snippet}\n\n'

    prompt += """
JSON Output:
"""

    try:
        response = model.generate_content(prompt)
        # A more robust way to find and parse JSON from the model's response
        response_text = response.text.strip()
        json_match = re.search(r'\[\s*\{.*\}\s*\]', response_text, re.DOTALL)
        if not json_match:
            logger.warning(f"Re-ranking response did not contain valid JSON. Response: {response_text}")
            return documents[:top_n]

        json_response_str = json_match.group(0)
        rerank_results = json.loads(json_response_str)

        # Validate the structure of the results
        if not all('id' in item and 'relevance_score' in item for item in rerank_results):
            logger.warning(f"Re-ranking JSON is missing 'id' or 'relevance_score'. Data: {rerank_results}")
            return documents[:top_n]


        # Sort results by score
        rerank_results.sort(key=lambda x: x.get('relevance_score', 0), reverse=True)

        # Create the re-ranked list of documents
        reranked_docs = [documents[result['id']] for result in rerank_results if result['id'] < len(documents)]

        return reranked_docs[:top_n]

    except (json.JSONDecodeError, AttributeError, KeyError, Exception) as e:
        logger.error(f"An exception occurred during re-ranking: {e}. Falling back to original document order.")
        # Fallback to returning the top N documents without re-ranking
        return documents[:top_n]

def extract_keywords(query: str, model):
    """
    Extracts keywords from a query using the Gemini model.

    Args:
        query: The user's query.
        model: The initialized GenerativeModel instance.

    Returns:
        A list of keywords.
    """
    prompt = f"""You are an expert in keyword extraction. Your task is to extract the most relevant keywords from the user's query.
Return a JSON array of strings, where each string is a keyword.
Do not include any other text or explanations in your response, only the JSON array.

User Query: "{query}"

JSON Output:
"""
    try:
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
        if not json_match:
            logger.warning(f"Keyword extraction response did not contain valid JSON. Response: {response_text}")
            return []

        json_response_str = json_match.group(0)
        keywords = json.loads(json_response_str)

        # Basic validation
        if isinstance(keywords, list) and all(isinstance(k, str) for k in keywords):
            return keywords
        else:
            logger.warning(f"Extracted keywords are not a list of strings. Data: {keywords}")
            return []

    except (json.JSONDecodeError, AttributeError, KeyError, Exception) as e:
        logger.error(f"An exception occurred during keyword extraction: {e}. Falling back to an empty list.")
        return []
