from db.connection import get_engine
from sqlalchemy import text
from db.queries import init_simplified_schema, init_auth_schema, init_training_metadata_schema
from config import settings
from auth.utils import get_password_hash

def main():
    engine = get_engine()
    print("Dropping public schema...")
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE;"))
        conn.execute(text("CREATE SCHEMA public;"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO postgres;"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO public;"))
        
    print("Initializing schemas...")
    init_simplified_schema(engine)
    init_auth_schema(engine)
    init_training_metadata_schema(engine)
    
    print("Seeding admin user...")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO users (username, password_hash, role) VALUES (:u, :p, :r) ON CONFLICT DO NOTHING"), {
            "u": settings.DEFAULT_ADMIN_USER,
            "p": get_password_hash(settings.DEFAULT_ADMIN_PASSWORD),
            "r": "admin"
        })
    print("Database cleaned and initialized successfully.")

if __name__ == "__main__":
    main()
