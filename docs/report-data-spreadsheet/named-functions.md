# Google Sheets Named Functions

## `GET_NOI`

**Description:** gets the NOI from the income schedule

### Arguments

- `input_range`

### Formula

```excel
=INDEX(input_range, MATCH("Net Operating Income", INDEX(input_range, 0, 1), 0), COLUMNS(input_range))
```

---

## `AC_TO_SF`

**Description:** Converts acres to square feet

### Arguments

- `num_acres`

### Formula

```excel
=num_acres * 43560
```

---

## `CALC_MONTHLY_INCREASE`

**Description:** _(None provided)_

### Arguments

- `past_date`
- `report_inputs_range`

### Formula

```excel
=LET(
  value_col, IFERROR(INDEX(report_inputs_range, 0, 3)),
  variable_name_col, IFERROR(INDEX(report_inputs_range, 0, 1)),
  constant_val, IFERROR(FILTER(value_col, variable_name_col = "PercentIncPerMonth")),
  current_date_val, IFERROR(FILTER(value_col, variable_name_col = "ReportEffectiveDate")),
  IF(ISNA(constant_val), "Err: 'PercentIncPerMonth' not found",
    IF(ISNA(current_date_val), "Err: 'ReportEffectiveDate' not found",
      IF(NOT(ISDATE(past_date)), "Err: Invalid Past Date",
        LET(
          month_diff, (YEAR(current_date_val) - YEAR(past_date)) * 12 + MONTH(current_date_val) - MONTH(past_date),
          IF(month_diff < 3,
            0,
            LET(
              rounded_value, ROUND(month_diff * constant_val, 0),
              rounded_value / 100
            )
          )
        )
      )
    )
  )
)
```

---

## `CALC_SF_ADJUSTMENT`

**Description:** _(None provided)_

### Arguments

- `subject_sf`
- `comp_sf`
- `report_inputs_range`
- `report_inputs_var`
- `tolerance_sf`

### Formula

```excel
=LET(
  value_col, IFERROR(INDEX(report_inputs_range, 0, 3)),
  variable_name_col, IFERROR(INDEX(report_inputs_range, 0, 1)),
  adjustment_val, IFERROR(FILTER(value_col, variable_name_col = report_inputs_var)),
  IF(ISNA(adjustment_val), "Err: 'SalesAdjPerSf' not found",
    IF(NOT(ISNUMBER(subject_sf)), "Err: Invalid Subject SF",
      IF(NOT(ISNUMBER(comp_sf)), "Err: Invalid Comp SF",
        IF(NOT(ISNUMBER(tolerance_sf)), "Err: Invalid Tolerance SF",
          IF(ABS(comp_sf - subject_sf) <= tolerance_sf,
            0,
            (comp_sf - subject_sf) * adjustment_val
          )
        )
      )
    )
  )
)
```

---

## `CALCULATE_AGE`

**Description:** _(None provided)_

### Arguments

- `instrument_number`
- `fallback_age`
- `report_inputs_range`
- `parcel_improvements_range`

### Formula

```excel
=IFERROR(
  LET(
    effective_date_year, YEAR(FILTER(INDEX(report_inputs_range, 0, 3), INDEX(report_inputs_range, 0, 1) = "ReportEffectiveDate")),
    pi_headers, INDEX(parcel_improvements_range, 1, 0),
    eyb_col, MATCH("Effective Year Built", pi_headers, 0),
    instr_col, MATCH("instrumentNumber", pi_headers, 0),
    gla_col, MATCH("Is GLA", pi_headers, 0),
    parcel_year_built, IFERROR(
      FILTER(
        INDEX(parcel_improvements_range, 0, eyb_col),
        INDEX(parcel_improvements_range, 0, instr_col) = instrument_number,
        INDEX(parcel_improvements_range, 0, gla_col) = TRUE
      )
    ),
    IF(
      AND(ROWS(parcel_year_built) > 0, INDEX(parcel_year_built, 1) <> ""),
      effective_date_year - INDEX(parcel_year_built, 1),
      fallback_age
    )
  )
)
```

---

## `GET_ADJ_MEAN`

**Description:** _(None provided)_

### Arguments

_(None)_

### Formula

```excel
=IFERROR(AVERAGE(INDIRECT(ADDRESS(ROW()-1, 3, 4) & ":" & ADDRESS(ROW()-1, COLUMN(), 4))), "")
```

---

## `GET_ADJ_MEDIAN`

**Description:** _(None provided)_

### Arguments

_(None)_

### Formula

```excel
=IFERROR(MEDIAN(INDIRECT(ADDRESS(ROW()-2, 3, 4) & ":" & ADDRESS(ROW()-2, 6, 4))), "")
```

---

## `GET_ADJ_PRICE_SF`

**Description:** get the adjusted price per SF based off the sum of adjustments and the current preice per SF

### Arguments

- `price_ref`

### Formula

```excel
=IFERROR(price_Ref + INDIRECT(ADDRESS(ROW()-1, COLUMN(), 4)) * price_Ref, "")
```

---

## `GET_ADJ_RATE`

**Description:** _(None provided)_

### Arguments

- `exclude_extremes`
- `round_up`
- `disable_rounding`
- `includemedian`

### Formula

```excel
=IF(exclude_extremes,
  LET(
    range_start_col, 3,
    data_row_offset, 3,
    data_range, INDIRECT(ADDRESS(ROW() - data_row_offset, range_start_col, 4) & ":" & ADDRESS(ROW() - data_row_offset, COLUMN(), 4)),
    filtered_values, FILTER(data_range, data_range <> MAX(data_range), data_range <> MIN(data_range)),
    IFERROR(TEXT(ROUNDUP(AVERAGE(filtered_values), 1), "$0.00"), "ERROR")
  ),
  LET(
    val_2_up, INDIRECT(ADDRESS(ROW() - 2, COLUMN(), 4)),
    val_3_up, INDIRECT(ADDRESS(ROW() - 3, COLUMN(), 4)),
    target_val, IF(includemedian, AVERAGE(val_2_up, val_3_up), val_2_up),
    IFERROR(
      IF(disable_rounding, target_val,
        TEXT(
          IF(round_up, ROUNDUP(target_val, 1), ROUND(target_val, 1)),
          "$0.00"
        )
      ),
      "ERROR"
    )
  )
)
```

---

## `GET_ADJ_RATE_AC`

**Description:** For land, transform the adj rate per sqft to acers

### Arguments

_(None)_

### Formula

```excel
=IFERROR(TEXT(INDIRECT(ADDRESS(ROW()-1,COLUMN(),4)) * 43560, "$#,##0"), "$0")
```

---

## `GET_ADJ_RENTAL_INCOME`

**Description:** _(None provided)_

### Arguments

_(None)_

### Formula

```excel
=IFERROR(INDIRECT(ADDRESS(ROW()-3,COLUMN(),4)) * INDIRECT(ADDRESS(ROW()-1,COLUMN(),4)), 0)
```

---

## `GET_ADJ_RENTAL_RATE`

**Description:** _(None provided)_

### Arguments

_(None)_

### Formula

```excel
=IFERROR(ROUND(AVERAGE(INDIRECT(ADDRESS(ROW()-2,COLUMN(),4)&":"&ADDRESS(ROW()-1,COLUMN(),4))),1),"")
```

---

## `GET_ADJ_ROUNDED_VALUE_INDICATION`

**Description:** _(None provided)_

### Arguments

- `round_to_5k`

### Formula

```excel
=LET(
  input_val, INDIRECT(ADDRESS(ROW()-1, COLUMN(), 4)),
  IFERROR(
    TEXT(
      IF(round_to_5k,
        CEILING(input_val, 5000),
        ROUND(input_val, -3)
      ),
      "$#,##0"
    ),
    "ERROR"
  )
)
```

---

## `GET_ADJ_VALUE_INDICATION`

**Description:** _(None provided)_

### Arguments

_(None)_

### Formula

```excel
=IFERROR(INDIRECT(ADDRESS(ROW()-3,COLUMN(),4)) * INDIRECT(ADDRESS(ROW()-1,COLUMN(),4)), 0)
```

---

## `GET_ADJ_VALUE_INDICATION_LAND`

**Description:** _(None provided)_

### Arguments

_(None)_

### Formula

```excel
=IFERROR(INDIRECT(ADDRESS(ROW()-4, COLUMN(), 4)) * INDIRECT(ADDRESS(ROW()-1, COLUMN(), 4)), 0)
```

---

## `GET_ADJUSTMENT_DATA`

**Description:** _(None provided)_

### Arguments

- `header_range`
- `data_range`

### Formula

```excel
=IFERROR(
  LET(
    calling_row, ROW(),
    calling_col, COLUMN(),
    target_header_raw, TRIM(INDIRECT(ADDRESS(calling_row, 1))),
    target_header_for_match, IFS(
      target_header_raw = "Age", "Effective Age",
      ISNUMBER(SEARCH("Elapsed Time", target_header_raw)), "Elapsed Time",
      TRUE, target_header_raw
    ),
    filter_cell_value, INDIRECT(ADDRESS(3, calling_col)),
    is_subject_case, ISNUMBER(SEARCH("Subject", filter_cell_value)),
    table_headers_raw, header_range,
    table_headers_trimmed, ARRAYFORMULA(TRIM(table_headers_raw)),
    target_col_index, IFERROR(MATCH(target_header_for_match, table_headers_trimmed, 0)),
    raw_result, IF(
      is_subject_case,
      IFS(
        target_header_raw = "Address",
          LET(
            subj_col_index, MATCH("Address", table_headers_trimmed, 0),
            IFERROR(INDEX(data_range, 1, subj_col_index), "")
          ),
        target_header_raw = "Land / Bld Ratio (Adj)",
          LET(
            subj_col_index, MATCH("Land / Bld Ratio", table_headers_trimmed, 0),
            IFERROR(INDEX(data_range, 1, subj_col_index), "")
          ),
        target_header_raw = "Rentable SF",
          LET(
            subj_col_index, MATCH("Building Size (SF)", table_headers_trimmed, 0),
            IFERROR(INDEX(data_range, 1, subj_col_index), "")
          ),
        TRUE,
          IFERROR(INDEX(data_range, 1, target_col_index), "")
      ),
      LET(
        filter_lookup_value, INT(filter_cell_value),
        filter_column_header_name, "#",
        filter_col_index, MATCH(filter_column_header_name, table_headers_trimmed, 0),
        use_type_col_index, MATCH("Use Type", table_headers_trimmed, 0),
        filtered_data, FILTER(data_range, (INDEX(data_range, 0, filter_col_index) = filter_lookup_value) * ((INDEX(data_range, 0, use_type_col_index) = "Sale") + (INDEX(data_range, 0, use_type_col_index) = "Rental"))),
        IF(
          target_header_raw = "Amenities",
          LET(
            h_col, IFERROR(MATCH("Hoisting", table_headers_trimmed, 0)),
            hcp_col, IFERROR(MATCH("Hoisting Crane Present", table_headers_trimmed, 0)),
            wb_col, IFERROR(MATCH("Wash Bay", table_headers_trimmed, 0)),

            hoist_text, IF(
              AND(
                NOT(ISNA(h_col)),
                NOT(ISNA(hcp_col)),
                INDEX(filtered_data, 1, h_col) <> "None",
                INDEX(filtered_data, 1, h_col) <> "",
                INDEX(filtered_data, 1, hcp_col) = "Yes"
              ),
              "Hoisting",
              ""
            ),

            washbay_text, IF(
              AND(
                NOT(ISNA(wb_col)),
                INDEX(filtered_data, 1, wb_col) = "Yes"
              ),
              "Wash Bay",
              ""
            ),

            TEXTJOIN(", ", TRUE, hoist_text, washbay_text)
          ),
          IFERROR(INDEX(filtered_data, 1, target_col_index), "")
        )
      )
    ),
    IF(
      raw_result = "",
      "",
      IFS(
        target_header_raw = "Address",
          IFERROR(
            SUBSTITUTE(
              LEFT(raw_result, SEARCH(",", raw_result, SEARCH(",", raw_result) + 1) - 1),
              ",", "", 1
            ),
            raw_result
          ),
        target_header_raw = "Market Conditions",
          IFERROR(
            LET(
              comma_position, SEARCH(",", raw_result),
              street_part, LEFT(raw_result, comma_position - 1),
              city_state_zip_part, TRIM(RIGHT(raw_result, LEN(raw_result) - comma_position)),
              street_part & CHAR(10) & city_state_zip_part
            ),
            raw_result
          ),
        target_header_raw = "Date of Sale", TEXT(raw_result, "MMM YYYY"),
        target_header_raw = "Lease Start", TEXT(raw_result, "MMM YYYY"),
        target_header_raw = "Land / Bld Ratio", TEXT(raw_result, "0.00"),
        target_header_raw = "Land / Bld Ratio (Adj)", TEXT(raw_result, "0.00"),
        target_header_raw = "Market Conditions (Elapsed Time)", TEXT(raw_result, "0.00"),
        target_header_raw = "Office %", TEXT(raw_result, "0.0%"),
        target_header_raw = "Occupancy %", TEXT(raw_result, "0%"),
        target_header_raw = "Overall Cap Rate", TEXT(raw_result, "0.00%"),
        target_header_raw = "Sale Price / SF", TEXT(raw_result, "$#,##0.00"),
        target_header_raw = "Sale Price / SF (Adj)", TEXT(raw_result, "$#,##0.00"),
        target_header_raw = "Annual Rent / SF", TEXT(raw_result, "$#,##0.00"),
        target_header_raw = "Post Sale Renovation Cost", TEXT(raw_result, "$#,##0"),
        target_header_raw = "Building Size (SF)", TEXT(raw_result, "#,##0"),
        target_header_raw = "Rentable SF", TEXT(raw_result, "#,##0"),
        target_header_raw = "Parking (SF)", TEXT(raw_result, "#,##0"),
        target_header_raw = "Land Size (SF)", TEXT(raw_result, "#,##0"),
        target_header_raw = "Land Size (AC)", TEXT(raw_result, "#,##0.000"),
        target_header_raw = "Age", TEXT(raw_result, "0"),
        target_header_raw = "Effective Age", TEXT(raw_result, "0.0"),
        TRUE, raw_result
      )
    )
  ),
  "" )
```

---

## `GET_AVG_WITH_EXT`

**Description:** Get the average of a range of numbers with the option to exclude the extremes

### Arguments

- `range`
- `exclude_extremes`

### Formula

```excel
=IF(exclude_extremes, IFERROR(AVERAGE(FILTER(range, range <> MAX(range), range <> MIN(range))), "N/A or Error"), IFERROR(AVERAGE(range), "N/A or Error"))
```

---

## `GET_DETAIL_DATA`

**Description:** _(None provided)_

### Arguments

- `header_range`
- `data_range`
- `filter_value`

### Formula

```excel
=IFERROR(
  LET(
    calling_row, ROW(),
    calling_col, COLUMN(),
    left_cell_val, IFERROR(TRIM(INDIRECT(ADDRESS(calling_row, calling_col - 1))), ""),
    above_cell_val, IFERROR(TRIM(INDIRECT(ADDRESS(calling_row - 1, calling_col))), ""),
    two_up_cell_val, IFERROR(TRIM(INDIRECT(ADDRESS(calling_row - 2, calling_col))), ""),
    target_header_raw,
      TRIM(
        IFS(
          left_cell_val <> "", left_cell_val,
          two_up_cell_val = "Comments", "Verification",
          above_cell_val <> "", above_cell_val,
          TRUE, ""
        )
      ),
    target_header_for_match,
      IFS(
        target_header_raw = "Verification", "Verification",
        target_header_raw = "Less: Expenses", "Expenses",
        target_header_raw = "Constr. Type", "Construction",
        target_header_raw = "Less: Vacancy", "Vacancy",
        target_header_raw = "Type", "Property Type",
        target_header_raw = "Age", "Effective Age",
        target_header_raw = "Land Size", "Land Size (AC)",
        target_header_raw = "Land / Bld", "Land / Bld Ratio",
        target_header_raw = "Land Value / AC", "Excess Land Value / AC",
        target_header_raw = "Bld Size (SF)", "Building Size (SF)",
        TRUE, target_header_raw
      ),
    filter_lookup_value, filter_value,
    table_headers_raw, header_range,
    table_headers_trimmed, ARRAYFORMULA(TRIM(table_headers_raw)),
    target_col_index, MATCH(target_header_for_match, table_headers_trimmed, 0),
    filter_col_index, MATCH("#", table_headers_trimmed, 0),
    use_type_col_index, MATCH("Use Type", table_headers_trimmed, 0),
    filtered_data, FILTER(
                       data_range,
                       (INDEX(data_range, 0, filter_col_index) = INT(filter_lookup_value)) * ((INDEX(data_range, 0, use_type_col_index) = "Sale") + (INDEX(data_range, 0, use_type_col_index) = "Rental"))
                   ),
    raw_result, IFERROR(INDEX(filtered_data, 1, target_col_index), ""),
    IF(
      raw_result = "",
      "",
      IFS(
        target_header_raw = "Address",
          IFERROR(
            LET(
              comma_position, SEARCH(",", raw_result),
              street_part, LEFT(raw_result, comma_position - 1),
              city_state_zip_part, TRIM(RIGHT(raw_result, LEN(raw_result) - comma_position)),
              street_part & CHAR(10) & city_state_zip_part
            ),
            raw_result
          ),
        target_header_raw = "Date of Sale", TEXT(raw_result, "MMM dd, YYYY"),
        target_header_raw = "Land / Bld Ratio", TEXT(raw_result, "0.00"),
        target_header_raw = "Land / Bld", TEXT(raw_result, "0.00"),
        target_header_raw = "Office %", TEXT(raw_result, "0.0%"),
        target_header_raw = "Overall Cap Rate", TEXT(raw_result, "0.00%"),
        target_header_raw = "Sale Price / SF", TEXT(raw_result, "$#,##0.00"),
        target_header_raw = "Bld Size (SF)", TEXT(raw_result, "#,##0"),
        target_header_raw = "Land Size (SF)", TEXT(raw_result, "#,##0"),
        target_header_raw = "Building Size (SF)", TEXT(raw_result, "#,##0"),
        target_header_raw = "Rentable SF", TEXT(raw_result, "#,##0"),
        target_header_raw = "Age", TEXT(raw_result, "0"),
        target_header_raw = "Effective Age", TEXT(raw_result, "0.0"),
        target_header_raw = "Vacancy %", TEXT(raw_result, "0%"),
        target_header_raw = "Occupancy %", TEXT(raw_result, "0%"),
        target_header_raw = "Zoning", raw_result,
        target_header_raw = "Verification", raw_result,
        target_header_raw = "Land Size", raw_result&" AC",
        target_header_raw = "Renovation Cost", TEXT(raw_result, "$#,##0"),
        target_header_raw = "Less: Expenses", "-"&TEXT(raw_result, "$#,##0.00"),
        target_header_raw = "Less: Vacancy", "-"&TEXT(raw_result, "$#,##0.00"),
        target_header_raw = "Effective Gross Income", TEXT(raw_result, "$#,##0.00"),
        target_header_raw = "Net Operating Income", TEXT(raw_result, "$#,##0.00"),
        TRUE, raw_result
      )
    )
  ),
  "" )
```

---

## `GET_ELAPSED_TIME`

**Description:** get the elapsed time in years between 2 dates

### Arguments

- `date_1`
- `date_2`

### Formula

```excel
=IF(OR(ISBLANK(date_1), ISBLANK(date_2)), 0, IFERROR(ROUND(YEARFRAC(date_1, date_2, 1), 2), 0))
```

---

## `GET_SUBJECT_IMPROVEMENT`

**Description:** get the subject improvement based on label in first column

### Arguments

- `headers`
- `data_range`

### Formula

```excel
=IFERROR(
  LET(
    lookup_label_raw, INDIRECT("A" & ROW()),
    lookup_label, IFS(
      lookup_label_raw = "Gross Building Area (GBA)", "Building Size (SF)",
      TRUE, lookup_label_raw
    ),
    return_col_index, MATCH(lookup_label, headers, 0),
    filter_col_index, MATCH("Type", headers, 0),
    return_column, INDEX(data_range, 0, return_col_index),
    filter_column, INDEX(data_range, 0, filter_col_index),
    raw_result, FILTER(return_column, filter_column = "Improvements"),
    IF(
      raw_result = "",
      "",
      IFS(
        lookup_label_raw = "Date of Sale", TEXT(raw_result, "MMM d, yyyy"),
        lookup_label_raw = "Lease Start", TEXT(raw_result, "MMM d, yyyy"),
        lookup_label_raw = "Land / Bld Ratio", TEXT(raw_result, "0.00"),
        lookup_label_raw = "Floor Area Ratio", TEXT(raw_result, "0.00"),
        lookup_label_raw = "Parking Ratio", TEXT(raw_result, "0.00") & " (per 1,000 SF GBA)",
        lookup_label_raw = "Land / Bld Ratio (Adj)", TEXT(raw_result, "0.00"),
        lookup_label_raw = "Office %", TEXT(raw_result, "0.0%"),
        lookup_label_raw = "Overall Cap Rate", TEXT(raw_result, "0.00%"),
        lookup_label_raw = "Sale Price / SF", TEXT(raw_result, "$#,##0.00"),
        lookup_label_raw = "Sale Price / SF (Adj)", TEXT(raw_result, "$#,##0.00"),
        lookup_label_raw = "Annual Rent / SF", TEXT(raw_result, "$#,##0.00"),
        lookup_label_raw = "Post Sale Renovation Cost", TEXT(raw_result, "$#,##0"),
        lookup_label_raw = "Building Size (SF)", TEXT(raw_result, "#,##0"),
        lookup_label_raw = "Gross Building Area (GBA)", TEXT(raw_result, "#,##0") & " SF",
        lookup_label_raw = "Rentable SF", TEXT(raw_result, "#,##0"),
        lookup_label_raw = "Parking (SF)", TEXT(raw_result, "#,##0"),
        lookup_label_raw = "Land Size (SF)", TEXT(raw_result, "#,##0.00"),
        lookup_label_raw = "Land Size (AC)", TEXT(raw_result, "#,##0.000"),
        lookup_label_raw = "Age", TEXT(raw_result, "0"),
        lookup_label_raw = "Effective Age", TEXT(raw_result, "0.0"),
        TRUE, raw_result
      )
    )
  )
)
```

---

## `GET_SUMMARY_DATA`

**Description:** _(None provided)_

### Arguments

- `header_range`
- `data_range`

### Formula

```excel
=IFERROR(
  LET(
    calling_row, ROW(),
    calling_col, COLUMN(),
    target_header_raw_initial, TRIM(INDIRECT(ADDRESS(calling_row, 1))),
    target_header_for_match_initial, IF(target_header_raw_initial = "Age", "Effective Age", target_header_raw_initial),

    row1_cell_value, INDIRECT(ADDRESS(1, calling_col)),
    is_subject_case, ISNUMBER(SEARCH("Subj", row1_cell_value)),
    table_headers_raw, header_range,
    table_headers_trimmed, ARRAYFORMULA(TRIM(table_headers_raw)),
    target_col_index, MATCH(target_header_for_match_initial, table_headers_trimmed, 0),

    temp_raw_result, IF(
      is_subject_case,
      IFS(
        target_header_raw_initial = "Address",
          LET(
            subj_col_index, MATCH("AddressLabel", table_headers_trimmed, 0),
            IFERROR(INDEX(data_range, 1, subj_col_index), "")
          ),
        target_header_raw_initial = "Rentable SF",
          LET(
            subj_col_index, MATCH("Building Size (SF)", table_headers_trimmed, 0),
            IFERROR(INDEX(data_range, 1, subj_col_index), "")
          ),
        target_header_raw_initial = "Hwy Frontage",
          LET(
            subj_col_index, MATCH("Highway Frontage", table_headers_trimmed, 0),
            IFERROR(INDEX(data_range, 1, subj_col_index), "")
          ),
        target_header_raw_initial = "Land / Bld Ratio (Adj)",
          LET(
            subj_col_index, MATCH("Land / Bld Ratio", table_headers_trimmed, 0),
            IFERROR(INDEX(data_range, 1, subj_col_index), "")
          ),
        target_header_raw_initial = "Age",
          LET(
            subj_col_index, MATCH("Effective Age", table_headers_trimmed, 0),
            IFERROR(INDEX(data_range, 1, subj_col_index), "")
          ),
        TRUE,
          IFERROR(INDEX(data_range, 1, target_col_index), "")
      ),
      LET(
        filter_lookup_value, INT(row1_cell_value),
        filter_column_header_name, "#",
        filter_col_index, MATCH(filter_column_header_name, table_headers_trimmed, 0),
        use_type_col_index, MATCH("Use Type", table_headers_trimmed, 0),
        filtered_data, FILTER(data_range, (INDEX(data_range, 0, filter_col_index) = filter_lookup_value) * ((INDEX(data_range, 0, use_type_col_index) = "Sale") + (INDEX(data_range, 0, use_type_col_index) = "Rental"))),
        IF(
          AND(
            target_header_raw_initial = "Hoisting",
            ISNUMBER(MATCH("Hoisting Crane Present", table_headers_trimmed, 0))
          ),
          LET(
            hcp_col_index, MATCH("Hoisting Crane Present", table_headers_trimmed, 0),
            hcp_value, IFERROR(INDEX(filtered_data, 1, hcp_col_index), ""),
            initial_hoisting_value, IFERROR(INDEX(filtered_data, 1, target_col_index), ""),
            IF(hcp_value = "No", "None", initial_hoisting_value)
          ),
          IFERROR(INDEX(filtered_data, 1, target_col_index), "")
        )
      )
    ),

    target_header_raw, IF(
      AND(
        target_header_raw_initial = "Lease Start",
        OR(temp_raw_result = "", NOT(ISNUMBER(temp_raw_result)))
      ),
      "Lease Status",
      target_header_raw_initial
    ),

    raw_result, IF(
      target_header_raw = "Lease Status",
      "Letter of Intent",
      temp_raw_result
    ),

    IF(
      raw_result = "",
      "",
      IFS(
        target_header_raw = "Address",
          IFERROR(
            SUBSTITUTE(
              LEFT(raw_result, SEARCH(",", raw_result, SEARCH(",", raw_result) + 1) - 1),
              ",", "", 1
            ),
            raw_result
          ),
        target_header_raw = "Date of Sale", TEXT(raw_result, "MMM YYYY"),
        target_header_raw = "Lease Start", TEXT(raw_result, "MMM YYYY"),
        target_header_raw = "Lease Status", raw_result,
        target_header_raw = "Land / Bld Ratio", TEXT(raw_result, "0.00"),
        target_header_raw = "Land / Bld Ratio (Adj)", TEXT(raw_result, "0.00"),
        target_header_raw = "Land Size (AC)", TEXT(raw_result, "0.00"),
        target_header_raw = "Office %", TEXT(raw_result, "0.0%"),
        target_header_raw = "Occupancy %", TEXT(raw_result, "0%"),
        target_header_raw = "Overall Cap Rate", TEXT(raw_result, "0.00%"),
        target_header_raw = "Sale Price / SF", TEXT(raw_result, "$#,##0.00"),
        target_header_raw = "Sale Price / SF (Adj)", TEXT(raw_result, "$#,##0.00"),
        target_header_raw = "Sale Price / AC", TEXT(raw_result, "$#,##0"),
        target_header_raw = "Rent / SF / Year", TEXT(raw_result, "$#,##0.00"),
        target_header_raw = "Building Size (SF)", TEXT(raw_result, "#,##0"),
        target_header_raw = "Parking (SF)", TEXT(raw_result, "#,##0"),
        target_header_raw = "Rentable SF", TEXT(raw_result, "#,##0"),
        target_header_raw = "Age", TEXT(raw_result, "0"),
        target_header_raw = "Effective Age", TEXT(raw_result, "0.0"),
        TRUE, raw_result
      )
    )
  ),
"")
```

---

## `GET_VERIFICATION_VAL`

**Description:** format the verification text by combining verification type and verified by

### Arguments

- `type`
- `by`
- `mlsnumber`

### Formula

```excel
=IF(AND(ISBLANK(type), ISBLANK(by)), "",
  IF(AND(type="Other", NOT(ISBLANK(by))),
    "Verified by "&by,
    "Verified by "&type&
    IF(ISBLANK(by),
      IF(NOT(ISBLANK(mlsNumber)), " (MLS #"&mlsNumber&")", ""),
      " ("&by&
        IF(NOT(ISBLANK(mlsNumber)), ", MLS #"&mlsNumber, "")
      &")"
    )
  )
)
```

---

## `GET_ZONE_VAL`

**Description:** format the zoning text by combining zone location and description

### Arguments

- `location`
- `desc`

### Formula

```excel
=IF(AND(ISBLANK(location), ISBLANK(desc)), "",
  IF(AND(location <> "Inside City Limits", ISBLANK(desc)),
    "None (" & location & ")",
    IF(AND(location = "Inside City Limits", NOT(ISBLANK(desc)), desc <> "None"),
      desc,
      IF(desc = "None",
        "None (Inside City Limits)",
        desc & " (" & location & ")"
      )
    )
  )
)
```

---

## `INDENT`

**Description:** add a tab to the text to indent

### Arguments

- `text`

### Formula

```excel
=CONCATENATE("         " & text)
```

---

## `SUM_ADJUSTMENT_PERCENTS`

**Description:** _(None provided)_

### Arguments

- `start_row`

### Formula

```excel
=LET(
  range,
  INDIRECT(ADDRESS(start_row, COLUMN()) & ":" & ADDRESS(ROW() - 1, COLUMN())),
  IFERROR(
    SUM(
      FILTER(
        range,
        IF(ISODD(start_row), ISODD(ROW(range)), ISEVEN(ROW(range)))
      )
    ),
    0
  )
)
```

---

## `SUM_ADJUSTMENT_PERCENTS_2`

**Description:** _(None provided)_

### Arguments

- `first_section_start`
- `second_section_start`

### Formula

```excel
=LET(
  first_section_abs_start, first_section_start,
  second_section_abs_start, second_section_start,
  range1, INDIRECT(ADDRESS(first_section_abs_start, COLUMN()) & ":" & ADDRESS(second_section_abs_start - 3, COLUMN())),
  range2, INDIRECT(ADDRESS(second_section_abs_start, COLUMN()) & ":" & ADDRESS(ROW() - 1, COLUMN())),
  val1_calculated, SUM(ARRAYFORMULA(IF(MOD(SEQUENCE(ROWS(range1)) - 1, 3) = 0, range1, ""))),
  val2_calculated, IFERROR(SUM(FILTER(range2, IF(ISODD(second_section_abs_start), ISODD(ROW(range2)), ISEVEN(ROW(range2))))), 0),
  SUM(val1_calculated, val2_calculated)
)
```
