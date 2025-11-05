"""
User Management Module for Wealth Management App

Handles user registration, authentication, password reset, and email verification.
Implements secure password hashing with bcrypt and token generation.
"""

import os
import secrets
import bcrypt
import smtplib
import atexit
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple
from email_validator import validate_email, EmailNotValidError
from itsdangerous import URLSafeTimedSerializer
from dotenv import load_dotenv

load_dotenv()


class UserManager:
    """
    Manages user operations including registration, authentication, and password reset
    """
    
    def __init__(self, db_connection):
        """
        Initialize UserManager
        
        Args:
            db_connection: Database connection object
        """
        self.db = db_connection
        self.secret_key = os.environ.get('WEALTH_SECRET_KEY', secrets.token_hex(32))
        self.serializer = URLSafeTimedSerializer(self.secret_key)
        
        # Email configuration
        self.smtp_host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(os.environ.get('SMTP_PORT', 587))
        self.smtp_user = os.environ.get('SMTP_USER', '')
        self.smtp_password = os.environ.get('SMTP_PASSWORD', '')
        self.smtp_from = os.environ.get('SMTP_FROM', self.smtp_user)
        self.app_url = os.environ.get('APP_URL', 'http://localhost:3000')
        
    def hash_password(self, password: str) -> str:
        """
        Hash a password using bcrypt
        
        Args:
            password: Plain text password
            
        Returns:
            Hashed password as string
        """
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    def verify_password(self, password: str, hashed: str) -> bool:
        """
        Verify a password against its hash
        
        Args:
            password: Plain text password
            hashed: Hashed password
            
        Returns:
            True if password matches, False otherwise
        """
        try:
            return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
        except Exception:
            return False
    
    def validate_email_address(self, email: str) -> Tuple[bool, Optional[str]]:
        """
        Validate an email address
        
        Args:
            email: Email address to validate
            
        Returns:
            Tuple of (is_valid, normalized_email or error_message)
        """
        try:
            validated = validate_email(email, check_deliverability=False)
            return True, validated.normalized
        except EmailNotValidError as e:
            return False, str(e)
    
    def generate_reset_token(self, email: str) -> str:
        """
        Generate a password reset token
        
        Args:
            email: User's email address
            
        Returns:
            Reset token
        """
        return self.serializer.dumps(email, salt='password-reset')
    
    def verify_reset_token(self, token: str, max_age: int = 3600) -> Optional[str]:
        """
        Verify a password reset token
        
        Args:
            token: Reset token
            max_age: Maximum age of token in seconds (default 1 hour)
            
        Returns:
            Email address if valid, None otherwise
        """
        try:
            email = self.serializer.loads(token, salt='password-reset', max_age=max_age)
            return email
        except Exception:
            return None
    
    def generate_verification_token(self, email: str) -> str:
        """
        Generate an email verification token
        
        Args:
            email: User's email address
            
        Returns:
            Verification token
        """
        return self.serializer.dumps(email, salt='email-verification')
    
    def verify_verification_token(self, token: str, max_age: int = 86400) -> Optional[str]:
        """
        Verify an email verification token
        
        Args:
            token: Verification token
            max_age: Maximum age of token in seconds (default 24 hours)
            
        Returns:
            Email address if valid, None otherwise
        """
        try:
            email = self.serializer.loads(token, salt='email-verification', max_age=max_age)
            return email
        except Exception:
            return None
    
    def send_email(self, to_email: str, subject: str, body_html: str) -> bool:
        """
        Send an email
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            body_html: HTML email body
            
        Returns:
            True if sent successfully, False otherwise
        """
        if not self.smtp_user or not self.smtp_password:
            print("⚠️  Email not configured. Would send email to:", to_email)
            print("Subject:", subject)
            print("Body:", body_html)
            return False
        
        try:
            msg = MIMEMultipart('alternative')
            msg['From'] = self.smtp_from
            msg['To'] = to_email
            msg['Subject'] = subject
            
            html_part = MIMEText(body_html, 'html')
            msg.attach(html_part)
            
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            
            return True
        except Exception as e:
            print(f"Error sending email: {e}")
            return False
    
    def send_verification_email(self, email: str, token: str) -> bool:
        """
        Send email verification email
        
        Args:
            email: User's email address
            token: Verification token
            
        Returns:
            True if sent successfully, False otherwise
        """
        verify_url = f"{self.app_url}/verify-email?token={token}"
        
        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #667eea;">Welcome to Wealth Manager!</h2>
                <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{verify_url}" 
                       style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Verify Email Address
                    </a>
                </div>
                <p style="color: #666; font-size: 14px;">
                    This link will expire in 24 hours. If you didn't create an account, please ignore this email.
                </p>
                <p style="color: #666; font-size: 14px;">
                    If the button doesn't work, copy and paste this link:<br>
                    <a href="{verify_url}">{verify_url}</a>
                </p>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(email, "Verify Your Email - Wealth Manager", html)
    
    def send_password_reset_email(self, email: str, token: str) -> bool:
        """
        Send password reset email
        
        Args:
            email: User's email address
            token: Reset token
            
        Returns:
            True if sent successfully, False otherwise
        """
        reset_url = f"{self.app_url}/reset-password?token={token}"
        
        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #667eea;">Password Reset Request</h2>
                <p>We received a request to reset your password. Click the button below to create a new password:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_url}" 
                       style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Reset Password
                    </a>
                </div>
                <p style="color: #666; font-size: 14px;">
                    This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.
                </p>
                <p style="color: #666; font-size: 14px;">
                    If the button doesn't work, copy and paste this link:<br>
                    <a href="{reset_url}">{reset_url}</a>
                </p>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(email, "Reset Your Password - Wealth Manager", html)
    
    def register_user(self, email: str, password: str, name: str, tenant_id: str = 'default') -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        """
        Register a new user
        
        Args:
            email: User's email address
            password: User's password
            name: User's full name
            tenant_id: Tenant identifier
            
        Returns:
            Tuple of (success, user_data, error_message)
        """
        # Validate email
        is_valid, result = self.validate_email_address(email)
        if not is_valid:
            return False, None, f"Invalid email: {result}"
        
        normalized_email = result
        
        # Validate password strength
        if len(password) < 8:
            return False, None, "Password must be at least 8 characters long"
        
        # Check if user already exists
        cursor = self.db.cursor()
        try:
            # Check by username (email)
            cursor.execute(
                """
                SELECT id FROM users 
                WHERE tenant_id = (SELECT id FROM tenants WHERE tenant_id = %s)
                AND username = %s
                """,
                (tenant_id, normalized_email)
            )
            if cursor.fetchone():
                return False, None, "Email already registered"
            
            # Hash password
            password_hash = self.hash_password(password)
            
            # Generate verification token
            verification_token = self.generate_verification_token(normalized_email)
            
            # Get tenant internal ID
            cursor.execute("SELECT id FROM tenants WHERE tenant_id = %s", (tenant_id,))
            tenant_row = cursor.fetchone()
            if not tenant_row:
                # Create tenant if doesn't exist
                cursor.execute(
                    "INSERT INTO tenants (tenant_id, name) VALUES (%s, %s) RETURNING id",
                    (tenant_id, tenant_id)
                )
                tenant_internal_id = cursor.fetchone()[0]
            else:
                tenant_internal_id = tenant_row[0]
            
            # Get latest key version
            cursor.execute(
                """
                SELECT key_version FROM encryption_keys 
                WHERE tenant_id = %s AND active = TRUE 
                ORDER BY created_at DESC LIMIT 1
                """,
                (tenant_internal_id,)
            )
            key_row = cursor.fetchone()
            key_version = key_row[0] if key_row else 'v1'
            
            # Insert user
            cursor.execute(
                """
                INSERT INTO users 
                (tenant_id, username, encrypted_email, encrypted_name, password_hash, 
                 key_version, verification_token, email_verified)
                VALUES (%s, %s, pgp_sym_encrypt(%s, %s), pgp_sym_encrypt(%s, %s), %s, %s, %s, FALSE)
                RETURNING id, created_at
                """,
                (tenant_internal_id, normalized_email, normalized_email, 
                 os.environ.get('WEALTH_DEK_KEY', 'dev-key'),
                 name, os.environ.get('WEALTH_DEK_KEY', 'dev-key'),
                 password_hash, key_version, verification_token)
            )
            user_id, created_at = cursor.fetchone()
            
            self.db.commit()
            
            # Send verification email (non-blocking - don't fail registration if email fails)
            try:
                self.send_verification_email(normalized_email, verification_token)
            except Exception as email_error:
                print(f"Warning: Failed to send verification email: {email_error}")
                # Don't fail registration if email fails
            
            return True, {
                'id': user_id,
                'email': normalized_email,
                'name': name,
                'created_at': created_at.isoformat(),
                'email_verified': False
            }, None
            
        except Exception as e:
            self.db.rollback()
            import traceback
            error_trace = traceback.format_exc()
            print(f"Error registering user: {e}")
            print(f"Traceback: {error_trace}")
            # Return the actual error message for debugging
            error_message = str(e) if str(e) else "Registration failed. Please try again."
            return False, None, error_message
        finally:
            cursor.close()
    
    def authenticate_user(self, email: str, password: str) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        """
        Authenticate a user
        
        Args:
            email: User's email address
            password: User's password
            
        Returns:
            Tuple of (success, user_data, error_message)
        """
        cursor = self.db.cursor()
        try:
            # Get user by email (username field)
            cursor.execute(
                """
                SELECT u.id, u.username, u.password_hash, u.active, u.email_verified,
                       pgp_sym_decrypt(u.encrypted_name, %s) as name,
                       t.tenant_id
                FROM users u
                JOIN tenants t ON u.tenant_id = t.id
                WHERE u.username = %s AND u.active = TRUE
                """,
                (os.environ.get('WEALTH_DEK_KEY', 'dev-key'), email)
            )
            
            user = cursor.fetchone()
            if not user:
                return False, None, "Invalid email or password"
            
            user_id, username, password_hash, active, email_verified, name, tenant_id = user
            
            # Verify password
            if not self.verify_password(password, password_hash):
                return False, None, "Invalid email or password"
            
            # Update last login
            cursor.execute(
                "UPDATE users SET last_login = %s WHERE id = %s",
                (datetime.now(timezone.utc), user_id)
            )
            self.db.commit()
            
            return True, {
                'id': user_id,
                'email': username,
                'name': name,
                'tenant_id': tenant_id,
                'email_verified': email_verified
            }, None
            
        except Exception as e:
            print(f"Error authenticating user: {e}")
            return False, None, "Authentication failed"
        finally:
            cursor.close()
    
    def request_password_reset(self, email: str) -> Tuple[bool, Optional[str]]:
        """
        Request a password reset
        
        Args:
            email: User's email address
            
        Returns:
            Tuple of (success, error_message)
        """
        cursor = self.db.cursor()
        try:
            # Check if user exists
            cursor.execute(
                "SELECT id FROM users WHERE username = %s AND active = TRUE",
                (email,)
            )
            user = cursor.fetchone()
            if not user:
                # Don't reveal if email exists or not for security
                return True, None
            
            user_id = user[0]
            
            # Generate reset token
            reset_token = self.generate_reset_token(email)
            reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
            
            # Store token in database
            cursor.execute(
                """
                UPDATE users 
                SET reset_token = %s, reset_token_expires = %s
                WHERE id = %s
                """,
                (reset_token, reset_expires, user_id)
            )
            self.db.commit()
            
            # Send reset email
            self.send_password_reset_email(email, reset_token)
            
            return True, None
            
        except Exception as e:
            self.db.rollback()
            print(f"Error requesting password reset: {e}")
            return False, "Failed to process password reset request"
        finally:
            cursor.close()
    
    def reset_password(self, token: str, new_password: str) -> Tuple[bool, Optional[str]]:
        """
        Reset a user's password
        
        Args:
            token: Reset token
            new_password: New password
            
        Returns:
            Tuple of (success, error_message)
        """
        # Validate new password
        if len(new_password) < 8:
            return False, "Password must be at least 8 characters long"
        
        # Verify token
        email = self.verify_reset_token(token)
        if not email:
            return False, "Invalid or expired reset token"
        
        cursor = self.db.cursor()
        try:
            # Check if token is still valid in database
            cursor.execute(
                """
                SELECT id, reset_token_expires 
                FROM users 
                WHERE username = %s AND reset_token = %s AND active = TRUE
                """,
                (email, token)
            )
            user = cursor.fetchone()
            if not user:
                return False, "Invalid reset token"
            
            user_id, reset_expires = user
            
            if datetime.now(timezone.utc) > reset_expires:
                return False, "Reset token has expired"
            
            # Hash new password
            password_hash = self.hash_password(new_password)
            
            # Update password and clear reset token
            cursor.execute(
                """
                UPDATE users 
                SET password_hash = %s, reset_token = NULL, reset_token_expires = NULL
                WHERE id = %s
                """,
                (password_hash, user_id)
            )
            self.db.commit()
            
            return True, None
            
        except Exception as e:
            self.db.rollback()
            print(f"Error resetting password: {e}")
            return False, "Failed to reset password"
        finally:
            cursor.close()
    
    def verify_email(self, token: str) -> Tuple[bool, Optional[str]]:
        """
        Verify a user's email address
        
        Args:
            token: Verification token
            
        Returns:
            Tuple of (success, error_message)
        """
        # Verify token
        email = self.verify_verification_token(token)
        if not email:
            return False, "Invalid or expired verification token"
        
        cursor = self.db.cursor()
        try:
            # Update email_verified status
            cursor.execute(
                """
                UPDATE users 
                SET email_verified = TRUE, verification_token = NULL
                WHERE username = %s AND verification_token = %s
                """,
                (email, token)
            )
            
            if cursor.rowcount == 0:
                return False, "Invalid verification token"
            
            self.db.commit()
            return True, None
            
        except Exception as e:
            self.db.rollback()
            print(f"Error verifying email: {e}")
            return False, "Failed to verify email"
        finally:
            cursor.close()

# Global instance
_user_manager = None
_user_manager_connection_context = None


def _cleanup_user_manager_connection():
    """Ensure the database connection opened for the user manager is closed on shutdown."""
    global _user_manager_connection_context
    if _user_manager_connection_context is not None:
        try:
            _user_manager_connection_context.__exit__(None, None, None)
        finally:
            _user_manager_connection_context = None


def get_user_manager(db_connection):
    """Get or create the global UserManager instance"""
    global _user_manager
    global _user_manager_connection_context

    if _user_manager is None:
        connection = db_connection

        if connection is None:
            raise ValueError('Database connection is required to initialize UserManager')

        # Allow callers to pass higher-level database helpers by extracting a raw connection when needed
        if not hasattr(connection, 'cursor'):
            context = None

            if hasattr(connection, 'get_connection'):
                context = connection.get_connection()
            elif hasattr(connection, 'db') and hasattr(connection.db, 'get_connection'):
                context = connection.db.get_connection()

            if context is None:
                raise ValueError('Unsupported database connection type provided to get_user_manager')

            connection = context.__enter__()
            _user_manager_connection_context = context
            atexit.register(_cleanup_user_manager_connection)

        _user_manager = UserManager(connection)

    return _user_manager

