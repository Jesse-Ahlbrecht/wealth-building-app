"""
AES-256 Encryption Utilities for Wealth Management App

Implements the AES-256 data protection strategy outlined in wealth.plan.md:
- AES-GCM for authenticated encryption of file blobs and sensitive data
- Key derivation using PBKDF2 with high iteration count
- Key versioning for rotation support
- Hardware-accelerated AES operations where available

Security Model:
- Data Encryption Keys (DEKs): Unique 256-bit keys per tenant/dataset
- Key Encryption Keys (KEKs): Master keys that wrap DEKs, stored in cloud KMS
- Envelope encryption: DEKs encrypt data, KEKs encrypt DEKs
"""

import os
import json
import base64
import hashlib
import secrets
from typing import Dict, Tuple, Optional, Any
from dataclasses import dataclass
from datetime import datetime, timezone
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend
from cryptography.exceptions import InvalidTag


@dataclass
class EncryptedData:
    """Container for encrypted data with metadata"""
    ciphertext: bytes
    nonce: bytes
    key_version: str
    algorithm: str = "AES-256-GCM"
    encrypted_at: str = None

    def __post_init__(self):
        if self.encrypted_at is None:
            self.encrypted_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'ciphertext': base64.b64encode(self.ciphertext).decode('ascii'),
            'nonce': base64.b64encode(self.nonce).decode('ascii'),
            'key_version': self.key_version,
            'algorithm': self.algorithm,
            'encrypted_at': self.encrypted_at
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'EncryptedData':
        """Create from dictionary (deserialization)"""
        return cls(
            ciphertext=base64.b64decode(data['ciphertext']),
            nonce=base64.b64decode(data['nonce']),
            key_version=data['key_version'],
            algorithm=data.get('algorithm', 'AES-256-GCM'),
            encrypted_at=data.get('encrypted_at')
        )


class KeyManager:
    """
    Manages encryption keys with versioning and rotation support

    In production, this would integrate with cloud KMS (AWS KMS, Azure Key Vault, GCP KMS)
    For development, uses PBKDF2-derived keys from environment/master key
    """

    def __init__(self, master_key: Optional[bytes] = None):
        """
        Initialize key manager

        Args:
            master_key: Master key for development (32 bytes). In production,
                       this comes from cloud KMS via instance metadata.
        """
        if master_key is None:
            # In production, get from cloud KMS
            # For development, derive from environment or generate
            env_key = os.environ.get('WEALTH_MASTER_KEY')
            if env_key:
                # Derive master key from environment variable
                master_key = self._derive_key_from_password(env_key.encode(), b'wealth-app-master')
            else:
                # Generate a random master key (development only - not secure for production)
                print("WARNING: Using random master key - NOT SECURE FOR PRODUCTION")
                master_key = secrets.token_bytes(32)

        if len(master_key) != 32:
            raise ValueError("Master key must be 32 bytes (256 bits)")

        self.master_key = master_key
        self._key_cache: Dict[str, bytes] = {}
        self._key_versions: Dict[str, Dict] = {}

        # Load key versions from disk (in production, this would be in KMS)
        self._load_key_versions()

    def _derive_key_from_password(self, password: bytes, salt: bytes) -> bytes:
        """Derive a 256-bit key from password using PBKDF2"""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,  # High iteration count for security
            backend=default_backend()
        )
        return kdf.derive(password)

    def _load_key_versions(self):
        """Load key version metadata from disk"""
        try:
            with open(os.path.join(os.path.dirname(__file__), 'key_versions.json'), 'r') as f:
                self._key_versions = json.load(f)
        except FileNotFoundError:
            # Initialize with default key version
            self._key_versions = {
                'default': {
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'active': True,
                    'algorithm': 'AES-256-GCM'
                }
            }
            self._save_key_versions()

    def _save_key_versions(self):
        """Save key version metadata to disk"""
        with open(os.path.join(os.path.dirname(__file__), 'key_versions.json'), 'w') as f:
            json.dump(self._key_versions, f, indent=2)

    def get_data_encryption_key(self, tenant_id: str = 'default', key_version: Optional[str] = None) -> Tuple[bytes, str]:
        """
        Get a data encryption key (DEK) for the specified tenant

        In production, DEKs are wrapped by KEKs in cloud KMS.
        Here we derive tenant-specific keys from the master key.

        Args:
            tenant_id: Identifier for the tenant/dataset
            key_version: Specific key version to use (None for latest active)

        Returns:
            Tuple of (dek, key_version)
        """
        if key_version is None:
            key_version = self._get_active_key_version()

        cache_key = f"{tenant_id}:{key_version}"
        if cache_key in self._key_cache:
            return self._key_cache[cache_key], key_version

        # Derive tenant-specific DEK from master key
        # In production, this would unwrap from KMS
        tenant_salt = f"wealth-dek-{tenant_id}-{key_version}".encode()
        dek = self._derive_key_from_password(self.master_key, tenant_salt)

        # Cache the key (in production, cache would have TTL and rotation)
        self._key_cache[cache_key] = dek

        return dek, key_version

    def _get_active_key_version(self) -> str:
        """Get the currently active key version"""
        for version, metadata in self._key_versions.items():
            if metadata.get('active', False):
                return version
        return 'default'

    def rotate_key(self, tenant_id: str = 'default') -> str:
        """
        Rotate to a new key version for the tenant

        Returns:
            New key version identifier
        """
        new_version = f"v{int(datetime.now(timezone.utc).timestamp())}"

        self._key_versions[new_version] = {
            'created_at': datetime.now(timezone.utc).isoformat(),
            'active': True,
            'algorithm': 'AES-256-GCM',
            'rotated_from': self._get_active_key_version()
        }

        # Deactivate old version
        old_version = self._get_active_key_version()
        if old_version in self._key_versions:
            self._key_versions[old_version]['active'] = False

        self._save_key_versions()

        # Clear cache for this tenant
        keys_to_remove = [k for k in self._key_cache.keys() if k.startswith(f"{tenant_id}:")]
        for key in keys_to_remove:
            del self._key_cache[key]

        return new_version


class EncryptionService:
    """
    High-level encryption service implementing the wealth app's data protection strategy
    """

    def __init__(self, key_manager: Optional[KeyManager] = None):
        self.key_manager = key_manager or KeyManager()

    def encrypt_data(self, data: bytes, tenant_id: str = 'default',
                    associated_data: Optional[bytes] = None) -> EncryptedData:
        """
        Encrypt data using AES-256-GCM

        Args:
            data: Plaintext data to encrypt
            tenant_id: Tenant identifier for key derivation
            associated_data: Additional authenticated data (AAD)

        Returns:
            EncryptedData container with ciphertext, nonce, and metadata
        """
        dek, key_version = self.key_manager.get_data_encryption_key(tenant_id)

        # Generate a random 96-bit nonce (GCM standard)
        nonce = secrets.token_bytes(12)

        # Create AES-GCM cipher
        aesgcm = AESGCM(dek)

        # Encrypt with associated data if provided
        ciphertext = aesgcm.encrypt(nonce, data, associated_data)

        return EncryptedData(
            ciphertext=ciphertext,
            nonce=nonce,
            key_version=key_version
        )

    def decrypt_data(self, encrypted_data: EncryptedData, tenant_id: str = 'default',
                    associated_data: Optional[bytes] = None) -> bytes:
        """
        Decrypt data using AES-256-GCM

        Args:
            encrypted_data: EncryptedData container
            tenant_id: Tenant identifier for key derivation
            associated_data: Additional authenticated data (AAD) used during encryption

        Returns:
            Decrypted plaintext

        Raises:
            InvalidTag: If decryption fails (authentication failure)
        """
        dek, _ = self.key_manager.get_data_encryption_key(tenant_id, encrypted_data.key_version)

        aesgcm = AESGCM(dek)

        try:
            plaintext = aesgcm.decrypt(encrypted_data.nonce, encrypted_data.ciphertext, associated_data)
            return plaintext
        except InvalidTag as e:
            raise ValueError("Decryption failed - data may be corrupted or key incorrect") from e

    def encrypt_json(self, data: Dict[str, Any], tenant_id: str = 'default') -> EncryptedData:
        """
        Encrypt JSON-serializable data

        Args:
            data: Dictionary to encrypt
            tenant_id: Tenant identifier

        Returns:
            EncryptedData container
        """
        json_bytes = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        return self.encrypt_data(json_bytes, tenant_id)

    def decrypt_json(self, encrypted_data: EncryptedData, tenant_id: str = 'default') -> Dict[str, Any]:
        """
        Decrypt and parse JSON data

        Args:
            encrypted_data: EncryptedData container
            tenant_id: Tenant identifier

        Returns:
            Decrypted dictionary
        """
        json_bytes = self.decrypt_data(encrypted_data, tenant_id)
        return json.loads(json_bytes.decode('utf-8'))

    def encrypt_file(self, file_path: str, tenant_id: str = 'default') -> EncryptedData:
        """
        Encrypt a file's contents

        Args:
            file_path: Path to file to encrypt
            tenant_id: Tenant identifier

        Returns:
            EncryptedData container
        """
        with open(file_path, 'rb') as f:
            data = f.read()
        return self.encrypt_data(data, tenant_id, associated_data=os.path.basename(file_path).encode())

    def decrypt_to_file(self, encrypted_data: EncryptedData, output_path: str,
                       tenant_id: str = 'default', associated_data: Optional[bytes] = None):
        """
        Decrypt data and write to file

        Args:
            encrypted_data: EncryptedData container
            output_path: Path to write decrypted data
            tenant_id: Tenant identifier
            associated_data: Additional authenticated data
        """
        plaintext = self.decrypt_data(encrypted_data, tenant_id, associated_data)
        with open(output_path, 'wb') as f:
            f.write(plaintext)

    def decrypt_client_layer(self, ciphertext: bytes, session_token: str, client_metadata: Dict[str, Any]) -> bytes:
        """
        Decrypt client-side encryption layer using session token
        
        Args:
            ciphertext: The client-encrypted data
            session_token: User's session token for key derivation
            client_metadata: Metadata containing nonce, salt info, and AAD
            
        Returns:
            Decrypted plaintext (original file content)
        """
        tenant_id = client_metadata.get('tenantId', 'default')
        
        # Reconstruct nonce and AAD from integer arrays
        nonce = bytes(client_metadata.get('nonce', []))
        aad = bytes(client_metadata.get('additionalData', []))
        
        # Derive key matching frontend implementation:
        # PBKDF2(sessionToken, salt='wealth-file-{tenantId}', iterations=100000, len=32, hash=SHA-256)
        salt = f"wealth-file-{tenant_id}".encode()
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
            backend=default_backend()
        )
        key = kdf.derive(session_token.encode())
        
        # Decrypt
        aesgcm = AESGCM(key)
        try:
            return aesgcm.decrypt(nonce, ciphertext, aad)
        except InvalidTag as e:
            raise ValueError("Client-side decryption failed - invalid tag or corrupted data") from e



# Global encryption service instance
# In production, this would be initialized with cloud KMS integration
_encryption_service = None

def get_encryption_service() -> EncryptionService:
    """Get the global encryption service instance"""
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service


# Convenience functions for easy use throughout the app
def encrypt_sensitive_data(data: Dict[str, Any], tenant_id: str = 'default') -> str:
    """
    Encrypt sensitive data and return as base64-encoded JSON string
    This is used for storing encrypted data in configuration files
    """
    service = get_encryption_service()
    encrypted = service.encrypt_json(data, tenant_id)
    return base64.b64encode(json.dumps(encrypted.to_dict()).encode()).decode()

def decrypt_sensitive_data(encrypted_b64: str, tenant_id: str = 'default') -> Dict[str, Any]:
    """
    Decrypt sensitive data from base64-encoded JSON string
    """
    service = get_encryption_service()
    encrypted_dict = json.loads(base64.b64decode(encrypted_b64).decode())
    encrypted_data = EncryptedData.from_dict(encrypted_dict)
    return service.decrypt_json(encrypted_data, tenant_id)



