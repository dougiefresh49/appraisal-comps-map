# Photo Management App Setup Guide

## Quick Start

1. **Environment Variables**
   Create a `.env.local` file in the root directory with:

   ```bash
   # n8n Webhook URLs (required for Google Drive access)
   N8N_INPUT_WEBHOOK_URL=https://your-n8n-instance.com/webhook/fetch-photos-with-webviewurls
   N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/save-changes

   # Existing Google Maps variables (if using maps features)
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
   NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=your_google_maps_map_id
   ```

2. **n8n Workflow Setup**
   Create two webhook endpoints in n8n:
   - **Fetch Photos with WebViewUrls**: Returns an array with two objects:
     - `{ photos: [...] }` - Google Drive file data with `webViewLink`
     - `{ inputs: [...] }` - Labels from `input.json`
   - **Save Changes**: Updates the `input.json` file with new data

3. **Expected n8n Response Format**
   Your n8n workflow should return:

   ```json
   [
     {
       "data": [
         {
           "photos": [
             {
               "kind": "drive#file",
               "id": "1ZhQzTTkC1f1p-NspOl149HolEqJglozZ",
               "name": "PXL_20250822_172142122.jpg",
               "mimeType": "image/jpeg",
               "webViewLink": "https://drive.google.com/file/d/1ZhQzTTkC1f1p-NspOl149HolEqJglozZ/view?usp=drivesdk"
             }
           ]
         },
         {
           "inputs": [
             {
               "image": "PXL_20250822_172142122.jpg",
               "label": "Conference Room"
             }
           ]
         }
       ]
     }
   ]
   ```

4. **Run the App**
   ```bash
   pnpm dev
   ```
   Navigate to `http://localhost:3000/photos`

## Features Implemented

✅ **Photo Grid Display**: 2-column responsive layout  
✅ **Drag & Drop Reordering**: Using @dnd-kit/sortable  
✅ **Inline Label Editing**: Click "Edit" on any photo label  
✅ **Google Drive Integration**: Fetch photos and input.json  
✅ **Save Functionality**: Via n8n webhook or manual JSON export  
✅ **Error Handling**: Graceful fallbacks and user feedback  
✅ **TypeScript**: Full type safety with Zod validation  
✅ **Responsive Design**: Mobile-first approach with Tailwind CSS

## File Structure

```
src/
├── app/
│   ├── api/photos/
│   │   └── route.ts          # API endpoints for photo operations
│   └── photos/
│       └── page.tsx          # Main photo management page
├── components/
│   └── PhotoCard.tsx         # Individual photo card with drag & edit
├── server/
│   └── photos/
│       └── actions.ts         # Server-side Google Drive operations
└── env.js                    # Environment variable configuration
```

## Usage

1. **Load Photos**: App automatically fetches from Google Drive
2. **Reorder**: Drag and drop photos to change order
3. **Edit Labels**: Click "Edit" on any photo label
4. **Save Changes**: Click "Save Changes" button
5. **Manual Update**: If n8n isn't configured, copy the JSON and update manually

## Technical Notes

- Uses Next.js 15 App Router with Server Components
- Implements proper separation of client/server code
- Handles Google Drive API errors gracefully
- Provides fallback to sample data for development
- Supports both automatic (n8n) and manual saving workflows

## Troubleshooting

- **Photos not loading**: Check Google Drive API key and folder ID
- **Build errors**: The app builds successfully for the photo management feature
- **Drag & drop issues**: Ensure @dnd-kit packages are installed
- **Save problems**: Check n8n webhook URL or use manual JSON export
