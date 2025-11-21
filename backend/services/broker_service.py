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
                    
                    # Get encryption metadata - check both encryption_metadata and metadata fields
                    # PostgreSQL JSONB might return as dict or string depending on driver
                    encryption_metadata_raw = full_doc.get('encryption_metadata') or full_doc.get('metadata')
                    encryption_metadata = {}
                    
                    if encryption_metadata_raw is None:
                        print(f"⚠️ No encryption metadata found for broker document {doc.get('id')}")
                        continue
                    elif isinstance(encryption_metadata_raw, dict):
                        encryption_metadata = encryption_metadata_raw
                    elif isinstance(encryption_metadata_raw, str):
                        try:
                            encryption_metadata = json.loads(encryption_metadata_raw)
                        except json.JSONDecodeError as e:
                            print(f"⚠️ Invalid encryption metadata JSON for broker document {doc.get('id')}: {e}")
                            continue
                    else:
                        print(f"⚠️ Unexpected encryption metadata type for broker document {doc.get('id')}: {type(encryption_metadata_raw)}")
                        continue
                    
                    # Get server encryption info
                    server_encryption = encryption_metadata.get('server_encryption', {})
                    nonce_b64 = server_encryption.get('nonce')
                    key_version = server_encryption.get('key_version')
                    
                    if not nonce_b64 or not key_version:
                        print(f"⚠️ Missing encryption information for broker document {doc.get('id')}: nonce={bool(nonce_b64)}, key_version={bool(key_version)}")
                        print(f"   Encryption metadata keys: {list(encryption_metadata.keys())}")
                        print(f"   Server encryption keys: {list(server_encryption.keys())}")
                        continue
                    
                    # Normalize key_version - "default" should be treated as None (use latest active key)
                    # The encryption service will resolve None to the active key version
                    normalized_key_version = None if key_version == 'default' else key_version
                    
                    try:
                        nonce = base64.b64decode(nonce_b64)
                    except Exception as e:
                        print(f"⚠️ Invalid nonce format for broker document {doc.get('id')}: {e}")
                        continue
                    
                    # Reconstruct the original metadata structure used during encryption
                    # The associated_data was created BEFORE nonce/key_version were added
                    # Also, checksum is added to file_info AFTER encryption in store_encrypted_file
                    # So we need to create a copy without those fields for associated_data
                    original_metadata = encryption_metadata.copy()
                    
                    # Remove fields from server_encryption that were added after encryption
                    if 'server_encryption' in original_metadata:
                        server_encryption_copy = original_metadata['server_encryption'].copy()
                        # Remove fields that were added after encryption
                        server_encryption_copy.pop('nonce', None)
                        server_encryption_copy.pop('key_version', None)
                        original_metadata['server_encryption'] = server_encryption_copy
                    
                    # Remove checksum from file_info (added after encryption in store_encrypted_file)
                    if 'file_info' in original_metadata:
                        file_info_copy = original_metadata['file_info'].copy()
                        file_info_copy.pop('checksum', None)
                        original_metadata['file_info'] = file_info_copy
                    
                    # Decrypt server layer - files are only encrypted server-side now
                    # Try multiple approaches to handle different encryption scenarios
                    decrypted_data = None
                    
                    # Also create a version of full metadata without checksum (for fallback attempts)
                    full_metadata_no_checksum = encryption_metadata.copy()
                    if 'file_info' in full_metadata_no_checksum:
                        file_info_no_checksum = full_metadata_no_checksum['file_info'].copy()
                        file_info_no_checksum.pop('checksum', None)
                        full_metadata_no_checksum['file_info'] = file_info_no_checksum
                    
                    decryption_attempts = [
                        # Method 1: Original metadata without nonce/key_version/checksum (correct way) with normalized key_version
                        ('original_metadata_normalized', lambda: json.dumps(original_metadata, sort_keys=True).encode(), normalized_key_version),
                        # Method 2: Original metadata with stored key_version
                        ('original_metadata_stored', lambda: json.dumps(original_metadata, sort_keys=True).encode(), key_version),
                        # Method 3: Full metadata without checksum (in case encryption was done after adding nonce/key_version)
                        ('full_metadata_no_checksum', lambda: json.dumps(full_metadata_no_checksum, sort_keys=True).encode(), normalized_key_version),
                        # Method 4: Full metadata with checksum (unlikely but worth trying)
                        ('full_metadata', lambda: json.dumps(encryption_metadata, sort_keys=True).encode(), normalized_key_version),
                        # Method 5: Try with None key_version (use latest active key)
                        ('none_key_version', lambda: json.dumps(original_metadata, sort_keys=True).encode(), None),
                    ]
                    
                    for method_name, get_associated_data, try_key_version in decryption_attempts:
                        try:
                            server_encrypted = EncryptedData(
                                ciphertext=full_doc['encrypted_data'],
                                nonce=nonce,
                                key_version=try_key_version,
                                algorithm='AES-256-GCM',
                                encrypted_at=server_encryption.get('encrypted_at', '')
                            )
                            
                            associated_data_attempt = get_associated_data()
                            decrypted_data = encryption_service.decrypt_data(server_encrypted, tenant_id, associated_data_attempt)
                            print(f"✅ Decryption succeeded for broker document {doc.get('id')} using method: {method_name}")
                            break
                        except Exception as attempt_error:
                            if method_name == decryption_attempts[-1][0]:  # Last attempt
                                print(f"❌ All decryption attempts failed for broker document {doc.get('id')}")
                                print(f"   Document ID: {doc.get('id')}")
                                print(f"   Stored key version: {key_version}")
                                print(f"   Normalized key version: {normalized_key_version}")
                                print(f"   Nonce length: {len(nonce)}")
                                print(f"   Ciphertext length: {len(full_doc.get('encrypted_data', b''))}")
                                # Print metadata structure for debugging
                                debug_metadata = {
                                    'document_type': encryption_metadata.get('document_type'),
                                    'server_encryption_keys': list(encryption_metadata.get('server_encryption', {}).keys()),
                                    'file_info_keys': list(encryption_metadata.get('file_info', {}).keys()),
                                    'original_metadata_keys': list(original_metadata.keys()),
                                    'original_file_info_keys': list(original_metadata.get('file_info', {}).keys()),
                                }
                                print(f"   Metadata structure: {json.dumps(debug_metadata, indent=2)}")
                                print(f"   Original metadata (for associated_data): {json.dumps(original_metadata, indent=2, default=str)}")
                                # Skip this document but continue processing others
                                continue
                    
                    if decrypted_data is None:
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
                        print(f"   Parsed {len(parsed_holdings)} ING DiBa holdings")
                        # Aggregate by ISIN
                        for holding in parsed_holdings:
                            isin = holding.get('isin', '')
                            if not isin:
                                print(f"   Warning: Holding missing ISIN: {holding}")
                                continue
                            if isin not in holdings_dict:
                                holdings_dict[isin] = holding.copy()  # Make a copy to avoid reference issues
                                print(f"   Added new holding: ISIN={isin}, account={holding.get('account')}, total_cost={holding.get('total_cost')}")
                            else:
                                # Sum shares and costs, preserve account field
                                holdings_dict[isin]['shares'] += holding.get('shares', 0)
                                holdings_dict[isin]['total_cost'] += holding.get('total_cost', 0)
                                holdings_dict[isin]['current_value'] += holding.get('current_value', 0)
                                # Ensure account field is preserved
                                if 'account' not in holdings_dict[isin] and holding.get('account'):
                                    holdings_dict[isin]['account'] = holding.get('account')
                                print(f"   Aggregated holding: ISIN={isin}, total_cost={holdings_dict[isin]['total_cost']}")
                        
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
    
    print(f"📊 Broker data summary:")
    print(f"   Transactions: {len(transactions)}")
    print(f"   Holdings: {len(holdings)}")
    for i, holding in enumerate(holdings):
        print(f"   Holding {i}: account={holding.get('account')}, currency={holding.get('currency')}, total_cost={holding.get('total_cost')}, current_value={holding.get('current_value')}")
    
    # Calculate totals by account type
    viac_total_invested = 0
    ing_diba_total_invested = 0
    ing_diba_total_current_value = 0
    
    # Calculate VIAC totals from transactions (VIAC uses transactions, not holdings)
    for transaction in transactions:
        if transaction.get('currency') == 'CHF':
            viac_total_invested += abs(transaction.get('amount', 0))
    
    print(f"   VIAC total from transactions: {viac_total_invested}")
    
    # Calculate ING DiBa totals from holdings
    for holding in holdings:
        account = holding.get('account', '')
        currency = holding.get('currency', 'EUR')
        total_cost = holding.get('total_cost', 0)
        current_value = holding.get('current_value', 0)
        
        print(f"   Processing holding: account='{account}', currency='{currency}', total_cost={total_cost}, current_value={current_value}")
        
        if account == 'ING DiBa':
            ing_diba_total_invested += total_cost
            ing_diba_total_current_value += current_value
        elif account == 'VIAC':
            # VIAC holdings (if any) - but usually VIAC uses transactions
            if currency == 'CHF':
                viac_total_invested += total_cost
    
    print(f"   Final totals: VIAC={viac_total_invested}, ING DiBa invested={ing_diba_total_invested}, ING DiBa current={ing_diba_total_current_value}")
    
    # Calculate overall totals
    total_invested_chf = viac_total_invested + ing_diba_total_invested * 1.08  # EUR to CHF conversion
    total_current_value_chf = viac_total_invested + ing_diba_total_current_value * 1.08  # EUR to CHF conversion
    
    # Build summary structure expected by frontend
    summary = {}
    if viac_total_invested > 0:
        summary['viac'] = {
            'total_invested': round(viac_total_invested, 2),
            'currency': 'CHF'
        }
    if ing_diba_total_invested > 0 or ing_diba_total_current_value > 0:
        summary['ing_diba'] = {
            'total_invested': round(ing_diba_total_invested, 2),
            'total_current_value': round(ing_diba_total_current_value, 2),
            'currency': 'EUR'
        }
    
    print(f"   Summary object: {summary}")
    
    # Always include summary, even if empty
    if not summary:
        summary = {}
    
    response_data = {
        'transactions': transactions,
        'holdings': holdings,
        'summary': summary,
        'total_invested_chf': round(total_invested_chf, 2),
        'total_invested_eur': round(ing_diba_total_invested, 2),
        'total_current_value_eur': round(ing_diba_total_current_value, 2),
        'profit_loss_eur': round(ing_diba_total_current_value - ing_diba_total_invested, 2)
    }
    
    print(f"   Response summary: {response_data.get('summary')}")
    print(f"   Response keys: {list(response_data.keys())}")
    
    return jsonify(response_data)


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
