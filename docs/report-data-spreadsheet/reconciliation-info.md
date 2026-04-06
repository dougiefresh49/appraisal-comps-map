# Reconciliation Information

## reconciliation-chart sheet tab

### Display Chart on Left

```json
{
  "reconciliation-chart-A2:E18": [
    {
      "row_number": 2,
      "Cost Approach": "Indicated Value",
      "col_2": "",
      "col_3": "",
      "col_4": "",
      "col_5": "=IF(FILTER(ReconciliationInputs[value],ReconciliationInputs[variableName]=\"CostAppValueWeight\")=0,0,VALUE(INDEX(CostScheduleRange, ROWS(CostScheduleRange), COLUMNS(CostScheduleRange))))\n"
    },
    {
      "row_number": 3
    },
    {
      "row_number": 4,
      "Cost Approach": "Sales Approach"
    },
    {
      "row_number": 5,
      "Cost Approach": "Improvements",
      "col_2": "",
      "col_3": "",
      "col_4": "",
      "col_5": "=VALUE(INDEX(CompSalesAdjustmentsRange, ROWS(CompSalesAdjustmentsRange), COLUMNS(CompSalesAdjustmentsRange)))"
    },
    {
      "row_number": 6,
      "Cost Approach": "Land",
      "col_2": "",
      "col_3": "",
      "col_4": "",
      "col_5": "=VALUE(INDEX(CompLandAdjustmentsRange, ROWS(CompLandAdjustmentsRange), COLUMNS(CompLandAdjustmentsRange)))"
    },
    {
      "row_number": 7,
      "Cost Approach": "Indicated Value",
      "col_2": "",
      "col_3": "",
      "col_4": "",
      "col_5": "=SUM(E6:E7)"
    },
    {
      "row_number": 8
    },
    {
      "row_number": 9,
      "Cost Approach": "Income Approach"
    },
    {
      "row_number": 10,
      "Cost Approach": "Indicated Value",
      "col_2": "",
      "col_3": "",
      "col_4": "",
      "col_5": "=IF(FILTER(ReconciliationInputs[include],ReconciliationInputs[variableName]=\"IncomeAppValueWeight\")=false,0,VALUE(INDEX(IncomeScheduleMarketRange, ROWS(IncomeScheduleMarketRange), COLUMNS(IncomeScheduleMarketRange))))\n"
    },
    {
      "row_number": 11
    },
    {
      "row_number": 12,
      "Cost Approach": "Weights"
    },
    {
      "row_number": 13,
      "Cost Approach": "",
      "col_2": "",
      "col_3": "",
      "col_4": "Cost",
      "col_5": "=FILTER(ReconciliationInputs[value], ReconciliationInputs[variableName] = \"CostAppValueWeight\")"
    },
    {
      "row_number": 14,
      "Cost Approach": "",
      "col_2": "",
      "col_3": "",
      "col_4": "Sales",
      "col_5": "=FILTER(ReconciliationInputs[value], ReconciliationInputs[variableName] = \"SalesAppValueWeight\")"
    },
    {
      "row_number": 15,
      "Cost Approach": "",
      "col_2": "",
      "col_3": "",
      "col_4": "Income",
      "col_5": "=FILTER(ReconciliationInputs[value], ReconciliationInputs[variableName] = \"IncomeAppValueWeight\")"
    },
    {
      "row_number": 16,
      "Cost Approach": "Value Indication",
      "col_2": "Applying reductions and weights accordingly",
      "col_3": "",
      "col_4": "",
      "col_5": "=AVERAGE.WEIGHTED({IFERROR(VALUE(E3),0), IFERROR(VALUE(E8),0), IFERROR(VALUE(E11),0)}, {IFERROR(VALUE(E14),0), IFERROR(VALUE(E15),0), IFERROR(VALUE(E16),0)})"
    },
    {
      "row_number": 17,
      "Cost Approach": "Concluded Value",
      "col_2": "",
      "col_3": "",
      "col_4": "",
      "col_5": "=GET_ADJ_ROUNDED_VALUE_INDICATION(J33)"
    }
  ]
}
```

## reconciliation sheet tab

```json
[
  {
    "data": {
      "reconciliation-A1:B3": [
        {
          "row_number": 2,
          "Valuation Approach": "Cost",
          "Indicated Value": "=FILTER(ReportInputs[value], ReportInputs[variableName] = \"CostAppValueRounded\")"
        },
        {
          "row_number": 3,
          "Valuation Approach": "Sales Comparison",
          "Indicated Value": "=TEXT(VALUE('reconciliation-chart'!E8), \"$#,##0\")"
        }
      ],
      "reconciliation-E7:H9": [
        {
          "row_number": 2,
          "=FILTER(ReportInputs[value], ReportInputs[variableName] = \"ReportFinalValueWords\")": "=\"(\" & TEXT(ROUND(FILTER(ReportInputs[value], ReportInputs[variableName] = \"ReportFinalValue\"), -3), \"$#,##0\") & \" R)\""
        }
      ]
    }
  }
]
```
