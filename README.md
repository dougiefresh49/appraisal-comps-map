# Appraisal Report Management Tool

A Next.js application for managing commercial appraisal reports, connecting Google drive and n8n

## Features

- 📸 Fetch photos from Google Drive folder
- 📝 Edit photo labels inline
- 🎯 Drag and drop to reorder photos
- 💾 Save changes back to Google Drive (via n8n webhook or manual JSON export)
- 📱 Responsive 2-column grid layout
- ⚡ Optimized with Next.js 15 and React 19

## Setup

### 1. Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```bash
# Google Drive API Key (required for fetching photos)
GOOGLE_DRIVE_API_KEY=your_google_drive_api_key_here

# n8n Webhook URL (optional - for automatic saving)
N8N_WEBHOOK_BASE_URL=https://your-n8n-instance.com/webhook/

# Existing Google Maps variables (if using maps features)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=your_google_maps_map_id
```

### 2. Google Drive API Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API
4. Create credentials (API Key)
5. Add the API key to your `.env.local` file

### 3. Google Drive Folder Structure

Your Google Drive folder should contain:

- `input.json` - Array of photo metadata with image names and labels
- Image files referenced in `input.json`

Example `input.json`:

```json
[
  {
    "image": "PXL_20250822_172142122.jpg",
    "label": "Conference Room"
  },
  {
    "image": "PXL_20250822_172054088.jpg",
    "label": "Restroom"
  }
]
```

### 4. n8n Integration (Optional)

If you want automatic saving back to Google Drive:

1. Set up an n8n workflow with a webhook trigger
2. Configure the workflow to:
   - Receive the updated photo data
   - Update the `input.json` file in Google Drive
   - Handle Google Drive authentication
3. Add the webhook URL to your environment variables

## Usage

1. Navigate to `/photos` in your application
2. Photos will be loaded from your Google Drive folder
3. Drag and drop photos to reorder them
4. Click "Edit" on any photo label to modify it
5. Click "Save Changes" to persist your modifications

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## Technical Details

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Drag & Drop**: @dnd-kit/core and @dnd-kit/sortable
- **Validation**: Zod schema validation
- **Environment**: t3-env for type-safe environment variables

## File Structure

```
src/
├── app/
│   └── photos/
│       └── page.tsx          # Main photo management page
├── components/
│   └── PhotoCard.tsx         # Individual photo card component
├── server/
│   └── photos/
│       └── actions.ts         # Server actions for Google Drive integration
└── env.js                    # Environment variable configuration
```

## Troubleshooting

### Photos not loading

- Check that your Google Drive API key is correct
- Verify the folder ID in `actions.ts` matches your Google Drive folder
- Ensure `input.json` exists in the specified folder

### Drag and drop not working

- Make sure `@dnd-kit/sortable` is installed
- Check browser console for JavaScript errors

### Save functionality not working

- If using n8n, verify the webhook URL is correct
- Check that your n8n workflow is properly configured
- Use the "Copy JSON to Clipboard" option for manual updates
