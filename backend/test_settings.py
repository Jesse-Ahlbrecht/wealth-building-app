import os
import sys
import json
from database import get_database
from user_management import UserManager

def test_settings_persistence():
    print("Testing settings persistence...")
    db = get_database()
    
    # Use a test user ID (assuming ID 1 exists, or we can create one)
    # For safety, let's try to find a user or create a dummy one if possible, 
    # but simpler to just pick an ID and assume it exists or catch error.
    # Better: use the database to find a user.
    
    user_id = None
    with db.get_cursor() as cursor:
        cursor.execute("SELECT id FROM users LIMIT 1")
        row = cursor.fetchone()
        if row:
            user_id = row[0]
        else:
            print("No users found. Cannot test.")
            return

    print(f"Using user_id: {user_id}")
    
    um = UserManager(db.connection_params) # Re-init with params or use existing connection?
    # UserManager takes a connection object.
    # get_database returns a DatabaseConnection object which has get_connection().
    
    # Let's use the helper get_user_manager if we can mock the connection context, 
    # or just instantiate UserManager manually with a raw connection.
    
    conn = None
    try:
        import pg8000
        conn = pg8000.connect(**db.connection_params)
        um = UserManager(conn)
        
        # 1. Get initial settings
        initial = um.get_user_settings(user_id)
        print(f"Initial settings: {initial}")
        
        # 2. Update settings
        new_prefs = {"test_toggle": True, "timestamp": "now"}
        print(f"Updating preferences to: {new_prefs}")
        
        success = um.update_user_settings(user_id, {"preferences": new_prefs})
        print(f"Update success: {success}")
        
        if not success:
            print("Update failed!")
            return
            
        # 3. Get settings again
        updated = um.get_user_settings(user_id)
        print(f"Updated settings: {updated}")
        
        # 4. Verify
        retrieved_prefs = updated.get('preferences', {})
        if retrieved_prefs.get('test_toggle') is True:
            print("SUCCESS: Preferences persisted correctly.")
        else:
            print("FAILURE: Preferences did not persist.")
            print(f"Expected: {new_prefs}")
            print(f"Got: {retrieved_prefs}")
            
    except Exception as e:
        print(f"Test error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    test_settings_persistence()
