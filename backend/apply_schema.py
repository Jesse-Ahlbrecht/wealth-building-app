import os
import sys
from database import get_database

def apply_schema():
    print("Applying schema...")
    db = get_database()
    
    try:
        with open('apply_settings_schema.sql', 'r') as f:
            sql = f.read()
            
        with db.get_cursor() as cursor:
            # Split by semicolon to execute statements individually if needed, 
            # but pg8000 might handle multiple statements or might not.
            # Safest is to execute the whole block if it's DDL, or split.
            # The file has multiple statements.
            statements = sql.split(';')
            for statement in statements:
                if statement.strip():
                    print(f"Executing: {statement[:50]}...")
                    cursor.execute(statement)
        
        print("Schema applied successfully.")
    except Exception as e:
        print(f"Error applying schema: {e}")
        sys.exit(1)

if __name__ == "__main__":
    apply_schema()
