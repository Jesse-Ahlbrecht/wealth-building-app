# Transaction Categories Configuration

This folder contains configuration files that define how transactions are automatically categorized.

## Configuration Files

### `categories_spending.json`
Defines spending categories and their keyword triggers.

### `categories_income.json`
Defines income categories and their keyword triggers.

## How to Customize Categories

### Adding Keywords to an Existing Category

Edit the JSON file and add your keyword to the appropriate category array:

```json
{
  "Groceries": [
    "rewe",
    "aldi",
    "lidl",
    "your-new-store"
  ]
}
```

### Creating a New Category

Add a new entry to the JSON file:

```json
{
  "Groceries": ["rewe", "aldi"],
  "Your New Category": [
    "keyword1",
    "keyword2"
  ]
}
```

### Important Notes

1. **Keywords are case-insensitive** - "REWE", "rewe", and "Rewe" will all match
2. **Partial matching** - Keyword "amazon" will match "Amazon.de", "AMZN", etc.
3. **Order matters** - Categories are checked in the order they appear in the file
4. **Hot reload** - Changes to category files are loaded automatically when the backend restarts

## Examples

### Example: Add a new online store to Shopping

**Before:**
```json
{
  "Shopping": [
    "amazon",
    "amzn",
    "digitec"
  ]
}
```

**After:**
```json
{
  "Shopping": [
    "amazon",
    "amzn",
    "digitec",
    "ebay",
    "zalando"
  ]
}
```

### Example: Create a new "Fitness" category

**Before:**
```json
{
  "Shopping": ["amazon", "amzn"]
}
```

**After:**
```json
{
  "Shopping": ["amazon", "amzn"],
  "Fitness": [
    "gym",
    "fitnessstudio",
    "yoga",
    "mcfit"
  ]
}
```

### Example: Separate employer salary from other income

In `categories_income.json`:

```json
{
  "Salary": [
    "datalynx",
    "your-employer-name"
  ],
  "Income": [
    "gehalt",
    "lohn"
  ],
  "Freelance": [
    "upwork",
    "fiverr",
    "freelance"
  ]
}
```

## Special Categories

### Internal Transfer
Internal transfers between your own accounts are excluded from income and expense calculations to prevent inflating your saving rate. These include:
- Transfers via Wise Payments or Exchange Market (YUH → DKB)
- Self-transfers between DKB Girokonto and Tagesgeld

Configuration: `categories_internal_transfer.json`

**Important:** Internal transfers are NOT counted in your monthly income, expenses, or saving rate!

### Transfer
Regular transfers are handled separately and automatically exclude income keywords to prevent misclassification.

### Other
Any transaction that doesn't match a defined category will be labeled as "Other".

## Troubleshooting

**Problem:** My category isn't showing up
- Check JSON syntax (use a JSON validator)
- Ensure keywords are lowercase
- Restart the backend server

**Problem:** Wrong category is assigned
- Check keyword order - first match wins
- Make keywords more specific
- Add exclusion logic if needed

## File Location

- Backend folder: `/backend/categories_spending.json` and `/backend/categories_income.json`
- Edit with any text editor
- Valid JSON format required
