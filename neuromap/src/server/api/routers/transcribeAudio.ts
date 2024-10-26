import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { OpenAI } from "openai";
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const transcriptionRouter = createTRPCRouter({
  transcribeAudio: protectedProcedure
    .input(z.object({
      audio: z.string(),
      mimeType: z.string()
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

        // Determine file extension based on MIME type
        let fileExtension = '.webm';
        if (input.mimeType.includes('audio/mp4')) {
          fileExtension = '.m4a';
        }

        // Create a temporary file using os.tmpdir()
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `audio_${Date.now()}${fileExtension}`);
        const buffer = Buffer.from(base64Data!, 'base64');
        
        await fs.promises.writeFile(tempFilePath, buffer);

        let fileToTranscribe = tempFilePath;

        // Convert M4A to WAV if necessary
        if (fileExtension === '.m4a') {
          const wavFilePath = tempFilePath.replace('.m4a', '.wav');
          await execPromise(`ffmpeg -i ${tempFilePath} ${wavFilePath}`);
          fileToTranscribe = wavFilePath;
        }

        try {
          const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(fileToTranscribe),
            model: "whisper-1",
          });

          return { text: transcription.text };
        } finally {
          // Clean up the temporary files
          await fs.promises.unlink(tempFilePath);
          if (fileExtension === '.m4a') {
            await fs.promises.unlink(fileToTranscribe);
          }
        }
      } catch (error) {
        console.error("Error in transcribeAudio:", error);
        throw error;
      }
    }),
  
  // ... other procedures ...
});
