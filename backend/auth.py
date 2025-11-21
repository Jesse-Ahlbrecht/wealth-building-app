"""
Authentication and Authorization Utilities for Wealth Management App

Implements the secure authentication strategy from wealth.plan.md:
- Short-lived JWTs with PASETO payload encryption
- HMAC payload signing for API responses
- Stateless session management
- Zero implicit trust boundaries

Security Model:
- JWTs contain minimal claims with short expiration (15 minutes)
- PASETO provides authenticated encryption for token payloads
- HMAC signatures ensure response integrity
- All API responses are signed to prevent tampering
"""

import os
import json
import base64
import secrets
import hashlib
import hmac
from typing import Dict, Optional, Any, Tuple
from datetime import datetime, timezone, timedelta
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend


class PayloadSigner:
    """
    HMAC-based payload signing for API response integrity

    Signs all API responses to ensure they haven't been tampered with
    """

    def __init__(self, secret_key: Optional[bytes] = None):
        if secret_key is None:
            # In production, this should come from KMS
            env_key = os.environ.get('WEALTH_HMAC_SECRET')
            if env_key:
                secret_key = self._derive_key_from_password(env_key.encode(), b'wealth-hmac')
            else:
                # Development fallback - NOT SECURE FOR PRODUCTION
                print("WARNING: Using random HMAC key - NOT SECURE FOR PRODUCTION")
                secret_key = secrets.token_bytes(32)

        if len(secret_key) != 32:
            raise ValueError("HMAC secret key must be 32 bytes (256 bits)")

        self.secret_key = secret_key

    def _derive_key_from_password(self, password: bytes, salt: bytes) -> bytes:
        """Derive a 256-bit key from password using PBKDF2"""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
            backend=default_backend()
        )
        return kdf.derive(password)

    def sign_payload(self, payload: Dict[str, Any], timestamp: Optional[datetime] = None) -> str:
        """
        Sign a JSON payload with HMAC-SHA256

        Args:
            payload: Dictionary to sign
            timestamp: Optional timestamp (defaults to now)

        Returns:
            Base64-encoded signature
        """
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)

        # Create canonical payload string (sorted keys for consistency)
        canonical_payload = json.dumps(payload, sort_keys=True, separators=(',', ':'))

        # Add timestamp to prevent replay attacks
        timestamp_str = timestamp.isoformat()
        message = f"{timestamp_str}|{canonical_payload}"

        # Create HMAC signature
        signature = hmac.new(
            self.secret_key,
            message.encode('utf-8'),
            hashlib.sha256
        ).digest()

        # Return signature as base64
        return base64.b64encode(signature).decode('ascii')

    def verify_signature(self, payload: Dict[str, Any], signature: str,
                        timestamp: datetime, max_age_seconds: int = 300) -> bool:
        """
        Verify a payload signature

        Args:
            payload: The payload that was signed
            signature: Base64-encoded signature to verify
            timestamp: Timestamp when signature was created
            max_age_seconds: Maximum age of signature (default 5 minutes)

        Returns:
            True if signature is valid and not expired
        """
        # Check timestamp age
        now = datetime.now(timezone.utc)
        if (now - timestamp).total_seconds() > max_age_seconds:
            return False

        # Recreate signature
        expected_signature = self.sign_payload(payload, timestamp)

        # Compare signatures using constant-time comparison
        try:
            expected_bytes = base64.b64decode(expected_signature)
            provided_bytes = base64.b64decode(signature)
            return hmac.compare_digest(expected_bytes, provided_bytes)
        except Exception:
            return False

    def create_signed_response(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a signed API response

        Args:
            data: Response data dictionary

        Returns:
            Response with signature and timestamp
        """
        timestamp = datetime.now(timezone.utc)
        signature = self.sign_payload(data, timestamp)

        return {
            'data': data,
            'signature': signature,
            'timestamp': timestamp.isoformat()
        }

    def verify_signed_response(self, response: Dict[str, Any]) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Verify a signed API response

        Args:
            response: Response dictionary with signature

        Returns:
            Tuple of (is_valid, data) where data is None if invalid
        """
        try:
            data = response.get('data')
            signature = response.get('signature')
            timestamp_str = response.get('timestamp')

            if not all([data, signature, timestamp_str]):
                return False, None

            timestamp = datetime.fromisoformat(timestamp_str)

            if self.verify_signature(data, signature, timestamp):
                return True, data
            else:
                return False, None

        except Exception:
            return False, None


class TokenManager:
    """
    JWT/PASETO token management with authenticated encryption

    Uses AES-GCM encryption for token payloads (PASETO v2 style)
    """

    def __init__(self, encryption_key: Optional[bytes] = None):
        if encryption_key is None:
            # In production, get from KMS
            env_key = os.environ.get('WEALTH_TOKEN_KEY')
            if env_key:
                encryption_key = self._derive_key_from_password(env_key.encode(), b'wealth-token')
            else:
                # Development fallback
                print("WARNING: Using random token encryption key - NOT SECURE FOR PRODUCTION")
                encryption_key = secrets.token_bytes(32)

        if len(encryption_key) != 32:
            raise ValueError("Token encryption key must be 32 bytes (256 bits)")

        self.encryption_key = encryption_key

    def _derive_key_from_password(self, password: bytes, salt: bytes) -> bytes:
        """Derive a 256-bit key from password using PBKDF2"""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
            backend=default_backend()
        )
        return kdf.derive(password)

    def create_token(self, claims: Dict[str, Any], expiration_minutes: int = 15) -> str:
        """
        Create an encrypted token (PASETO-style)

        Args:
            claims: JWT claims dictionary
            expiration_minutes: Token lifetime in minutes

        Returns:
            Base64-encoded encrypted token
        """
        now = datetime.now(timezone.utc)

        # Add standard claims
        token_data = {
            'iss': 'wealth-app',
            'iat': int(now.timestamp()),
            'exp': int((now + timedelta(minutes=expiration_minutes)).timestamp()),
            'jti': secrets.token_hex(16),  # Unique token ID
            **claims
        }

        # Encrypt the token data
        json_payload = json.dumps(token_data, separators=(',', ':')).encode('utf-8')
        nonce = secrets.token_bytes(12)  # 96-bit nonce for GCM

        aesgcm = AESGCM(self.encryption_key)
        ciphertext = aesgcm.encrypt(nonce, json_payload, None)

        # Create PASETO v2 style token: v2.local.nonce.ciphertext
        token_parts = [
            base64.urlsafe_b64encode(nonce).decode('ascii').rstrip('='),
            base64.urlsafe_b64encode(ciphertext).decode('ascii').rstrip('=')
        ]

        return f"v2.local.{'.'.join(token_parts)}"

    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify and decrypt a token

        Args:
            token: Encrypted token string

        Returns:
            Decrypted claims if valid, None if invalid/expired
        """
        try:
            # Parse PASETO v2 token
            if not token.startswith('v2.local.'):
                return None

            parts = token[9:].split('.')  # Remove 'v2.local.'
            if len(parts) != 2:
                return None

            nonce_b64, ciphertext_b64 = parts

            # Decode base64 (add padding if needed)
            nonce_b64 += '=' * (4 - len(nonce_b64) % 4)
            ciphertext_b64 += '=' * (4 - len(ciphertext_b64) % 4)

            nonce = base64.urlsafe_b64decode(nonce_b64)
            ciphertext = base64.urlsafe_b64decode(ciphertext_b64)

            # Decrypt
            aesgcm = AESGCM(self.encryption_key)
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)

            # Parse JSON
            token_data = json.loads(plaintext.decode('utf-8'))

            # Verify expiration
            now = datetime.now(timezone.utc).timestamp()
            if token_data.get('exp', 0) < now:
                return None

            # Verify issuer
            if token_data.get('iss') != 'wealth-app':
                return None

            return token_data

        except Exception:
            return None

    def refresh_token(self, token: str, new_expiration_minutes: int = 15) -> Optional[str]:
        """
        Create a new token with extended expiration from a valid token

        Args:
            token: Existing valid token
            new_expiration_minutes: New expiration time

        Returns:
            New token if original was valid, None otherwise
        """
        claims = self.verify_token(token)
        if claims is None:
            return None

        # Remove standard claims before creating new token
        user_claims = {k: v for k, v in claims.items()
                      if k not in ['iss', 'iat', 'exp', 'jti']}

        return self.create_token(user_claims, new_expiration_minutes)


class SessionManager:
    """
    Stateless session management using encrypted tokens
    """

    def __init__(self):
        self.token_manager = TokenManager()
        self.payload_signer = PayloadSigner()

    def create_session(self, user_id: str, tenant_id: str = 'default',
                      additional_claims: Optional[Dict[str, Any]] = None) -> str:
        """
        Create a new session token

        Args:
            user_id: Unique user identifier
            tenant_id: Tenant/organization identifier
            additional_claims: Extra claims to include

        Returns:
            Session token
        """
        claims = {
            'sub': user_id,
            'tenant': tenant_id,
            'type': 'session'
        }

        if additional_claims:
            claims.update(additional_claims)

        return self.token_manager.create_token(claims, expiration_minutes=15)

    def validate_session(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Validate a session token

        Args:
            token: Session token to validate

        Returns:
            Session claims if valid, None otherwise
        """
        claims = self.token_manager.verify_token(token)
        if claims is None:
            return None

        if claims.get('type') != 'session':
            return None

        return claims

    def create_signed_api_response(self, data: Dict[str, Any], session_token: Optional[str] = None) -> Dict[str, Any]:
        """
        Create a signed API response, optionally including a new session token

        Args:
            data: Response data
            session_token: Current session token (will be refreshed if valid)

        Returns:
            Signed response with optional new session token
        """
        response_data = data.copy()

        # Include new session token if current one is valid
        if session_token:
            new_token = self.token_manager.refresh_token(session_token)
            if new_token:
                response_data['session_token'] = new_token

        return self.payload_signer.create_signed_response(response_data)

    def validate_api_request(self, request_data: Dict[str, Any],
                           session_token: Optional[str] = None) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Validate an API request

        Args:
            request_data: Request payload
            session_token: Optional session token from request

        Returns:
            Tuple of (is_valid, session_claims)
        """
        # Validate session token if provided
        session_claims = None
        if session_token:
            session_claims = self.validate_session(session_token)
            if session_claims is None:
                return False, None

        return True, session_claims


# Global instances
_session_manager = None

def get_session_manager() -> SessionManager:
    """Get the global session manager instance"""
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager





