import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import OpenAI from "openai";
import sharp from "sharp";
import { Storage } from "@google-cloud/storage";
import fs from 'fs';


const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Updated getGCPCredentials function
export const getGCPCredentials = () => {
  if (process.env.VERCEL) {
    // For Vercel, use environment variables
    return process.env.GCP_PRIVATE_KEY
      ? {
          credentials: {
            client_email: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GCP_PRIVATE_KEY.replace(/\\n/g, '\n'),
          },
          projectId: process.env.GCP_PROJECT_ID,
        }
      : {};
  } else {
    // For local development, use GOOGLE_APPLICATION_CREDENTIALS
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath && fs.existsSync(credPath)) {
      return { keyFilename: credPath };
    }
    return {};
  }
};

// Update the Storage initialization
const storage = new Storage(getGCPCredentials());

const bucketName = process.env.GCP_BUCKET_NAME;
if (!bucketName) {
  throw new Error("GCP_BUCKET_NAME is not defined in the environment variables");
}

export const imageRouter = createTRPCRouter({
  saveImageToText: protectedProcedure
    .input(z.object({ 
      image: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { image: base64Image, width, height } = input;
      const userId = ctx.session.user.id;
      
      const imageUrl = await uploadToTemporaryUrl(base64Image, width, height);
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
        //   model: "gpt-4-vision",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Transcribe the text. Only output the resulting transcribed text." },
                {
                  type: "image_url",
                  image_url: { url: imageUrl },
                },
              ],
            },
          ],
        });
        const extractedText = response.choices[0]?.message?.content ?? "";
        if (!extractedText.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No text detected in the image.",
          });
        }
        // Save extracted text to the database
        const imageToText = await prisma.speechToText.create({
          data: {
            userId: userId,
            text: extractedText,
          },
        });
        await sendToDjango(userId, extractedText);
        return imageToText;
      } catch (error) {
        console.error("Error during image-to-text processing:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Error processing image for text extraction.",
        });
      }
    }),
});

async function uploadToTemporaryUrl(base64Image: string, width?: number, height?: number): Promise<string> {
  // Convert base64 to a Buffer
  const buffer = Buffer.from(base64Image, "base64");

  // Resize and compress the image
  let sharpImage = sharp(buffer);
  if (width && height) {
    sharpImage = sharpImage.resize(width, height, { fit: 'inside' });
  }
  const jpgBuffer = await sharpImage.jpeg({ quality: 80 }).toBuffer();

  const fileName = `uploaded_images/${Date.now()}.jpg`;
  if (!bucketName) {
    throw new Error("Bucket name is not defined");
  }
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);

  // Upload the JPG buffer to Google Cloud Storage
  await file.save(jpgBuffer, {
    contentType: "image/jpeg",
  });

  // Generate a signed URL for temporary access
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000, // URL expires in 1 hour
  });
  // console.log("Testing...")
  // console.log(url)
  return url;
}

async function sendToDjango(userId: string, text: string) {
  try {
    const response = await fetch("https://mindmapp-app-761930939301.us-east4.run.app/api/upload-text/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        transcription: text,
      }),
    });
  
    if (!response.ok) {
      console.error("Failed to send transcription to Django:", await response.json());
      throw new Error("Failed to send transcription to Django");
    }
  
    console.log("Successfully sent transcription to Django");
  } catch (error) {
    console.error("Error sending transcription to Django:", error);
    throw new Error("Error sending transcription to Django");
  }
}
