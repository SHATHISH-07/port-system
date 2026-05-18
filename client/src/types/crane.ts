import type { CranePerformanceResponse } from "./vessel";

export interface ExtendedCraneResponse extends CranePerformanceResponse {
    available_cranes?: string[];
    selected_crane?: string | null;
    yard_stats?: Array<{
        terminal_name: string;
        total_system_moves: number;
        active_cranes_count: number;
        unique_vessel_visits: number;
        gross_terminal_mph: number;
        avg_crane_productivity: number;
    }>;
    move_kind_distribution?: Record<string, number>;
}