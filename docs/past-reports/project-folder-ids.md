# Past Report Data Details

## Past Reports Google Drive Data

As a table

| Report PDF                               | Project Name                | Folder Name                     | Google Drive Folder ID              |
| ---------------------------------------- | --------------------------- | ------------------------------- | ----------------------------------- |
| 6310 Tashaya Dr Odessa Report.pdf        | 6310 Tashaya Dr Odessa      | 341 Tammy & 6310 Tashaya Odessa | 1sCYiOv0d09VLQpxI_xa11EIxiabVzUHh   |
| GCC Permian Land Report.pdf              | GCC Permian Land            | GCC Permian Land                | 1N5_7ynYjf9CqgEqHHgOcLRB55o7uWJqz   |
| 210 W 57th Odessa Report.pdf             | 210 W 57th Odessa           | 210 W 57TH ST                   | 1yOWw4JO0bpzYsBfU9IVRV54V4RwGrlWQ   |
| 103 East Ave Kermit Appraisal Report.pdf | 103 East Ave Kermit         | 103 East Ave Kermit             | 1dFbxWahtis5CYUnR0SvSLKKZUs1vbqG9   |
| 360 SE Loop 338 Odessa Report.pdf        | 360 SE Loop 338 Odessa      | 360 SE Loop 338 Odessa          | 1RtcX3EdcsBZ87KJ0RSyvg9_n50joFehM   |
| 600 W Louisiana Ave Report.pdf           | 600 W Louisiana Ave         | 600 W Louisiana Ave             | 1OBy0PEcDyqMxK4CAlWKplkJlhIXN3Gm8   |
| 1604 S Burleson Ave McCamey Report.pdf   | 1604 S Burleson Ave McCamey | 1604 S Burleson Ave McCamey TX  | 1-PsMbp4u-j\_\_hEde--3SEu6vrq-6f5H8 |
| Apprisal Report for 1227 S Murphy.pdf    | 1227 S Murphy               | 1227 S Murphy                   | 10JEUI0alWqrVDSsiE9ZPXDBm7qiWJGIr   |
| 2508 N Big Spring St Report.pdf          | 2508 N Big Spring St        | 2508 N Big Spring St            | 1bLKTjzq6ZtuSa4V0wV5Hz1tc19-QNlsb   |
| 405 N Terrell St Report - corrected.pdf  | 405 N Terrell St            | 405 N Terrell St                | 13ZJkiGTrr1qhwl5ruvVB8Rtprv-\_Y9kk  |
| 1409 Connell St Report.pdf               | 1409 Connell St             | 1409 Connell St, Midland        | 1lMUeJLoGejFuoFsJZW_ZEEV249hsdiaR   |

As JSON

```json
[
  {
    "Report PDF": "6310 Tashaya Dr Odessa Report.pdf",
    "Project Name": "6310 Tashaya Dr Odessa",
    "Folder Name": "341 Tammy & 6310 Tashaya Odessa",
    "Google Drive Folder ID": "1sCYiOv0d09VLQpxI_xa11EIxiabVzUHh"
  },
  {
    "Report PDF": "GCC Permian Land Report.pdf",
    "Project Name": "GCC Permian Land",
    "Folder Name": "GCC Permian Land",
    "Google Drive Folder ID": "1N5_7ynYjf9CqgEqHHgOcLRB55o7uWJqz"
  },
  {
    "Report PDF": "210 W 57th Odessa Report.pdf",
    "Project Name": "210 W 57th Odessa",
    "Folder Name": "210 W 57TH ST",
    "Google Drive Folder ID": "1yOWw4JO0bpzYsBfU9IVRV54V4RwGrlWQ"
  },
  {
    "Report PDF": "103 East Ave Kermit Appraisal Report.pdf",
    "Project Name": "103 East Ave Kermit",
    "Folder Name": "103 East Ave Kermit",
    "Google Drive Folder ID": "1dFbxWahtis5CYUnR0SvSLKKZUs1vbqG9"
  },
  {
    "Report PDF": "360 SE Loop 338 Odessa Report.pdf",
    "Project Name": "360 SE Loop 338 Odessa",
    "Folder Name": "360 SE Loop 338 Odessa",
    "Google Drive Folder ID": "1RtcX3EdcsBZ87KJ0RSyvg9_n50joFehM"
  },
  {
    "Report PDF": "600 W Louisiana Ave Report.pdf",
    "Project Name": "600 W Louisiana Ave",
    "Folder Name": "600 W Louisiana Ave",
    "Google Drive Folder ID": "1OBy0PEcDyqMxK4CAlWKplkJlhIXN3Gm8"
  },
  {
    "Report PDF": "1604 S Burleson Ave McCamey Report.pdf",
    "Project Name": "1604 S Burleson Ave McCamey",
    "Folder Name": "1604 S Burleson Ave McCamey TX",
    "Google Drive Folder ID": "1-PsMbp4u-j__hEde--3SEu6vrq-6f5H8"
  },
  {
    "Report PDF": "Apprisal Report for 1227 S Murphy.pdf",
    "Project Name": "1227 S Murphy",
    "Folder Name": "1227 S Murphy",
    "Google Drive Folder ID": "10JEUI0alWqrVDSsiE9ZPXDBm7qiWJGIr"
  },
  {
    "Report PDF": "2508 N Big Spring St Report.pdf",
    "Project Name": "2508 N Big Spring St",
    "Folder Name": "2508 N Big Spring St",
    "Google Drive Folder ID": "1bLKTjzq6ZtuSa4V0wV5Hz1tc19-QNlsb"
  },
  {
    "Report PDF": "405 N Terrell St Report - corrected.pdf",
    "Project Name": "405 N Terrell St",
    "Folder Name": "405 N Terrell St",
    "Google Drive Folder ID": "13ZJkiGTrr1qhwl5ruvVB8Rtprv-_Y9kk"
  },
  {
    "Report PDF": "1409 Connell St Report.pdf",
    "Project Name": "1409 Connell St",
    "Folder Name": "1409 Connell St, Midland",
    "Google Drive Folder ID": "1lMUeJLoGejFuoFsJZW_ZEEV249hsdiaR"
  }
]
```

## n8n Photo Backfill Endpoint

- Endpoint: https://dougiefreshdesigns.app.n8n.cloud/webhook/past-report-photo-backfil
- Method: POST
- Body:

```json
{
  "project_folder_id": "1-PsMbp4u-j__hEde--3SEu6vrq-6f5H8",
  "project_id": "b377f836-eb35-4780-8524-554aad80d9ce"
}
```
