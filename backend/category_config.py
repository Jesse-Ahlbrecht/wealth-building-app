import json
import os

BACKEND_DIR = os.path.dirname(__file__)
_savings_config = None


def _load_savings_config():
    global _savings_config
    if _savings_config is None:
        filepath = os.path.join(BACKEND_DIR, 'categories_savings.json')
        with open(filepath, encoding='utf-8') as handle:
            _savings_config = json.load(handle)
    return _savings_config


def get_savings_category_names():
    return list(_load_savings_config().get('names', []))


def get_bank_savings_movement_categories():
    return set(_load_savings_config().get('bank_savings_movements', []))


def get_broker_savings_category_names():
    broker = _load_savings_config().get('broker', {})
    return broker.get('investments'), broker.get('cash')
