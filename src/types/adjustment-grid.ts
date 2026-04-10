/** Shared types for the sales/land adjustment grid (UI + chat tools). */

export interface GridConfig {
  exclude_extremes: boolean;
  round_up: boolean;
  disable_rounding: boolean;
  round_final_value: boolean;
  round_to_5k: boolean;
  include_median: boolean;
  percent_inc_per_month: number;
  report_effective_date: string;
}

export interface AdjustmentCellState {
  qualitative: string;
  percentage: number;
  from_ai?: boolean;
}

export interface AdjustmentCategoryState {
  name: string;
  sort_order: number;
  comp_values: Record<string, AdjustmentCellState>;
  subject_value: string;
}

export interface CompColumnState {
  id: string;
  number: number;
  address: string;
  date_of_sale: string;
  base_price_per_unit: number;
  size: number;
}

export interface AdjustmentGridState {
  transaction_categories: AdjustmentCategoryState[];
  property_categories: AdjustmentCategoryState[];
  comps: CompColumnState[];
  subject_size: number;
  price_unit: string;
  config: GridConfig;
  source: "ai_suggested" | "manual" | "mixed";
  size_label?: string;
  price_label?: string;
}
