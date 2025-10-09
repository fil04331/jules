# Gemini Project Guide for "Jules" AI Assistant

This document provides context and guidelines for developing the "Jules" AI assistant project. It ensures that any modifications or new features align with the project's architecture and best practices.

## 1. Project Overview

"Jules" is a full-stack AI developer assistant.
- **Frontend:** Built with Next.js, TypeScript, and Tailwind CSS.
- **Backend:** A Python API using FastAPI, powered by the Google Gemini 1.5 Flash model.
- **Features:** The application includes a chat interface, a code/project generator, a code reviewer, and the ability to import and analyze Git repositories. It uses a RAG (Retrieval-Augmented Generation) pipeline with ChromaDB for context-aware responses.

---

## 2. Key Improvement Directives

When modifying the codebase, please adhere to the following improvement strategies. These are the current priorities for enhancing the project's quality, scalability, and security.

### I. Frontend Best Practices

1.  **Use CSS Modules for Styling:**
    - **DO NOT** write CSS inside `<style>` tags or use inline styles in JSX/TSX files.
    - **DO** create a `.module.css` file for each component that requires unique styles.
    - **DO** import the styles object and apply classes using `styles.className`. This ensures all styling is component-scoped, modular, and maintainable.
    - **Rationale:** This is the standard, recommended way to handle CSS in Next.js, preventing global namespace pollution and improving code organization.

2.  **Componentize Large Pages:**
    - **DO** break down large, monolithic components (like `StudioPage`) into smaller, single-responsibility components.
    - For example, `StudioPage` should be refactored into `ProjectGenerator`, `RepoImporter`, and an `EditorView`, which itself would contain smaller components like `FileExplorer` and `CodeEditor`.
    - **Rationale:** This improves code readability, reusability, and makes state management simpler.

### II. Backend Robustness and Scalability

1.  **Implement Robust Error Handling:**
    - **DO NOT** use generic `except Exception:` blocks that return a vague 500 error.
    - **DO** create specific, reusable error handling utilities in FastAPI.
    - **DO** provide meaningful error messages to the frontend so the user understands what went wrong (e.g., "AI model unavailable," "Invalid Git URL").
    - **Rationale:** Clear error handling is crucial for debugging and creating a good user experience.

2.  **Use a Persistent Cache:**
    - **DO NOT** use the in-memory Python dictionary (`generated_code_cache`) for caching generated code.
    - **DO** replace the in-memory cache with a persistent, scalable solution like **Redis**.
    - **Rationale:** The current in-memory cache is not scalable across multiple server instances and loses all data on restart. Redis is the industry standard for this use case.

### III. Security

1.  **Secure All API Endpoints:**
    - **DO NOT** leave API endpoints open to the public.
    - **DO** implement API key authentication for the backend.
    - Use FastAPI's `Security` dependencies to require a secret API key in the request headers. Reject any request that does not provide a valid key.
    - **Rationale:** This is a critical security measure to prevent unauthorized access and abuse of the expensive Gemini API.

---

By following these guidelines, we can ensure that the "Jules" project becomes more robust, secure, and maintainable as it evolves.
