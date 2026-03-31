const SHARED_INSTRUCTIONS = `Return a JSON object with two top-level keys:
1. "extracted_text" — a concise plain-text summary of the document suitable for use as AI context in a commercial appraisal report.
2. "structured_data" — an object containing the specific fields listed below.

Only return the JSON object, nothing else.`;

const PROMPTS: Record<string, string> = {
  deed: `You are analyzing a deed record for a commercial real estate appraisal. Focus on extracting sale/ownership details. Do NOT use this document for the legal description -- the CAD record is the authoritative source for that.

${SHARED_INSTRUCTIONS}

Fields for "structured_data":
- "grantor": name(s) of the grantor / seller
- "grantee": name(s) of the grantee / buyer
- "instrument_number": the recording / instrument number
- "recording_date": the date the deed was recorded
- "consideration": the dollar amount or stated consideration (e.g., "$300,000" or "Ten and No/100 Dollars ($10.00) and other good and valuable consideration")
- "loan_amount": if a vendor's lien or deed of trust amount is mentioned, the loan principal
- "property_address": the street address if mentioned
- "deed_type": the type of deed (warranty deed, warranty deed with vendor's lien, special warranty, quitclaim, etc.)
- "county": the county where the property is located
- "ownership_summary": a 2-3 sentence summary suitable for an ownership analysis section (who sold to whom, when, for how much, deed type, any liens or conditions)`,

  flood_map: `You are analyzing a FEMA flood map or flood determination document for a commercial real estate appraisal.

${SHARED_INSTRUCTIONS}

Fields for "structured_data":
- "flood_zone": the flood zone designation (e.g., Zone X, Zone AE)
- "fema_map_number": the FIRM panel number
- "map_effective_date": the effective date of the flood map
- "community_number": the NFIP community number
- "in_special_flood_hazard_area": boolean indicating if the property is in an SFHA
- "base_flood_elevation": the BFE if available`,

  cad: `You are analyzing a County Appraisal District (CAD) tax record or property card for a commercial real estate appraisal.

${SHARED_INSTRUCTIONS}

Fields for "structured_data":
- "property_id": the CAD property ID or account number
- "legal_description": the EXACT legal description from the tax record -- copy it verbatim, do NOT summarize or paraphrase
- "property_address": the property street address
- "city": the city
- "county": the county name
- "assessed_land_value": the assessed value of the land
- "assessed_improvement_value": the assessed value of improvements
- "total_assessed_value": total assessed value
- "lot_dimensions": lot size or dimensions
- "lot_area_sqft": lot area in square feet if available
- "lot_area_acres": lot area in acres if available
- "year_built": year the improvements were built
- "building_size_sf": total building size in square feet
- "construction_type": construction type (e.g., "Metal", "Concrete", "Wood Frame")
- "condition": overall condition rating
- "zoning": zoning designation if shown
- "property_class": the property classification
- "owner_name": the property owner name
- "improvements": array of objects for each improvement listed, each with { "description": string, "year_built": number, "area_sf": number, "condition": string }`,

  zoning_map: `You are analyzing a zoning map or GIS screenshot for a commercial real estate appraisal. Describe the zoning of the subject property and surrounding areas.

${SHARED_INSTRUCTIONS}

Fields for "structured_data":
- "subject_zoning_code": the zoning code/designation of the subject property
- "subject_zoning_description": brief description of what the subject's zoning permits
- "surrounding_north": zoning to the north
- "surrounding_south": zoning to the south
- "surrounding_east": zoning to the east
- "surrounding_west": zoning to the west
- "zoning_transitions": any notable transitions or boundaries between zones`,

  neighborhood_map: `You are analyzing a neighborhood map screenshot created for a commercial real estate appraisal. Describe the boundaries, landmarks, and general character of the neighborhood.

${SHARED_INSTRUCTIONS}

Fields for "structured_data":
- "north_boundary": the northern boundary street or landmark
- "south_boundary": the southern boundary street or landmark
- "east_boundary": the eastern boundary street or landmark
- "west_boundary": the western boundary street or landmark
- "major_roads": list of major roads visible
- "landmarks": notable landmarks, schools, parks, or commercial areas visible
- "general_character": residential, commercial, industrial, mixed-use, etc.`,

  location_map: `You are analyzing a subject location map screenshot created for a commercial real estate appraisal. Describe the subject's position relative to surrounding streets and landmarks.

${SHARED_INSTRUCTIONS}

Fields for "structured_data":
- "subject_position": description of where the subject is on the map
- "nearest_intersection": the closest intersection
- "surrounding_streets": list of visible street names
- "nearby_landmarks": any visible landmarks, businesses, or features
- "access_points": how the property is accessed from major roads`,

  engagement: `You are analyzing an engagement letter or scope of work document for a commercial real estate appraisal.

${SHARED_INSTRUCTIONS}

Fields for "structured_data":
- "client_name": the name of the client
- "engagement_date": the date of the engagement
- "property_address": the address of the property being appraised
- "property_type": the type of property (commercial, industrial, vacant land, etc.)
- "scope_of_work": summary of the appraisal scope
- "intended_use": the intended use of the appraisal
- "effective_date": the effective date of the appraisal if specified`,

  notes: `You are analyzing field notes or observation notes for a commercial real estate appraisal of a subject property. These notes contain critical details observed during the property inspection.

${SHARED_INSTRUCTIONS}

Fields for "structured_data":
- "property_address": the full street address of the subject property
- "city": the city name
- "state": the state abbreviation (e.g., "TX")
- "zip": the ZIP code
- "county": the county name
- "client_name": the client or owner name
- "client_company": the client's company name
- "purchase_price": the price the property was purchased for
- "purchase_date": the date of purchase
- "deed_number": the deed or instrument number
- "loan_amount": the loan amount if mentioned
- "land_size_ac": total land size in acres
- "land_size_sf": total land size in square feet
- "zoning": zoning designation
- "zoning_area": zoning area (e.g., "Inside ETJ", "Inside City")
- "year_built": year the main improvement was built
- "building_size_sf": total building size in square feet
- "construction": construction type (e.g., "Metal", "Steel Beam Frame")
- "condition": overall condition (e.g., "Good", "Average", "Fair", "Poor")
- "buildings": array of objects, one per building/structure observed. Each object should have: { "name": string, "size_sf": number, "dimensions": string, "year_built": number, "condition": string, "construction": string, "features": string[] }
- "site_improvements": description of site improvements (fencing, gates, paving, wells, septic, etc.)
- "utilities_electricity": "Yes", "No", or details
- "utilities_water": water source (e.g., "Public", "Well", "Public & Well")
- "utilities_sewer": sewer type (e.g., "Public", "Septic", "None")
- "overhead_doors": description of overhead doors with dimensions
- "hoisting": any crane/hoist equipment
- "corner_lot": boolean
- "highway_frontage": boolean
- "other_features": any other notable features or observations
- "issues": any problems, incomplete construction, code violations, or deficiencies noted`,

  sketch: `You are analyzing a building sketch, floor plan, or site plan for a commercial real estate appraisal. Extract all dimensions, area calculations, and building identification.

${SHARED_INSTRUCTIONS}

Fields for "structured_data":
- "buildings": array of objects for each building/structure shown. Each should have: { "name": string (e.g., "Warehouse 1", "Office", "Canopy"), "type": string (e.g., "living_area", "non_living_area"), "area_sf": number, "dimensions": string (e.g., "75x40"), "stories": number }
- "total_living_area_sf": total living/heated area in square feet
- "total_non_living_area_sf": total non-living area (canopies, porches, sheds) in square feet
- "total_area_sf": combined total area
- "area_calculation_details": array of strings showing individual area calculations (e.g., "Warehouse 1: 75 x 40 = 3000")
- "site_dimensions": any lot or site dimensions shown
- "scale": the drawing scale if noted
- "notes": any text notes or annotations visible on the sketch`,

  other: `You are analyzing a document related to a commercial real estate appraisal. Extract all relevant information.

${SHARED_INSTRUCTIONS}

Fields for "structured_data":
- "document_type": your best guess at what type of document this is
- "key_dates": any important dates found
- "key_names": any important names (people, companies, entities)
- "key_values": any monetary values or measurements
- "summary": a brief summary of the document's purpose and content`,
};

/**
 * Returns the Gemini extraction prompt for a given document type.
 */
export function getExtractionPrompt(documentType: string): string {
  return PROMPTS[documentType] ?? PROMPTS.other!;
}
