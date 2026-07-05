import json
import os
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))

_CONFIG_CACHE: Dict[str, object] = {}


@dataclass
class CategorizationResult:
    category: str
    stage: str


def _backend_path(filename: str) -> str:
    return os.path.join(BACKEND_DIR, filename)


def _load_json(filename: str) -> dict:
    if filename not in _CONFIG_CACHE:
        filepath = _backend_path(filename)
        try:
            with open(filepath, encoding='utf-8') as handle:
                _CONFIG_CACHE[filename] = json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError):
            _CONFIG_CACHE[filename] = {}
    return _CONFIG_CACHE[filename]


def clear_config_cache():
    _CONFIG_CACHE.clear()


def normalize_merchant_text(value: str, for_recipient: bool = False) -> str:
    text = (value or '').strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in '"\'':
        text = text[1:-1].strip()

    text = text.lower()
    text = re.sub(r'[\s"\']+', ' ', text).strip()

    if not for_recipient:
        return text

    compact = text.replace('.', '').replace(' ', '')
    merchant_mappings = {
        'amzn': 'amazon',
        'amznmktpde': 'amazon',
        'amznmktplace': 'amazon',
        'paypal': 'paypal',
        'pp': 'paypal',
    }
    for pattern, normalized in merchant_mappings.items():
        if pattern in compact:
            return normalized

    text = re.sub(r'[^\w\s]', '', text).strip()
    text = re.sub(r'\s+', ' ', text)

    words = text.split()
    if not words:
        return text

    if words[0] in ('amazon', 'amzn'):
        return 'amazon'

    if len(text) > 30 and len(words[0]) > 3:
        return words[0]

    return text


def _parse_category_rules(raw: dict) -> List[dict]:
    rules = []
    for category, config in raw.items():
        if isinstance(config, list):
            rules.append({
                'category': category,
                'priority': 0,
                'keywords': [k.lower() for k in config],
                'patterns': [],
                'exclude': [],
            })
            continue
        if not isinstance(config, dict):
            continue
        rules.append({
            'category': category,
            'priority': config.get('priority', 0),
            'keywords': [k.lower() for k in config.get('keywords', [])],
            'patterns': [re.compile(p, re.IGNORECASE) for p in config.get('patterns', [])],
            'exclude': [k.lower() for k in config.get('exclude', [])],
        })
    rules.sort(key=lambda item: item['priority'], reverse=True)
    return rules


def _build_merchant_index(registry: dict) -> List[Tuple[str, str]]:
    entries: List[Tuple[str, str]] = []
    for canonical, config in registry.items():
        if not isinstance(config, dict):
            continue
        category = config.get('category')
        if not category:
            continue
        aliases = [canonical.lower()] + [a.lower() for a in config.get('aliases', [])]
        for alias in aliases:
            if alias:
                entries.append((alias, category))
    entries.sort(key=lambda item: len(item[0]), reverse=True)
    return entries


def _match_merchant_registry(
    normalized: str,
    recipient_normalized: str,
    merchant_index: List[Tuple[str, str]],
) -> Optional[str]:
    for alias, category in merchant_index:
        if alias in normalized or alias in recipient_normalized:
            return category
    return None


def _match_keyword_rules(text: str, rules: List[dict]) -> Optional[str]:
    for rule in rules:
        if any(exclude in text for exclude in rule['exclude']):
            continue
        if any(keyword in text for keyword in rule['keywords']):
            return rule['category']
        for pattern in rule['patterns']:
            if pattern.search(text):
                return rule['category']
    return None


def _build_bank_lookup(bank_map: dict) -> Dict[str, List[Tuple[str, str]]]:
    lookup: Dict[str, List[Tuple[str, str]]] = {}
    for source, source_map in bank_map.items():
        if not isinstance(source_map, dict):
            continue
        lookup[source] = [(key.lower(), category) for key, category in source_map.items()]
    return lookup


def _match_bank_category(
    bank_category: str,
    bank_subcategory: str,
    bank_source: str,
    bank_lookup: Dict[str, List[Tuple[str, str]]],
) -> Optional[str]:
    entries = bank_lookup.get(bank_source) or bank_lookup.get('default') or []
    for candidate in (bank_category, bank_subcategory):
        if not candidate:
            continue
        normalized = candidate.strip().lower()
        for key, category in entries:
            if key == normalized or key in normalized:
                return category
    return None


def _normalize_account_label(name: str) -> str:
    label = normalize_merchant_text(name or '')
    return re.sub(r'\s+\d{4}$', '', label).strip()


def _owned_account_match_terms(account_name: str, institution: str = '') -> List[str]:
    terms = []
    for raw in (account_name, institution):
        label = _normalize_account_label(raw)
        if not label:
            continue
        if len(label) >= 5:
            terms.append(label)
        words = label.split()
        if words:
            if len(words[0]) >= 5:
                terms.append(words[0])
            if len(words) >= 2:
                pair = ' '.join(words[:2])
                if len(pair) >= 5:
                    terms.append(pair)
    return sorted(set(terms), key=len, reverse=True)


_SHORT_ACCOUNT_CODES = frozenset({'dkb', 'yuh', 'viac', 'ibkr'})


def _check_owned_account_transfer(
    text: str,
    source_account: str,
    owned_accounts: Optional[List[dict]],
) -> bool:
    if not owned_accounts or not source_account:
        return False

    source_label = _normalize_account_label(source_account)
    if not source_label:
        return False

    for acc in owned_accounts:
        account_name = acc.get('account_name') or acc.get('name') or ''
        target_label = _normalize_account_label(account_name)
        if not target_label or target_label == source_label:
            continue
        if source_label in target_label or target_label in source_label:
            continue

        for term in _owned_account_match_terms(account_name, acc.get('institution') or ''):
            if term in text:
                return True
            head = term.split()[0]
            if head in _SHORT_ACCOUNT_CODES and head in text:
                return True

    return False


def _check_internal_transfer(
    recipient: str,
    description: str,
    date: str,
    account: str,
    text: str,
    config: dict,
    owned_accounts: Optional[List[dict]] = None,
) -> Optional[str]:
    if _check_owned_account_transfer(text, account, owned_accounts):
        return 'owned_account'

    if config and date and account:
        for setup in config.get('initial_setup', []):
            if (setup.get('date') == date
                    and setup.get('account') == account
                    and setup.get('description', '').lower() in description.lower()):
                return 'initial_setup'

    if not config:
        return None

    transfer_keywords = config.get('keywords', [])
    if any(keyword.lower() in text for keyword in transfer_keywords):
        return 'keyword'

    recipient_lower = recipient.lower()
    description_lower = description.lower()
    for pattern in config.get('self_transfer_patterns', []):
        pattern_lower = pattern.lower()
        recipient_match = pattern_lower in recipient_lower
        pattern_words = set(pattern_lower.split())
        description_words = set(description_lower.split())
        description_match = pattern_words.issubset(description_words) if description else False
        if (recipient_match and description_match) or (recipient_match and (not description or len(description.strip()) < 10)):
            return 'self_transfer'

    return None


class TransactionCategorizer:
    def __init__(self):
        self._spending_rules = _parse_category_rules(_load_json('categories_spending.json'))
        self._income_rules = _parse_category_rules(_load_json('categories_income.json'))
        self._internal_transfer_config = _load_json('categories_internal_transfer.json')
        self._bank_lookup = _build_bank_lookup(_load_json('bank_category_map.json'))
        self._merchant_index = _build_merchant_index(_load_json('merchants.de_ch.json'))

    def categorize_with_details(
        self,
        recipient: str = '',
        description: str = '',
        date: str = None,
        account: str = None,
        transaction_type: str = '',
        bank_category: str = '',
        bank_subcategory: str = '',
        bank_source: str = '',
        owned_accounts: Optional[List[dict]] = None,
    ) -> CategorizationResult:
        recipient = (recipient or '').strip()
        description = (description or '').strip()
        if date:
            date = date.split('T')[0] if 'T' in date else date
        else:
            date = ''
        account = account or ''
        norm_recipient = normalize_merchant_text(recipient)
        norm_description = normalize_merchant_text(description)
        text = f"{norm_recipient} {norm_description}".strip()
        recipient_normalized = normalize_merchant_text(f"{recipient} {description}", for_recipient=True)
        txn_type = (transaction_type or '').lower()

        if _check_internal_transfer(
            recipient, description, date, account, text,
            self._internal_transfer_config, owned_accounts,
        ):
            return CategorizationResult('Internal Transfer', 'internal_transfer')

        bank_match = _match_bank_category(bank_category, bank_subcategory, bank_source, self._bank_lookup)
        if bank_match:
            return CategorizationResult(bank_match, 'bank_category_map')

        registry_match = _match_merchant_registry(text, recipient_normalized, self._merchant_index)
        if registry_match:
            return CategorizationResult(registry_match, 'merchant_registry')

        rule_sets = (
            [self._spending_rules] if txn_type == 'expense'
            else [self._income_rules] if txn_type == 'income'
            else [self._spending_rules, self._income_rules]
        )
        for rules in rule_sets:
            keyword_match = _match_keyword_rules(text, rules)
            if keyword_match:
                return CategorizationResult(keyword_match, 'keyword_rules')

        return CategorizationResult('Other', 'other')

    def categorize_transaction(
        self,
        recipient: str = '',
        description: str = '',
        date: str = None,
        account: str = None,
        transaction_type: str = '',
        bank_category: str = '',
        bank_subcategory: str = '',
        bank_source: str = '',
        owned_accounts: Optional[List[dict]] = None,
    ) -> str:
        return self.categorize_with_details(
            recipient=recipient,
            description=description,
            date=date,
            account=account,
            transaction_type=transaction_type,
            bank_category=bank_category,
            bank_subcategory=bank_subcategory,
            bank_source=bank_source,
            owned_accounts=owned_accounts,
        ).category

    def categorize_from_transaction(
        self,
        transaction: dict,
        owned_accounts: Optional[List[dict]] = None,
    ) -> CategorizationResult:
        accounts = owned_accounts if owned_accounts is not None else transaction.get('owned_accounts')
        return self.categorize_with_details(
            recipient=transaction.get('recipient', ''),
            description=transaction.get('description', ''),
            date=transaction.get('date'),
            account=transaction.get('account'),
            transaction_type=transaction.get('type', ''),
            bank_category=transaction.get('bankCategory', ''),
            bank_subcategory=transaction.get('bankSubcategory', ''),
            bank_source=transaction.get('bankSource', ''),
            owned_accounts=accounts,
        )


_default_categorizer: Optional[TransactionCategorizer] = None


def get_categorizer() -> TransactionCategorizer:
    global _default_categorizer
    if _default_categorizer is None:
        _default_categorizer = TransactionCategorizer()
    return _default_categorizer
