"""
Broker Service

Business logic for broker account data and historical valuations.
"""

from flask import g, jsonify, request
import json
import base64
import os
import tempfile
from datetime import datetime

from encryption import get_encryption_service, EncryptedData
from database import get_wealth_database
from parsers.bank_statement_parser import BankStatementParser

encryption_service = get_encryption_service()
wealth_db = get_wealth_database()


def get_broker():
    """Get broker holdings and transactions"""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    parser = BankStatementParser()

    transactions = []
    holdings_dict = {}
    total_invested_chf = 0
    total_invested_eur = 0
    total_current_value_eur = 0

    try:
        broker_docs = wealth_db.list_file_attachments(tenant_id, file_types=['broker_viac_pdf', 'broker_ing_diba_csv'])
        
        if broker_docs:
            for doc in broker_docs:
                tmp_path = None
                try:
                    full_doc = wealth_db.get_file_attachment(tenant_id, doc['id'])
                    if not full_doc:
                        print(f"⚠️ Broker document {doc.get('id')} not found in database")
                        continue
                    
                    encryption_metadata = full_doc.get('encryption_metadata') or {}
                    if isinstance(encryption_metadata, str):
                        try:
                            encryption_metadata = json.loads(encryption_metadata)
                        except json.JSONDecodeError as e:
                            print(f"⚠️ Invalid encryption metadata for broker document {doc.get('id')}: {e}")
                            continue
                    
                    nonce_b64 = encryption_metadata.get('server_encryption', {}).get('nonce', '')
                    if not nonce_b64:
                        print(f"⚠️ Missing nonce in encryption metadata for broker document {doc.get('id')}")
                        continue
                    
                    try:
                        nonce = base64.b64decode(nonce_b64)
                    except Exception as e:
                        print(f"⚠️ Invalid nonce format for broker document {doc.get('id')}: {e}")
                        continue
                    
                    key_version = encryption_metadata.get('server_encryption', {}).get('key_version', 'none')
                    if key_version == 'none':
                        print(f"No server encryption found for broker document {doc.get('id')}, skipping")
                        continue
                    
                    # Decrypt server layer
                    associated_data = json.dumps(encryption_metadata, sort_keys=True).encode()
                    server_encrypted = EncryptedData(
                        ciphertext=full_doc['encrypted_data'],
                        nonce=nonce,
                        key_version=key_version,
                        algorithm='AES-256-GCM',
                        encrypted_at=encryption_metadata.get('server_encryption', {}).get('encrypted_at', '')
                    )
                    
                    client_ciphertext = encryption_service.decrypt_data(server_encrypted, tenant_id, associated_data)
                    
                    # Decrypt client layer
                    client_nonce_b64 = encryption_metadata.get('client_encryption', {}).get('nonce', '')
                    if not client_nonce_b64:
                        print(f"⚠️ Missing client nonce for broker document {doc.get('id')}")
                        continue
                    
                    client_nonce = base64.b64decode(client_nonce_b64)
                    client_algorithm = encryption_metadata.get('client_encryption', {}).get('algorithm', 'AES-GCM')
                    client_key_b64 = encryption_metadata.get('client_encryption', {}).get('key', '')
                    
                    if not client_key_b64:
                        print(f"⚠️ Missing client key for broker document {doc.get('id')}")
                        continue
                    
                    client_key = base64.b64decode(client_key_b64)
                    
                    # Decrypt client layer
                    if client_algorithm == 'AES-GCM':
                        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
                        aead = AESGCM(client_key)
                        decrypted_data = aead.decrypt(client_nonce, client_ciphertext, None)
                    else:
                        print(f"⚠️ Unsupported client encryption algorithm: {client_algorithm}")
                        continue
                    
                    # Save to temp file and parse
                    extension = os.path.splitext(encryption_metadata.get('file_info', {}).get('original_name', ''))[1]
                    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=extension)
                    tmp_path = tmp_file.name
                    tmp_file.write(decrypted_data)
                    tmp_file.close()
                    
                    # Parse based on document type
                    doc_type = doc.get('file_type', '')
                    if doc_type == 'broker_viac_pdf':
                        parsed_transactions = parser.parse_viac(tmp_path)
                        transactions.extend(parsed_transactions)
                    elif doc_type == 'broker_ing_diba_csv':
                        parsed_holdings = parser.parse_ing_diba(tmp_path)
                        # Aggregate by ISIN
                        for holding in parsed_holdings:
                            isin = holding['isin']
                            if isin not in holdings_dict:
                                holdings_dict[isin] = holding
                            else:
                                # Sum shares and costs
                                holdings_dict[isin]['shares'] += holding['shares']
                                holdings_dict[isin]['total_cost'] += holding['total_cost']
                                holdings_dict[isin]['current_value'] += holding['current_value']
                        
                except Exception as e:
                    print(f"Error processing broker document {doc.get('id')}: {e}")
                    import traceback
                    traceback.print_exc()
                finally:
                    if tmp_path and os.path.exists(tmp_path):
                        try:
                            os.remove(tmp_path)
                        except:
                            pass
    
    except Exception as e:
        print(f"Error retrieving broker documents: {e}")
        import traceback
        traceback.print_exc()
    
    # Convert holdings dict to list
    holdings = list(holdings_dict.values())
    
    # Calculate total invested and current value
    for holding in holdings:
        currency = holding.get('currency', 'EUR')
        if currency == 'CHF':
            total_invested_chf += holding.get('total_cost', 0)
        elif currency == 'EUR':
            total_invested_eur += holding.get('total_cost', 0)
            total_current_value_eur += holding.get('current_value', 0)
    
    # Calculate profit/loss
    profit_loss_eur = total_current_value_eur - total_invested_eur
    
    return jsonify({
        'transactions': transactions,
        'holdings': holdings,
        'total_invested_chf': total_invested_chf,
        'total_invested_eur': total_invested_eur,
        'total_current_value_eur': total_current_value_eur,
        'profit_loss_eur': profit_loss_eur
    })


def get_broker_historical_valuation():
    """
    Calculate historical portfolio valuation using prices from uploaded broker documents.
    Placeholder implementation - returns empty data.
    """
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'
    
    # Check for cached valuation
    refresh = request.args.get('refresh', 'false').lower() in ('1', 'true', 'yes')
    
    if not refresh:
        try:
            cached = wealth_db.get_broker_valuation_cache(tenant_id)
            if cached and cached.get("data"):
                return jsonify(cached["data"])
        except Exception as e:
            print(f"Error retrieving cached valuation: {e}")
    
    # Return empty placeholder data
    return jsonify({
        'time_series': [],
        'total_invested': 0,
        'current_value': 0,
        'profit_loss': 0
    })
