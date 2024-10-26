import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { OpenAI } from "openai";
import fs from 'fs';
import path from 'path';
import os from 'os';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const transcriptionRouter = createTRPCRouter({
  transcribeAudio: protectedProcedure
    .input(z.object({
      audio: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
      console.log("transcribeAudio mutation called");
      try {
        console.log("Received input type:", typeof input);
        console.log("Audio data length:", input.audio.length);

        if (!input.audio) {
          throw new Error("No audio data provided");
        }

        // Remove the data URL prefix
        const parts = input.audio.split(',');
        if (parts.length !== 2) {
          throw new Error("Invalid audio data format");
        }
        const base64Data = parts[1];

        // Create a temporary file using os.tmpdir()
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `audio_${Date.now()}.webm`);
        const buffer = Buffer.from(base64Data as string, 'base64');
        
        await fs.promises.writeFile(tempFilePath, buffer);

        try {
          const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-1",
          });

          return { text: transcription.text };
        } finally {
          // Clean up the temporary file
          await fs.promises.unlink(tempFilePath);
        }
      } catch (error) {
        console.error("Error in transcribeAudio:", error);
        throw error;
      }
    }),
  
  // ... other procedures ...
});
