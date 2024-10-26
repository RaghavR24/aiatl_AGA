import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import OpenAI from "openai";
import sharp from "sharp";
import { Storage } from "@google-cloud/storage";


const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GCP_KEY_FILE, // Path to your GCP credentials JSON file
});
const bucketName = process.env.GCP_BUCKET_NAME;
if (!bucketName) {
  throw new Error("GCP_BUCKET_NAME is not defined in the environment variables");
}

export const imageRouter = createTRPCRouter({
  saveImageToText: protectedProcedure
    .input(z.object({ image: z.string() })) // Accepts base64 string
    .mutation(async ({ ctx, input }) => {
      const { image: base64Image } = input;
      const userId = ctx.session.user.id;
      
      // For this example, assume we have a function `uploadToTemporaryUrl` that handles
      // uploading the base64 image to a file hosting service and returns a URL.
      const imageUrl = await uploadToTemporaryUrl(base64Image);
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
        // await sendToDjango(userId, extractedText);
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
// // Placeholder function for image upload; replace with actual image hosting code.
// async function uploadToTemporaryUrl(base64Image: string): Promise<string> {
//   // Implement the logic to upload the base64 image to a temporary URL and return the URL.
//   return "https://your-temp-image-url.com/uploaded_image.png";
// }
async function uploadToTemporaryUrl(base64Image: string): Promise<string> {
    // Convert base64 to a Buffer
    const buffer = Buffer.from(base64Image, "base64");
  
    // Convert the image to JPG format
    const jpgBuffer = await sharp(buffer).jpeg({ quality: 80 }).toBuffer();
  
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
      const response = await fetch("http://127.0.0.1:8000/api/upload-text/", {
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
  