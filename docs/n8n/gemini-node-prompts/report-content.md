# Extra Prompt Data for Gemini Knowledge Gems

## Ownership

```
Addess: {{ $('Merge4').item.json.subject.address }}
Legal Description: {{ $('Merge4').item.json.subject.legalDescription }}
Deed Record of purchase: {{ $('Merge4').item.json.subject.rawData.instrumentNumber }}
Ownership Info: {{ $('Call get ownership context from deed').item.json.ownershipInfo }}

{{ $('Edit Fields').item.json.revisionRequest }}
```

## Zoning

```
Addess: {{ $('Merge4').item.json.subject.address }}
Zoning: {{ $('Merge4').item.json.subject.rawData.Zoning }}

{{ $('Edit Fields').item.json.revisionRequest }}
```

uses the zoning.png - the zoning map

## Neighborhood

```
Addess: {{ $('Merge4').item.json.subject.rawData.AddressLocal }}
Neighborhood Boundaries:
{{ $json.neighborhoodBounds }}

{{ $('Edit Fields').item.json.revisionRequest }}
```

uses the neighborhood.png - the neighborhood map created in the webapp and boundaries are pulled from spreadsheet

## Subject Site Summary

Addess: {{ $('Merge4').item.json.subject.address }}
Ownership Info: {{ $('Call get ownership context from deed').item.json.ownershipInfo }}

FEMA Flood Map info:
{{ $json.femaData }}

Subject full JSON data

```json
{{ JSON.stringify( $('Merge4').item.json.subject.rawData, null, 2 ) }}
```

Subject Improvements

{{ $('Merge4').item.json.subject.improvementsString.split('\n').map(i => (!i.includes(':') ? `**${i}**` : `* ${i}`)).join('\n\n') }}

{{ $('Edit Fields').item.json.revisionRequest }}

## Highest and Best Use

---

Addess: {{ $('Merge4').item.json.subject.rawData.AddressLocal }}
Ownership Info: {{ $('Call get ownership context from deed').item.json.ownershipInfo }}

### Subject full JSON data

```json
{{ JSON.stringify($('Merge4').item.json.subject.rawData , null, 2) }}
```

### Subject Improvements

{{ $('Merge4').item.json.subject.improvementsString.split('\n').map(i => (!i.includes(':') ? `**${i}**` : `* ${i}`)).join('\n\n') }}

### Other Details from the report

#### Zoning

{{ $json.zoning }}

#### Ownership

{{ $json.ownership }}

#### Subject Site Summary

{{ $json['subject-site-summary'] }}

{{ $('Edit Fields').item.json.revisionRequest }}

---

Note: the Zoning, ownership and subject site summary fields in the above `extraPromptDetails` are the conent that was generated from the other gemini calls above

## Get Ownership Context from Deed (Prompt)

Provided the following deed record for the subject property, write a quick summary of the document. Include relevant information such as grantor, grantee, consideration details, recording date, etc. Do not include meets and bounds or anything like that. just a quick summary of the document. Only return the summary as a string of text, nothing else

Subject Details
Addess: {{ $('Start').item.json.subject_address }}
Legal Description: {{ $('Start').item.json.subject_legalDescription }}
Deed Record instrument number: {{ $('Start').item.json.subject_rawData_instrumentNumber }}
