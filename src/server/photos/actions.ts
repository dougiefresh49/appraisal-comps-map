import "server-only";
import { z } from "zod";
import { env } from "~/env";

// Schema for Google Drive file data
const GoogleDriveFileSchema = z.object({
  kind: z.string(),
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  webViewLink: z.string(),
});

// Schema for input data (labels)
const InputSchema = z.object({
  image: z.string(),
  label: z.string(),
  link: z.string(),
});

// Schema for n8n response
const N8nResponseSchema = z.array(
  z.object({
    data: z.array(
      z.union([
        z.object({
          photos: z.array(GoogleDriveFileSchema),
        }),
        z.object({
          inputs: z.array(InputSchema),
        }),
      ]),
    ),
  }),
);

// Schema for photo input data with webViewUrl (final merged format)
export const PhotoInputSchema = z.object({
  image: z.string(),
  label: z.string(),
  webViewUrl: z.string(),
  fallbackUrl: z.string().optional(),
});

export const PhotoInputsSchema = z.array(PhotoInputSchema);

export type PhotoInput = z.infer<typeof PhotoInputSchema>;
export type PhotoInputs = z.infer<typeof PhotoInputsSchema>;

// Google Drive API configuration
const GOOGLE_DRIVE_FOLDER_ID = "1LkTB06z67OIzas4JyAzIChnR_O4pzfzm";
const GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

// Debug function to list all files in the folder
export async function listAllFilesInFolder(): Promise<any> {
  try {
    // Try different query approaches
    const queries = [
      `'${GOOGLE_DRIVE_FOLDER_ID}' in parents`,
      `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed=false`,
      `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType!='application/vnd.google-apps.folder'`,
    ];

    for (const query of queries) {
      console.log(`Trying query: ${query}`);
      const response = await fetch(
        `${GOOGLE_DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&key=${env.GOOGLE_DRIVE_API_KEY}`,
      );

      if (!response.ok) {
        console.log(`Query failed: ${query} - ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      console.log(`Query result for "${query}":`, data);

      if (data.files && data.files.length > 0) {
        return data;
      }
    }

    // If all queries return empty, return the last result
    const response = await fetch(
      `${GOOGLE_DRIVE_API_BASE}/files?q='${GOOGLE_DRIVE_FOLDER_ID}' in parents&key=${env.GOOGLE_DRIVE_API_KEY}`,
    );

    const data = await response.json();
    console.log("All files in folder:", data);
    return data;
  } catch (error) {
    console.error("Error listing files:", error);
    throw error;
  }
}

// Fetch input.json from Google Drive via n8n webhook
export async function fetchInputsJson(): Promise<{
  photos: PhotoInputs;
  fileId: string;
}> {
  try {
    console.log("🔍 Starting fetchInputsJson...");

    // Use n8n webhook to fetch photos and inputs
    if (env.N8N_INPUT_WEBHOOK_URL) {
      console.log("📡 Calling n8n webhook:", env.N8N_INPUT_WEBHOOK_URL);

      const response = await fetch(env.N8N_INPUT_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          folderId: GOOGLE_DRIVE_FOLDER_ID,
        }),
      });

      console.log("📥 Response status:", response.status);
      console.log("📥 Response ok:", response.ok);

      if (response.ok) {
        console.log(
          "📥 Response headers:",
          Object.fromEntries(response.headers.entries()),
        );
        console.log("📥 Response status:", response.status);

        const responseText = await response.text();
        console.log("📦 Raw response text:", responseText);

        if (!responseText.trim()) {
          console.error("❌ Empty response from n8n webhook");
          throw new Error("Empty response from n8n webhook");
        }

        const result = JSON.parse(responseText);
        // console.log("📦 Raw n8n response:", JSON.stringify(result, null, 2));

        // Extract photos and inputs from the response without Zod validation
        let photos: Array<{
          kind: string;
          id: string;
          name: string;
          mimeType: string;
          webViewLink: string;
        }> = [];
        let inputs: Array<{ image: string; label: string; link: string }> = [];

        // Parse the simplified n8n response structure
        let fileId = "unknown";
        if (Array.isArray(result) && result[0]) {
          const data = result[0];
          const inputs = data.inputs || [];
          fileId = data.inputFileId || "unknown";

          console.log("🏷️ Found inputs:", inputs.length);
          console.log("📄 File ID:", fileId);
        }

        console.log("🏷️ Inputs sample:", inputs.slice(0, 2));

        // Convert inputs to PhotoInputs format (n8n already did the mapping)
        const mergedPhotos: PhotoInputs = inputs.map((input) => {
          const merged = {
            image: input.image,
            label: input.label,
            webViewUrl: input.link,
          };
          console.log(`🔗 Input: ${input.image} -> "${input.label}"`);
          console.log(`🖼️ Image URL: ${input.link}`);
          return merged;
        });

        console.log("🎯 Final merged photos count:", mergedPhotos.length);
        console.log("🎯 Final merged photos sample:", mergedPhotos.slice(0, 2));

        return { photos: mergedPhotos, fileId };
      } else {
        console.error(
          "❌ n8n response not ok:",
          response.status,
          response.statusText,
        );
      }
    } else {
      console.log(
        "⚠️ No N8N_INPUT_WEBHOOK_URL configured, using fallback data",
      );
    }

    console.log("🔄 Using fallback data...");

    // Fallback to sample data for development
    return {
      photos: [
        {
          image: "PXL_20250822_172142122.jpg",
          label: "Conference Room",
          webViewUrl:
            "https://via.placeholder.com/300x200?text=Conference+Room",
        },
        {
          image: "PXL_20250822_172054088.jpg",
          label: "Restroom",
          webViewUrl: "https://via.placeholder.com/300x200?text=Restroom",
        },
        {
          image: "PXL_20250822_163215061.jpg",
          label: "Excess Land",
          webViewUrl: "https://via.placeholder.com/300x200?text=Excess+Land",
        },
        {
          image: "PXL_20250822_164647504.jpg",
          label: "Subject Left",
          webViewUrl: "https://via.placeholder.com/300x200?text=Subject+Left",
        },
        {
          image: "PXL_20250822_170028786.jpg",
          label: "Break Room",
          webViewUrl: "https://via.placeholder.com/300x200?text=Break+Room",
        },
        {
          image: "PXL_20250822_164948298.MP.jpg",
          label: "Electrical Disconnect",
          webViewUrl:
            "https://via.placeholder.com/300x200?text=Electrical+Disconnect",
        },
        {
          image: "PXL_20250822_171909686.jpg",
          label: "Reception Desk",
          webViewUrl: "https://via.placeholder.com/300x200?text=Reception+Desk",
        },
        {
          image: "PXL_20250822_163158766.jpg",
          label: "Improved Yard",
          webViewUrl: "https://via.placeholder.com/300x200?text=Improved+Yard",
        },
        {
          image: "PXL_20250822_161507632.jpg",
          label: "Subject Front",
          webViewUrl: "https://via.placeholder.com/300x200?text=Subject+Front",
        },
      ],
      fileId: "fallback-file-id",
    };
  } catch (error) {
    console.error("Error fetching input.json:", error);
    // Fallback to sample data for development
    return {
      photos: [
        {
          image: "PXL_20250822_172142122.jpg",
          label: "Conference Room",
          webViewUrl:
            "https://via.placeholder.com/300x200?text=Conference+Room",
        },
        {
          image: "PXL_20250822_172054088.jpg",
          label: "Restroom",
          webViewUrl: "https://via.placeholder.com/300x200?text=Restroom",
        },
        {
          image: "PXL_20250822_163215061.jpg",
          label: "Excess Land",
          webViewUrl: "https://via.placeholder.com/300x200?text=Excess+Land",
        },
        {
          image: "PXL_20250822_164647504.jpg",
          label: "Subject Left",
          webViewUrl: "https://via.placeholder.com/300x200?text=Subject+Left",
        },
        {
          image: "PXL_20250822_170028786.jpg",
          label: "Break Room",
          webViewUrl: "https://via.placeholder.com/300x200?text=Break+Room",
        },
        {
          image: "PXL_20250822_164948298.MP.jpg",
          label: "Electrical Disconnect",
          webViewUrl:
            "https://via.placeholder.com/300x200?text=Electrical+Disconnect",
        },
        {
          image: "PXL_20250822_171909686.jpg",
          label: "Reception Desk",
          webViewUrl: "https://via.placeholder.com/300x200?text=Reception+Desk",
        },
        {
          image: "PXL_20250822_163158766.jpg",
          label: "Improved Yard",
          webViewUrl: "https://via.placeholder.com/300x200?text=Improved+Yard",
        },
        {
          image: "PXL_20250822_161507632.jpg",
          label: "Subject Front",
          webViewUrl: "https://via.placeholder.com/300x200?text=Subject+Front",
        },
      ],
      fileId: "fallback-file-id",
    };
  }
}

// Save changes back to Google Drive via n8n webhook or return JSON for manual update
export async function saveChanges(
  updatedPhotos: PhotoInputs,
  fileId?: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    // Option 1: Try to save via n8n webhook if configured
    if (env.N8N_WEBHOOK_URL) {
      const response = await fetch(env.N8N_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          photos: updatedPhotos,
          folderId: GOOGLE_DRIVE_FOLDER_ID,
          fileId: fileId || "unknown",
        }),
      });

      if (response.ok) {
        return { success: true };
      }
    }

    // Option 2: Return JSON for manual update
    const jsonData = JSON.stringify(updatedPhotos, null, 2);
    return {
      success: true,
      data: jsonData,
      error: "Please manually update input.json with the provided data",
    };
  } catch (error) {
    console.error("Error saving changes:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
