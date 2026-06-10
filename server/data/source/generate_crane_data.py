import csv
import random
from datetime import datetime
from collections import defaultdict

# Predefined constants
CRANES = ["STS01", "STS02", "STS03", "STS04", "STS05", "STS06"]
LINE_OPS = ["MKL", "MSC", "ONE", "CMA", "HPL"]
CRANE_HEADERS = [
    "Time Completed", "Event Type", "Move Kind", "Unit Category", "Unit Nbr",
    "Crane CHE", "From Position", "To Position", "Carrier Visit", "Line Op", "Exclude",
]

def fmt_crane(dt: datetime) -> str:
    return dt.strftime("%y-%b-%d %H%M")

def parse_time(value: str) -> datetime:
    # Handle both slash and dash delimited dates by replacing dashes with slashes
    value = value.replace("-", "/")
    try:
        return datetime.strptime(value, "%m/%d/%Y %H:%M")
    except ValueError:
        # Fallback if time has seconds or is formatted differently
        try:
            return datetime.strptime(value, "%m/%d/%Y %H:%M:%S")
        except ValueError:
            # Re-raise or return None if it completely fails
            raise

def main():
    container_file = "container_data.csv"
    crane_output_file = "crane_data.csv"

    print("Reading container data...")
    containers = []
    with open(container_file, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            containers.append(row)
            
    print(f"Loaded {len(containers)} rows.")
            
    # Group by Visit ID
    visits = set()
    for c in containers:
        category = c["Category Id"]
        if category == "EXPRT":
            visit_id = c["Actual Outbound Carrier visit ID"]
        else: 
            visit_id = c["Actual Inbound Carrier visit ID"]
        
        if not visit_id or visit_id == "NULL":
            visit_id = c["Actual Outbound Carrier visit ID"] if c["Actual Outbound Carrier visit ID"] != "NULL" else c["Actual Inbound Carrier visit ID"]
        
        visits.add(visit_id)
        
    print(f"Found {len(visits)} unique visits.")
        
    # Assign 3 to 5 cranes to each visit
    visit_cranes = {}
    for visit in visits:
        crane_count = random.randint(3, 5)
        visit_cranes[visit] = random.sample(CRANES, min(crane_count, len(CRANES)))
        
    crane_rows = []
    
    print("Generating crane events...")
    for c in containers:
        category = c["Category Id"]
        
        if category == "EXPRT":
            visit_id = c["Actual Outbound Carrier visit ID"]
            if not visit_id or visit_id == "NULL":
                visit_id = c["Actual Inbound Carrier visit ID"]
            move_kind = "Load"
            unit_category = "Export"
            event_type = "UNIT_LOAD"
        elif category == "IMPRT":
            visit_id = c["Actual Inbound Carrier visit ID"]
            if not visit_id or visit_id == "NULL":
                visit_id = c["Actual Outbound Carrier visit ID"]
            move_kind = "Discharge"
            unit_category = "Import"
            event_type = "UNIT_DISCHARGE"
        else: # THRGH or other
            visit_id = c["Actual Inbound Carrier visit ID"]
            move_kind = "Restow"
            unit_category = "Transship"
            event_type = "UNIT_RESTOW"
            
        move_time_str = c["Move Complete Time"]
        if move_time_str and move_time_str != "NULL":
            try:
                move_time = parse_time(move_time_str)
                time_completed = fmt_crane(move_time)
            except Exception as e:
                # If all parsing fails, just use the original string
                time_completed = move_time_str
        else:
            time_completed = ""

        unit_id = c["Unit ID"]
        from_pos = c["Ctr From Position"]
        to_pos = c["Ctr To Position"]
        
        assigned_cranes = visit_cranes.get(visit_id, CRANES)
        crane_che = random.choice(assigned_cranes)
        line_op = random.choice(LINE_OPS)
        exclude = "Yes" if random.random() < 0.05 else "No"
        
        crane_rows.append({
            "Time Completed": time_completed,
            "Event Type": event_type,
            "Move Kind": move_kind,
            "Unit Category": unit_category,
            "Unit Nbr": unit_id,
            "Crane CHE": crane_che,
            "From Position": from_pos,
            "To Position": to_pos,
            "Carrier Visit": visit_id,
            "Line Op": line_op,
            "Exclude": exclude
        })
        
    print(f"Writing {len(crane_rows)} rows to {crane_output_file}...")
    with open(crane_output_file, mode='w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CRANE_HEADERS)
        writer.writeheader()
        writer.writerows(crane_rows)
        
    print("Done!")

if __name__ == "__main__":
    main()
