"""
Accounts Routes

Handles account listing and summary.

Note: This route contains complex logic that should be moved to a service layer.
For now, it's extracted as-is for modularity.
"""

import os
import json
import base64
import traceback
import tempfile
from flask import Blueprint, g, jsonify
from database import get_wealth_database
from encryption import get_encryption_service, EncryptedData
from middleware.auth_middleware import authenticate_request, require_auth

accounts_bp = Blueprint('accounts', __name__, url_prefix='/api')
wealth_db = get_wealth_database()
encryption_service = get_encryption_service()


@accounts_bp.route('/accounts')
@authenticate_request
@require_auth
def get_accounts():
    """Get accounts from database with broker aggregation"""
    tenant_id = g.session_claims.get('tenant', 'default') if g.session_claims else 'default'

    try:
        # Import parser here to avoid circular dependency
        from parsers.bank_statement_parser import BankStatementParser
        parser = BankStatementParser()
        
        accounts = wealth_db.get_accounts(tenant_id)

        accounts_list = []
        totals = {'EUR': 0, 'CHF': 0}

        # Add bank accounts
        if accounts:
            for account in accounts:
                account_summary = {
                    'account': account['account_name'],
                    'balance': float(account['balance']) if account['balance'] else 0,
                    'currency': account['currency'],
                    'transaction_count': 0,
                    'last_transaction_date': None
                }
                accounts_list.append(account_summary)

                currency = account['currency']
                balance = float(account['balance']) if account['balance'] else 0
                if currency in totals:
                    totals[currency] += balance

        # Add broker accounts from broker holdings
        try:
            broker_docs = wealth_db.list_file_attachments(tenant_id, file_types=['broker_viac_pdf', 'broker_ing_diba_csv'])
            
            # Aggregate holdings across all documents first
            all_holdings_dict = {}  # Key: ISIN, Value: {shares, total_cost}
            
            if broker_docs:
                for doc in broker_docs:
                    tmp_path = None
                    try:
                        full_doc = wealth_db.get_file_attachment(tenant_id, doc['id'])
                        if not full_doc:
                            continue
                        
                        encryption_metadata = full_doc.get('encryption_metadata') or {}
                        if isinstance(encryption_metadata, str):
                            try:
                                encryption_metadata = json.loads(encryption_metadata)
                            except json.JSONDecodeError:
                                continue
                        
                        server_encryption = encryption_metadata.get('server_encryption', {})
                        server_algorithm = server_encryption.get('algorithm', 'AES-256-GCM')
                        
                        if server_algorithm == 'none':
                            decrypted = full_doc['encrypted_data']
                        else:
                            nonce_b64 = server_encryption.get('nonce', '')
                            if not nonce_b64:
                                continue
                            
                            try:
                                nonce = base64.b64decode(nonce_b64)
                            except Exception:
                                continue
                            
                            encrypted_data = EncryptedData(
                                ciphertext=full_doc['encrypted_data'],
                                nonce=nonce,
                                key_version=server_encryption.get('key_version', 1)
                            )
                            
                            verification_metadata = encryption_metadata.copy()
                            if 'server_encryption' in verification_metadata:
                                verification_metadata['server_encryption'] = verification_metadata['server_encryption'].copy()
                                verification_metadata['server_encryption'].pop('nonce', None)
                                verification_metadata['server_encryption'].pop('key_version', None)
                            
                            if 'file_info' in verification_metadata:
                                verification_metadata['file_info'] = verification_metadata['file_info'].copy()
                                verification_metadata['file_info'].pop('checksum', None)
                            
                            metadata_json = json.dumps(verification_metadata, sort_keys=True).encode()
                            try:
                                # Decrypt server layer - files are only encrypted server-side now
                                decrypted = encryption_service.decrypt_data(encrypted_data, tenant_id, metadata_json)
                            except ValueError:
                                continue
                        
                        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(doc['original_name'])[1]) as tmp:
                            tmp.write(decrypted)
                            tmp_path = tmp.name
                        
                        file_type = doc.get('file_type') or full_doc.get('file_type')
                        
                        if file_type == 'broker_viac_pdf':
                            file_transactions = parser.parse_viac(tmp_path)
                            # Aggregate VIAC holdings across all documents
                            for t in file_transactions:
                                key = f"VIAC_{t['isin']}"
                                if key not in all_holdings_dict:
                                    all_holdings_dict[key] = {
                                        'shares': 0,
                                        'total_cost': 0
                                    }
                                all_holdings_dict[key]['shares'] += t['shares'] if t['type'] == 'buy' else -t['shares']
                                all_holdings_dict[key]['total_cost'] += abs(t['amount']) if t['type'] == 'buy' else -abs(t['amount'])
                                    
                        elif file_type == 'broker_ing_diba_csv':
                            file_holdings = parser.parse_ing_diba(tmp_path)
                            # Aggregate ING DiBa holdings across all documents
                            for holding in file_holdings:
                                isin = holding.get('isin', '')
                                if isin:
                                    key = f"ING_DIBA_{isin}"
                                    if key not in all_holdings_dict:
                                        all_holdings_dict[key] = {
                                            'shares': holding.get('shares', 0),
                                            'total_cost': holding.get('total_cost', 0),
                                            'current_value': holding.get('current_value', holding.get('total_cost', 0))
                                        }
                                    else:
                                        # Aggregate shares and costs
                                        all_holdings_dict[key]['shares'] += holding.get('shares', 0)
                                        all_holdings_dict[key]['total_cost'] += holding.get('total_cost', 0)
                                        all_holdings_dict[key]['current_value'] += holding.get('current_value', holding.get('total_cost', 0))
                        
                        if tmp_path:
                            os.unlink(tmp_path)
                    except Exception as e:
                        print(f"Error processing broker document for accounts: {e}")
                        if tmp_path and os.path.exists(tmp_path):
                            try:
                                os.unlink(tmp_path)
                            except:
                                pass
                        continue
                
                # Calculate totals from aggregated holdings
                viac_total_invested = 0
                ing_diba_total_current = 0
                
                for key, holding in all_holdings_dict.items():
                    if key.startswith('VIAC_'):
                        if holding['shares'] > 0:
                            viac_total_invested += holding['total_cost']
                    elif key.startswith('ING_DIBA_'):
                        if holding['shares'] > 0:
                            ing_diba_total_current += holding.get('current_value', holding['total_cost'])
                
                # Add VIAC account if there are holdings
                if viac_total_invested > 0:
                    accounts_list.append({
                        'account': 'VIAC',
                        'balance': viac_total_invested,
                        'currency': 'CHF',
                        'transaction_count': 0,
                        'last_transaction_date': None
                    })
                    totals['CHF'] += viac_total_invested
                
                # Add ING DiBa account if there are holdings
                if ing_diba_total_current > 0:
                    accounts_list.append({
                        'account': 'ING DiBa',
                        'balance': ing_diba_total_current,
                        'currency': 'EUR',
                        'transaction_count': 0,
                        'last_transaction_date': None
                    })
                    totals['EUR'] += ing_diba_total_current
        except Exception as e:
            print(f"Error adding broker accounts: {e}")
            traceback.print_exc()
            # Continue even if broker accounts fail

        return jsonify({
            'accounts': accounts_list,
            'totals': {k: round(v, 2) for k, v in totals.items()}
        })
    except Exception as e:
        print(f"Error getting accounts: {e}")
        traceback.print_exc()
        # On error, return empty accounts (user will see onboarding)
        return jsonify({'accounts': [], 'totals': {}})

