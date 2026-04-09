# Adjustment Grid Info

## land-adjustments sheet page

### Formulas

```json
[
  {
    "data": {
      "land-adjustments-A1:H44": [
        {
          "row_number": 2
        },
        {
          "row_number": 3,
          " ": "",
          "col_2": "Subject",
          "col_3": "1",
          "col_4": "=C3+1",
          "col_5": "=D3+1",
          "col_6": 4,
          "col_7": 5,
          "col_8": 6
        },
        {
          "row_number": 4,
          " ": "Address",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = K16)) ",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) "
        },
        {
          "row_number": 5,
          " ": "Date of Sale",
          "col_2": "Current",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) "
        },
        {
          "row_number": 6,
          " ": "Land Size (SF)",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = K16)) ",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) "
        },
        {
          "row_number": 7,
          " ": "Sale Price / SF",
          "col_2": "",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) "
        },
        {
          "row_number": 8
        },
        {
          "row_number": 9,
          " ": "TRANSACTION ADJUSTMENTS"
        },
        {
          "row_number": 10,
          " ": "Property Rights",
          "col_2": "=FILTER(Subject[Property Rights], Subject[Type] = K16)",
          "col_3": "Similar",
          "col_4": "Similar",
          "col_5": "Similar",
          "col_6": "Similar",
          "col_7": "Similar",
          "col_8": "Similar"
        },
        {
          "row_number": 11,
          " ": "",
          "col_2": "",
          "col_3": 0,
          "col_4": 0,
          "col_5": 0,
          "col_6": 0,
          "col_7": 0,
          "col_8": 0
        },
        {
          "row_number": 12,
          " ": "",
          "col_2": "",
          "col_3": "=C7 + C7 * C11",
          "col_4": "=D7 + D7 * D11",
          "col_5": "=E7 + E7 * E11",
          "col_6": "=F7 + F7 * F11",
          "col_7": "=G7 + G7 * G11",
          "col_8": "=H7 + H7 * H11"
        },
        {
          "row_number": 13,
          " ": "Financing Terms",
          "col_2": "",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) "
        },
        {
          "row_number": 14,
          " ": "",
          "col_2": "",
          "col_3": 0,
          "col_4": 0,
          "col_5": 0,
          "col_6": 0,
          "col_7": 0,
          "col_8": 0
        },
        {
          "row_number": 15,
          " ": "",
          "col_2": "",
          "col_3": "=C12 + C12 * C14",
          "col_4": "=D12 + D12 * D14",
          "col_5": "=E12 + E12 * E14",
          "col_6": "=F12 + F12 * F14",
          "col_7": "=G12 + G12 * G14",
          "col_8": "=H12 + H12 * H14"
        },
        {
          "row_number": 16,
          " ": "Conditions of Sale",
          "col_2": "",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) "
        },
        {
          "row_number": 17,
          " ": "",
          "col_2": "",
          "col_3": 0,
          "col_4": 0,
          "col_5": 0,
          "col_6": 0,
          "col_7": 0,
          "col_8": 0
        },
        {
          "row_number": 18,
          " ": "",
          "col_2": "",
          "col_3": "=C15 + C15 * C17",
          "col_4": "=D15 + D15 * D17",
          "col_5": "=E15 + E15 * E17",
          "col_6": "=F15 + F15 * F17",
          "col_7": "=G15 + G15 * G17",
          "col_8": "=H15 + H15 * H17"
        },
        {
          "row_number": 19,
          " ": "Market Conditions",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = K16)) ",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) "
        },
        {
          "row_number": 20,
          " ": "",
          "col_2": "",
          "col_3": "=CALC_MONTHLY_INCREASE(C19, ReportInputs)",
          "col_4": "=CALC_MONTHLY_INCREASE(D19, ReportInputs)",
          "col_5": "=CALC_MONTHLY_INCREASE(E19, ReportInputs)",
          "col_6": "=CALC_MONTHLY_INCREASE(F19, ReportInputs)",
          "col_7": "=CALC_MONTHLY_INCREASE(G19, ReportInputs)",
          "col_8": "=CALC_MONTHLY_INCREASE(H19, ReportInputs)"
        },
        {
          "row_number": 21,
          " ": "",
          "col_2": "",
          "col_3": "=C18 + C18 * C20",
          "col_4": "=D18 + D18 * D20",
          "col_5": "=E18 + E18 * E20",
          "col_6": "=F18 + F18 * F20",
          "col_7": "=G18 + G18 * G20",
          "col_8": "=H18 + H18 * H20"
        },
        {
          "row_number": 22
        },
        {
          "row_number": 23,
          " ": "PROPERTY ADJUSTMENTS"
        },
        {
          "row_number": 24,
          " ": "Location",
          "col_2": "Good",
          "col_3": "Inferior",
          "col_4": "Similar",
          "col_5": "Superior",
          "col_6": "Similar",
          "col_7": "Inferior",
          "col_8": "TODO"
        },
        {
          "row_number": 25,
          " ": "",
          "col_2": "",
          "col_3": 0.15,
          "col_4": 0,
          "col_5": -0.25,
          "col_6": 0,
          "col_7": 0.25,
          "col_8": 0
        },
        {
          "row_number": 26,
          " ": "Land Size (SF)",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = K16)) ",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsLand[#HEADERS], CompsLand) "
        },
        {
          "row_number": 27,
          " ": "",
          "col_2": "",
          "col_3": -0.05,
          "col_4": -0.04,
          "col_5": 0.15,
          "col_6": 0.08,
          "col_7": 0.65,
          "col_8": 0
        },
        {
          "row_number": 28,
          " ": "Surface",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = K16)) ",
          "col_3": "Similar",
          "col_4": "Inferior",
          "col_5": "Inferior",
          "col_6": "Superior",
          "col_7": "Inferior",
          "col_8": "TODO"
        },
        {
          "row_number": 29,
          " ": "",
          "col_2": "",
          "col_3": 0,
          "col_4": 0.1,
          "col_5": 0.1,
          "col_6": -0.25,
          "col_7": 0.1,
          "col_8": 0
        },
        {
          "row_number": 30,
          " ": "Utilities",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = K16)) ",
          "col_3": "Inferior",
          "col_4": "Inferior",
          "col_5": "Inferior",
          "col_6": "Similar",
          "col_7": "Inferior",
          "col_8": "TODO"
        },
        {
          "row_number": 31,
          " ": "",
          "col_2": "",
          "col_3": 0.25,
          "col_4": 0.25,
          "col_5": 0.05,
          "col_6": 0,
          "col_7": 0.25,
          "col_8": 0
        },
        {
          "row_number": 32,
          " ": "Frontage",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = K16)) ",
          "col_3": "Similar",
          "col_4": "Similar",
          "col_5": "Superior",
          "col_6": "Similar",
          "col_7": "Inferior",
          "col_8": "TODO"
        },
        {
          "row_number": 33,
          " ": "",
          "col_2": "",
          "col_3": 0,
          "col_4": 0,
          "col_5": -0.2,
          "col_6": 0,
          "col_7": 0.2,
          "col_8": 0
        },
        {
          "row_number": 34
        },
        {
          "row_number": 35,
          " ": "Total Adjustment",
          "col_2": "",
          "col_3": "=SUM_ADJUSTMENT_PERCENTS(25)",
          "col_4": "=SUM_ADJUSTMENT_PERCENTS(25)",
          "col_5": "=SUM_ADJUSTMENT_PERCENTS(25)",
          "col_6": "=SUM_ADJUSTMENT_PERCENTS(25)",
          "col_7": "=SUM_ADJUSTMENT_PERCENTS(25)",
          "col_8": "=SUM_ADJUSTMENT_PERCENTS(25)"
        },
        {
          "row_number": 36,
          " ": "Adjusted $ / SF",
          "col_2": "",
          "col_3": "=GET_ADJ_PRICE_SF(C21)",
          "col_4": "=GET_ADJ_PRICE_SF(D21)",
          "col_5": "=GET_ADJ_PRICE_SF(E21)",
          "col_6": "=GET_ADJ_PRICE_SF(F21)",
          "col_7": "=GET_ADJ_PRICE_SF(G21)",
          "col_8": "=GET_ADJ_PRICE_SF(H21)"
        },
        {
          "row_number": 37,
          " ": "Adjusted Mean $ / SF",
          "col_2": "",
          "col_3": "",
          "col_4": "",
          "col_5": "",
          "col_6": "",
          "col_7": "",
          "col_8": "=GET_ADJ_MEAN()"
        },
        {
          "row_number": 38
        },
        {
          "row_number": 39,
          " ": "A value generally in-line with the mean is well supported.",
          "col_2": "",
          "col_3": "",
          "col_4": "",
          "col_5": "",
          "col_6": "$ / SF",
          "col_7": "",
          "col_8": "=GET_ADJ_RATE(L17, L18, L19,L21)"
        },
        {
          "row_number": 40,
          " ": "",
          "col_2": "",
          "col_3": "",
          "col_4": "",
          "col_5": "",
          "col_6": "$ / AC",
          "col_7": "",
          "col_8": "=GET_ADJ_RATE_AC()"
        },
        {
          "row_number": 41
        },
        {
          "row_number": 42,
          " ": "Land Size (SF)",
          "col_2": "",
          "col_3": "",
          "col_4": "",
          "col_5": "",
          "col_6": "",
          "col_7": "",
          "col_8": "=FILTER(Subject[Land Size (SF)], Subject[Type] = K16)"
        },
        {
          "row_number": 43,
          " ": "Value Indication",
          "col_2": "",
          "col_3": "",
          "col_4": "",
          "col_5": "",
          "col_6": "",
          "col_7": "",
          "col_8": "=GET_ADJ_VALUE_INDICATION_LAND()"
        },
        {
          "row_number": 44,
          " ": "Concluded Value - Land",
          "col_2": "",
          "col_3": "",
          "col_4": "",
          "col_5": "",
          "col_6": "",
          "col_7": "",
          "col_8": "=GET_ADJ_ROUNDED_VALUE_INDICATION(L20)"
        }
      ],
      "land-adjustments-J16:K21": [
        {
          "row_number": 2,
          "Subject Type": "Exclude Extremes",
          "Improvements": false
        },
        {
          "row_number": 3,
          "Subject Type": "Round Up",
          "Improvements": false
        },
        {
          "row_number": 4,
          "Subject Type": "disable rounding",
          "Improvements": true
        },
        {
          "row_number": 5,
          "Subject Type": "Rund Final Value",
          "Improvements": true
        },
        {
          "row_number": 6,
          "Subject Type": "includeMedian",
          "Improvements": false
        }
      ]
    }
  }
]
```

### Label Options for Column A Variables

```excel
=CompsLand[[#HEADERS],[Address]:[Comments]]
```

### Adjustment Percentages

1. Range of numbers

```excel
=AdjustmentPercentages
```

This is a named range on the "adj inputs" sheet with the formula of

```excel
=LET(
  series1, SEQUENCE(14, 1, -80, 5),
  series2, SEQUENCE(25, 1, -12, 1),
  series3, SEQUENCE(14, 1, 15, 5),
  combined_series, {series1; series2; series3},
  SORT(UNIQUE(combined_series / 100))
)
```

## sales-adjustments sheet page

### Formulas

```json
[
  {
    "data": {
      "sales-adjustments-A1:H46": [
        {
          "row_number": 2
        },
        {
          "row_number": 3,
          " ": "",
          "col_2": "Subject",
          "col_3": "1",
          "col_4": "=C3+1",
          "col_5": "=D3+1",
          "col_6": "=E3+1",
          "col_7": "=F3+1",
          "col_8": 6
        },
        {
          "row_number": 4,
          " ": "Address",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = \"Improvements\")) ",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) "
        },
        {
          "row_number": 5,
          " ": "Date of Sale",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = \"Improvements\")) ",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) "
        },
        {
          "row_number": 6,
          " ": "Building Size (SF)",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = \"Improvements\")) ",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) "
        },
        {
          "row_number": 7,
          " ": "Sale Price / SF (Adj)",
          "col_2": "",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) "
        },
        {
          "row_number": 8
        },
        {
          "row_number": 9,
          " ": "TRANSACTION ADJUSTMENTS"
        },
        {
          "row_number": 10,
          " ": "Property Rights",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = \"Improvements\")) ",
          "col_3": "Similar",
          "col_4": "Similar",
          "col_5": "Similar",
          "col_6": "Similar",
          "col_7": "Similar",
          "col_8": "Similar"
        },
        {
          "row_number": 11,
          " ": "",
          "col_2": "",
          "col_3": 0,
          "col_4": 0,
          "col_5": 0,
          "col_6": 0,
          "col_7": 0,
          "col_8": 0
        },
        {
          "row_number": 12,
          " ": "",
          "col_2": "",
          "col_3": "=C7 + C7 * C11",
          "col_4": "=D7 + D7 * D11",
          "col_5": "=E7 + E7 * E11",
          "col_6": "=F7 + F7 * F11",
          "col_7": "=G7 + G7 * G11",
          "col_8": "=H7 + H7 * H11"
        },
        {
          "row_number": 13,
          " ": "Financing Terms",
          "col_2": "",
          "col_3": "Similar",
          "col_4": "Similar",
          "col_5": "Similar",
          "col_6": "Similar",
          "col_7": "Similar",
          "col_8": "Similar"
        },
        {
          "row_number": 14,
          " ": "",
          "col_2": "",
          "col_3": 0,
          "col_4": 0,
          "col_5": 0,
          "col_6": 0,
          "col_7": 0,
          "col_8": 0
        },
        {
          "row_number": 15,
          " ": "",
          "col_2": "",
          "col_3": "=C12 + C12 * C14",
          "col_4": "=D12 + D12 * D14",
          "col_5": "=E12 + E12 * E14",
          "col_6": "=F12 + F12 * F14",
          "col_7": "=G12 + G12 * G14",
          "col_8": "=H12 + H12 * H14"
        },
        {
          "row_number": 16,
          " ": "Conditions of Sale",
          "col_2": "",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) "
        },
        {
          "row_number": 17,
          " ": "",
          "col_2": "",
          "col_3": 0,
          "col_4": 0,
          "col_5": 0,
          "col_6": 0,
          "col_7": 0,
          "col_8": 0
        },
        {
          "row_number": 18,
          " ": "",
          "col_2": "",
          "col_3": "=C15 + C15 * C17",
          "col_4": "=D15 + D15 * D17",
          "col_5": "=E15 + E15 * E17",
          "col_6": "=F15 + F15 * F17",
          "col_7": "=G15 + G15 * G17",
          "col_8": "=H15 + H15 * H17"
        },
        {
          "row_number": 19,
          " ": "Market Conditions",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = \"Improvements\")) ",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) "
        },
        {
          "row_number": 20,
          " ": "",
          "col_2": "",
          "col_3": "=CALC_MONTHLY_INCREASE(C19, ReportInputs)",
          "col_4": "=CALC_MONTHLY_INCREASE(D19, ReportInputs)",
          "col_5": "=CALC_MONTHLY_INCREASE(E19, ReportInputs)",
          "col_6": "=CALC_MONTHLY_INCREASE(F19, ReportInputs)",
          "col_7": "=CALC_MONTHLY_INCREASE(G19, ReportInputs)",
          "col_8": "=CALC_MONTHLY_INCREASE(H19, ReportInputs)"
        },
        {
          "row_number": 21,
          " ": "",
          "col_2": "",
          "col_3": "=C18 + C18 * C20",
          "col_4": "=D18 + D18 * D20",
          "col_5": "=E18 + E18 * E20",
          "col_6": "=F18 + F18 * F20",
          "col_7": "=G18 + G18 * G20",
          "col_8": "=H18 + H18 * H20"
        },
        {
          "row_number": 22
        },
        {
          "row_number": 23,
          " ": "PROPERTY ADJUSTMENTS"
        },
        {
          "row_number": 24,
          " ": "Location",
          "col_2": "Good",
          "col_3": "Inferior",
          "col_4": "Inferior",
          "col_5": "Similar",
          "col_6": "Inferior",
          "col_7": "Superior",
          "col_8": "Superior"
        },
        {
          "row_number": 25,
          " ": "",
          "col_2": "",
          "col_3": 0.1,
          "col_4": 0.1,
          "col_5": 0,
          "col_6": 0.1,
          "col_7": -0.2,
          "col_8": -0.2
        },
        {
          "row_number": 26,
          " ": "Age / Condition",
          "col_2": "=FILTER(Subject[Effective Age], Subject[Type] = \"Improvements\")",
          "col_3": "Similar",
          "col_4": "Similar",
          "col_5": "Similar",
          "col_6": "Similar",
          "col_7": "Similar",
          "col_8": "Similar"
        },
        {
          "row_number": 27,
          " ": "",
          "col_2": "=FILTER(Subject[Condition], Subject[Type] = \"Improvements\")",
          "col_3": 0,
          "col_4": 0,
          "col_5": 0,
          "col_6": 0,
          "col_7": 0,
          "col_8": 0
        },
        {
          "row_number": 28,
          " ": "Building Size (SF)",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = \"Improvements\")) ",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) "
        },
        {
          "row_number": 29,
          " ": "",
          "col_2": "",
          "col_3": -0.05,
          "col_4": 0,
          "col_5": 0,
          "col_6": 0.05,
          "col_7": -0.05,
          "col_8": -0.05
        },
        {
          "row_number": 30,
          " ": "Office %",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = \"Improvements\")) ",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) "
        },
        {
          "row_number": 31,
          " ": "",
          "col_2": "",
          "col_3": 0.05,
          "col_4": -0.05,
          "col_5": -0.05,
          "col_6": -0.05,
          "col_7": 0.05,
          "col_8": -0.15
        },
        {
          "row_number": 32,
          " ": "Land / Bld Ratio",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = \"Improvements\")) ",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) "
        },
        {
          "row_number": 33,
          " ": "",
          "col_2": "",
          "col_3": 0,
          "col_4": 0,
          "col_5": 0,
          "col_6": 0,
          "col_7": 0,
          "col_8": 0
        },
        {
          "row_number": 34,
          " ": "Zoning",
          "col_2": "=GET_ADJUSTMENT_DATA(Subject[#HEADERS], FILTER(Subject, Subject[Type] = \"Improvements\")) ",
          "col_3": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_4": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_5": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_6": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_7": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) ",
          "col_8": "=GET_ADJUSTMENT_DATA(CompsSales[#HEADERS], CompsSales) "
        },
        {
          "row_number": 35,
          " ": "",
          "col_2": "",
          "col_3": 0,
          "col_4": 0,
          "col_5": 0,
          "col_6": 0,
          "col_7": -0.4,
          "col_8": 0
        },
        {
          "row_number": 36
        },
        {
          "row_number": 37,
          " ": "Net Property Adjustment",
          "col_2": "",
          "col_3": "=SUM_ADJUSTMENT_PERCENTS(25)",
          "col_4": "=SUM_ADJUSTMENT_PERCENTS(25)",
          "col_5": "=SUM_ADJUSTMENT_PERCENTS(25)",
          "col_6": "=SUM_ADJUSTMENT_PERCENTS(25)",
          "col_7": "=SUM_ADJUSTMENT_PERCENTS(25)",
          "col_8": "=SUM_ADJUSTMENT_PERCENTS(25)"
        },
        {
          "row_number": 38,
          " ": "Adjusted $ / SF",
          "col_2": "",
          "col_3": "=GET_ADJ_PRICE_SF(C21)",
          "col_4": "=GET_ADJ_PRICE_SF(D21)",
          "col_5": "=GET_ADJ_PRICE_SF(E21)",
          "col_6": "=GET_ADJ_PRICE_SF(F21)",
          "col_7": "=GET_ADJ_PRICE_SF(G21)",
          "col_8": "=GET_ADJ_PRICE_SF(H21)"
        },
        {
          "row_number": 39,
          " ": "Adjusted Mean $ / SF",
          "col_2": "",
          "col_3": "",
          "col_4": "",
          "col_5": "",
          "col_6": "",
          "col_7": "",
          "col_8": "=GET_ADJ_MEAN()"
        },
        {
          "row_number": 40,
          " ": "Adjusted Median $ / SF",
          "col_2": "",
          "col_3": "",
          "col_4": "",
          "col_5": "",
          "col_6": "",
          "col_7": "",
          "col_8": "=IFERROR(MEDIAN(INDIRECT(ADDRESS(ROW()-2, 3, 4) & \":\" & ADDRESS(ROW()-2, 8, 4))), \"\")"
        },
        {
          "row_number": 41
        },
        {
          "row_number": 42,
          " ": "A value generally in-line with the mean is well supported.",
          "col_2": "",
          "col_3": "",
          "col_4": "",
          "col_5": "",
          "col_6": "",
          "col_7": "",
          "col_8": "=GET_ADJ_RATE(M6, M7, M8, M11)"
        },
        {
          "row_number": 43,
          " ": "",
          "col_2": "",
          "col_3": "",
          "col_4": " "
        },
        {
          "row_number": 44,
          " ": "Improvement Size (SF)",
          "col_2": "",
          "col_3": "",
          "col_4": "",
          "col_5": "",
          "col_6": "",
          "col_7": "",
          "col_8": "=FILTER(Subject[Building Size (SF)], Subject[Type] = \"Improvements\")"
        },
        {
          "row_number": 45,
          " ": "Value Indication",
          "col_2": "",
          "col_3": "",
          "col_4": "",
          "col_5": "",
          "col_6": "",
          "col_7": "",
          "col_8": "=GET_ADJ_VALUE_INDICATION()"
        },
        {
          "row_number": 46,
          " ": "Concluded Value - Site and Improvements",
          "col_2": "",
          "col_3": "",
          "col_4": "",
          "col_5": "",
          "col_6": "",
          "col_7": "",
          "col_8": "=GET_ADJ_ROUNDED_VALUE_INDICATION(M10)"
        }
      ],
      "sales-adjustments-L5:M11": [
        {
          "row_number": 2,
          "Feature": "Exclude Extremes",
          "Value": false
        },
        {
          "row_number": 3,
          "Feature": "Round Up",
          "Value": true
        },
        {
          "row_number": 4,
          "Feature": "disable rounding",
          "Value": false
        },
        {
          "row_number": 5,
          "Feature": "Rund Final Value",
          "Value": true
        },
        {
          "row_number": 6,
          "Feature": "Round to 5k",
          "Value": true
        },
        {
          "row_number": 7,
          "Feature": "includeMedian",
          "Value": true
        }
      ]
    }
  }
]
```

### Label Options for Column A Variables

```excel
=CompsSales[[#HEADERS],[Address]:[Comments]]
```

### Dropdown Options

1. Adjustment Percentages Range

```excel
=AdjustmentPercentages
```

This is a named range on the "adj inputs" sheet with the formula of

```excel
=LET(
  series1, SEQUENCE(14, 1, -80, 5),
  series2, SEQUENCE(25, 1, -12, 1),
  series3, SEQUENCE(14, 1, 15, 5),
  combined_series, {series1; series2; series3},
  SORT(UNIQUE(combined_series / 100))
)
```

2. Comparison Data Range

```excel
='adj vals'!$B$4:$B$7
```

which is equals to:
TODO
Inferior
Similar
Superior
Slightly Inferior
Slightly Superior
