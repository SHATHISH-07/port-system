# server/models/operational_prompt.py

OPERATIONAL_RULES = """
1. Safety First: Ensure crane separation of at least 1 bay for safety.
2. Efficiency: Prioritize high-density blocks to minimize crane travel.
3. Balance: Distribute workload evenly across available cranes.
4. Congestion: Avoid assigning multiple cranes to the same narrow block simultaneously.
"""

BERTH_STRATEGY_PROMPT = """
Analyze the cargo distribution and yard concentration to recommend the optimal berth.
- If high volume in Blocks A-D, prioritize Berth 1.
- If high volume in Blocks E-H, prioritize Berth 2.
- Consider truck travel distance and yard congestion.
"""

CURRENT_ANALYSIS_STRATEGY = {
    "BLOCK_SEQUENTIAL": "Process moves block by block to minimize travel.",
    "HIGH_DENSITY_FIRST": "Prioritize the most concentrated blocks to clear volume quickly.",
    "BALANCED_DUAL_CRANE": "Assign two cranes to separate high-volume areas for parallel processing.",
    "LOW_CONFLICT": "Space out crane assignments to minimize proximity delays."
}

CRANE_ASSIGNMENT_GUIDANCE = """
Recommended number of cranes based on volume:
- < 150 moves: 1 crane
- 150-300 moves: 2 cranes
- 300-450 moves: 3-4 cranes
- > 450 moves: 4-5 cranes
"""

CONFLICT_ANALYSIS_GUIDANCE = """
Assess risk based on:
- Multiple cranes in the same block.
- Simultaneous moves in adjacent bays.
- Shared travel corridors.
"""

BERTH_RECOMMENDATION_LOGIC = """
1. Proximity: Prioritize berths closest to the yard blocks with highest container density.
2. Equipment: Ensure berth has sufficient crane outreach and rail coverage for the vessel size.
3. Traffic: Avoid berths that would cause ITV bottlenecks in shared corridors.
"""

SAFETY_GUIDANCE = """
1. Maintain minimum 1-bay separation between all quay cranes.
2. Verify all lashing gear is clear before starting discharge operations.
3. Observe speed limits for ITVs in congested yard corridors.
"""
