# Comps Indicated Values Sheet Info

## SalesIndicatedValues Table Formulas

### Table Body

```excel
=LET(
    adjSheetName, "sales-adjustments",
    adjSheet, INDIRECT("'"&adjSheetName&"'!A:ZZ"),
    adjSheetACol, INDEX(adjSheet, 0, 1),
    adjSFRawRow, MATCH("Adjusted $ / SF", adjSheetACol, 0),
    adjMeanRow, MATCH("Adjusted Mean $ / SF", adjSheetACol, 0),
    IF(OR(ISNA(adjSFRawRow), ISNA(adjMeanRow)),
       {"Error"; "Cannot find key labels ('Adjusted $ / SF' or 'Adjusted Mean $ / SF') in Col A of " & adjSheetName},
    LET(
        firstCompColNum, 3,
        row3ValuesAll, INDEX(adjSheet, 3, 0),
        numericRow3Values, FILTER(row3ValuesAll, ISNUMBER(row3ValuesAll)*(row3ValuesAll>=1)*(SEQUENCE(1,COLUMNS(row3ValuesAll))>=firstCompColNum)),
        maxCompNum, IFERROR(MAX(numericRow3Values), 0),
        IF(maxCompNum = 0,
           {"Error"; "No positive numeric Comp numbers found in Row 3 (Col C onwards) of " & adjSheetName},
        LET(
            lastCompCol, firstCompColNum + maxCompNum - 1,
            compColNumbers, SEQUENCE(1, maxCompNum, firstCompColNum),
            saleNumbersRow, CHOOSECOLS(row3ValuesAll, compColNumbers),
            fullAdjSFRow, INDEX(adjSheet, adjSFRawRow, 0),
            adjSFValuesRow, CHOOSECOLS(fullAdjSFRow, compColNumbers),
            pairedDataCols_unsorted, TRANSPOSE(VSTACK(saleNumbersRow, adjSFValuesRow)),
            pairedDataCols_sorted, SORT(pairedDataCols_unsorted, 2, TRUE),
            pairedDataCols_sorted
           )
          )
       )
    )
)
```

### Table Footer

```excel
=LET(
    adjSheetName, "sales-adjustments",
    adjSheet, INDIRECT("'"&adjSheetName&"'!A:ZZ"),
    adjSheetACol, INDEX(adjSheet, 0, 1),
    adjMeanRow, MATCH("Adjusted Mean $ / SF", adjSheetACol, 0),
    IF(ISNA(adjMeanRow),
       "Error: Cannot find 'Adjusted Mean $ / SF' label in Col A of " & adjSheetName,
    LET(
        firstCompColNum, 3,
        row3ValuesAll, INDEX(adjSheet, 3, 0),
        numericRow3Values, FILTER(row3ValuesAll, ISNUMBER(row3ValuesAll)*(row3ValuesAll>=1)*(SEQUENCE(1,COLUMNS(row3ValuesAll))>=firstCompColNum)),
        maxCompNum, IFERROR(MAX(numericRow3Values), 0),
        IF(maxCompNum = 0,
           "Error: No positive numeric Comp numbers found in Row 3 (Col C onwards)",
        LET(
            lastCompCol, firstCompColNum + maxCompNum - 1,
            meanValue, INDEX(adjSheet, adjMeanRow, lastCompCol),
            meanValue
           )
          )
       )
    )
)

```

## Generated Text

### IndicatedValuesInputs Table (Top Right)

Note: this output is from the get formulas endpoint noted in the n&n-appraisal-sheet-formulas skill

```json
{
  "sales-indicated-values-M2:N6": [
    {
      "row_number": 2,
      "Subject Size": "Exclude Extremes",
      "=FILTER(Subject[Building Size (SF)], Subject[Type] = \"Improvements\")": false
    },
    {
      "row_number": 3,
      "Subject Size": "Indicated Value",
      "=FILTER(Subject[Building Size (SF)], Subject[Type] = \"Improvements\")": "=INDEX(CompSalesAdjustmentsRange, ROWS(CompSalesAdjustmentsRange) -1, COLUMNS(CompSalesAdjustmentsRange))"
    },
    {
      "row_number": 4,
      "Subject Size": "Indicated Value (SF)",
      "=FILTER(Subject[Building Size (SF)], Subject[Type] = \"Improvements\")": "=INDEX(CompSalesAdjustmentsRange, ROWS(CompSalesAdjustmentsRange) -4, COLUMNS(CompSalesAdjustmentsRange))"
    },
    {
      "row_number": 5,
      "Subject Size": "Indicated Value (Rounded)",
      "=FILTER(Subject[Building Size (SF)], Subject[Type] = \"Improvements\")": "=INDEX(CompSalesAdjustmentsRange, ROWS(CompSalesAdjustmentsRange), COLUMNS(CompSalesAdjustmentsRange))"
    }
  ]
}
```

### Gemini Inputs (bottom right on screenshot)

```excel
="Building Size (SF): " & FILTER(IndicatedValuesInputs[Value], IndicatedValuesInputs[Label] = "Subject Size") & CHAR(10) & "Exclude Extremes: " & FILTER(IndicatedValuesInputs[Value], IndicatedValuesInputs[Label] = "Exclude Extremes") & CHAR(10) & "Indicated Value (SF): " & FILTER(IndicatedValuesInputs[Value], IndicatedValuesInputs[Label] = "Indicated Value (SF)") & CHAR(10) & "Indicated Value: " & FILTER(IndicatedValuesInputs[Value], IndicatedValuesInputs[Label] = "Indicated Value") & CHAR(10) & "Indicated Value (Rounded): " & FILTER(IndicatedValuesInputs[Value], IndicatedValuesInputs[Label] = "Indicated Value (Rounded)") & CHAR(10) & "Indicated Market Values csv" & CHAR(10) & CHAR(10) & rangeToCsvString(SalesIndicatedValuesRange)
```

### Center Paragraph Text

```json
{
  "sales-indicated-values-E2:J14": [
    {
      "row_number": 2
    },
    {
      "row_number": 3
    },
    {
      "row_number": 4
    },
    {
      "row_number": 5
    },
    {
      "row_number": 6,
      "=askGemini(FILTER(AIPrompts[prompt], AIPrompts[key] = \"compSalesAdjSummary\"), M15)": "To this value, the value of the land is added."
    },
    {
      "row_number": 7
    },
    {
      "row_number": 8,
      "=askGemini(FILTER(AIPrompts[prompt], AIPrompts[key] = \"compSalesAdjSummary\"), M15)": "",
      "col_2": "Improvements",
      "col_3": "",
      "col_4": "=VALUE(INDEX(CompSalesAdjustmentsRange, ROWS(CompSalesAdjustmentsRange), COLUMNS(CompSalesAdjustmentsRange)))"
    },
    {
      "row_number": 9,
      "=askGemini(FILTER(AIPrompts[prompt], AIPrompts[key] = \"compSalesAdjSummary\"), M15)": "",
      "col_2": "Land",
      "col_3": "",
      "col_4": "=VALUE(INDEX(CompLandAdjustmentsRange, ROWS(CompLandAdjustmentsRange), COLUMNS(CompLandAdjustmentsRange)))"
    },
    {
      "row_number": 10,
      "=askGemini(FILTER(AIPrompts[prompt], AIPrompts[key] = \"compSalesAdjSummary\"), M15)": "",
      "col_2": "Indicated Value",
      "col_3": "",
      "col_4": "=SUM(H9:H10)"
    },
    {
      "row_number": 11
    },
    {
      "row_number": 12,
      "=askGemini(FILTER(AIPrompts[prompt], AIPrompts[key] = \"compSalesAdjSummary\"), M15)": "Final Value via Sales Comparison Approach:"
    },
    {
      "row_number": 13,
      "=askGemini(FILTER(AIPrompts[prompt], AIPrompts[key] = \"compSalesAdjSummary\"), M15)": "=TEXT(VALUE(H11), \"$#,##0\") & \" R\""
    }
  ]
}
```
