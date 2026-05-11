from models.stay_model import train_stay_model
from db.queries import load_from_db
from datetime import datetime

def main():
    print(f"[{datetime.now().isoformat()}] Starting manual model training trigger...")
    
    # 1. Load historical data
    print("Loading historical data from partitioned tables...")
    try:
        df = load_from_db("history", full_load=True)
        if df.empty:
            print("Error: No historical data found across partitioned yard tables.")
            return
            
        print(f"Loaded {len(df)} records. Starting ML training...")
        
        # 2. Train model
        metrics = train_stay_model(df)
        
        print("Model training completed successfully.")
        
    except Exception as e:
        print(f"Training failed: {e}")

if __name__ == "__main__":
    main()
