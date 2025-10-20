#!/bin/bash
source venv/bin/activate
export FLASK_ENV=development
export FLASK_DEBUG=1
python app.py
