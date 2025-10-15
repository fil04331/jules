# auth.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin.auth
from firebase_admin import credentials

# Initialize a security scheme
bearer_scheme = HTTPBearer()

async def verify_token(creds: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    """
    Verifies a Firebase ID token and returns the decoded claims.

    This function is a FastAPI dependency that can be used to protect routes.

    Args:
        creds: The HTTP Authorization credentials containing the bearer token.

    Returns:
        The decoded token claims (payload) as a dictionary.

    Raises:
        HTTPException:
            - 401 Unauthorized if the token is missing, invalid, or expired.
            - 401 if the Authorization header is not in the 'Bearer <token>' format.
    """
    if not creds or not creds.scheme == "Bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization scheme.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # Verify the token against the Firebase project
        decoded_token = firebase_admin.auth.verify_id_token(creds.credentials)
        return decoded_token
    except firebase_admin.auth.InvalidIdTokenError:
        # Token is invalid
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase ID token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except firebase_admin.auth.ExpiredIdTokenError:
        # Token has expired
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase ID token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        # Handle other potential exceptions
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def verify_admin(decoded_token: dict = Depends(verify_token)) -> dict:
    """
    Verifies that the user is an admin by checking for an 'admin' claim.

    This dependency relies on `verify_token` to first validate the token.

    Args:
        decoded_token: The payload from the verified token.

    Returns:
        The decoded token claims if the user is an admin.

    Raises:
        HTTPException: 403 Forbidden if the 'admin' claim is not present or not true.
    """
    if not decoded_token.get("admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not authorized to access this resource.",
        )
    return decoded_token
