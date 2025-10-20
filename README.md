# Wealth Tracker

A clean, minimalistic web app for tracking your monthly saving rate and spending by category. Supports both German (DKB) and Swiss (YUH) bank statements.

## Features

- Monthly saving rate calculation
- Spending breakdown by category
- Multi-currency support (EUR & CHF)
- Clean, minimalistic UI
- Automatic transaction categorization

## Project Structure

```
wealth_app/
├── backend/
│   ├── app.py              # Flask API
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.js         # Main React component
│   │   ├── App.css        # Styles
│   │   ├── index.js
│   │   └── index.css
│   ├── public/
│   │   └── index.html
│   └── package.json
└── bank statements/
    ├── dkb/
    │   └── dkb.csv        # German bank statements (EUR)
    └── yuh/
        └── yuh.CSV        # Swiss bank statements (CHF)
```

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python3 -m venv venv
```

3. Activate the virtual environment and install dependencies:
```bash
source venv/bin/activate
pip install -r requirements.txt
```

4. Run the Flask server:
```bash
# Option 1: Run directly
source venv/bin/activate
python app.py

# Option 2: Use the helper script
./run.sh
```

The backend will run on `http://localhost:5001`

**Note:** Port 5001 is used instead of 5000 because macOS uses port 5000 for AirPlay.

**Hot Reload:** The backend has auto-reload enabled. Changes to `app.py` or category JSON files will be picked up automatically - just refresh your browser!

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Start the React development server:
```bash
npm start
```

The frontend will run on `http://localhost:3000`

## Usage

1. Make sure your bank statements are in the correct folders:
   - DKB statements: `bank statements/dkb/dkb.csv`
   - YUH statements: `bank statements/yuh/yuh.CSV`

2. Start both the backend and frontend servers

3. Open your browser to `http://localhost:3000`

4. View your monthly saving rate and spending breakdown

## Transaction Categories

Transactions are automatically categorized into:
- Groceries
- Dining
- Shopping
- Transport
- Subscriptions
- Loan Payment
- Transfer
- Income
- Other

You can customize categories by editing the `_categorize_transaction` method in `backend/app.py`.

## Data Format

### DKB (German) CSV Format
- Semicolon-separated
- German date format (DD.MM.YY)
- German number format (1.000,00)
- Currency: EUR

### YUH (Swiss) CSV Format
- Semicolon-separated
- Date format (DD/MM/YYYY)
- Standard number format
- Currency: CHF

## Customization

### Customize Transaction Categories

Categories are defined in easy-to-edit JSON files:

- **Spending Categories:** [backend/categories_spending.json](backend/categories_spending.json)
- **Income Categories:** [backend/categories_income.json](backend/categories_income.json)

**To add a keyword to an existing category:**
```json
{
  "Groceries": [
    "rewe",
    "aldi",
    "your-new-store"
  ]
}
```

**To create a new category:**
```json
{
  "Fitness": [
    "gym",
    "yoga",
    "mcfit"
  ]
}
```

**Changes apply immediately** - just refresh your browser! See [backend/CATEGORIES_README.md](backend/CATEGORIES_README.md) for detailed documentation.

### Change UI Colors
Edit `frontend/src/App.css` to customize the color scheme and styling.

### Add More Bank Statements
The app automatically finds and parses all `.csv` files in the `bank statements/dkb/` and `bank statements/yuh/` folders. Just drop new CSV files into these folders!
