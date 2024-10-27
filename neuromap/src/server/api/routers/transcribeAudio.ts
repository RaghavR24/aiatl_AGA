import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { OpenAI } from "openai";
import axios from 'axios';
import { toFile } from 'openai/uploads';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const transcriptionRouter = createTRPCRouter({
  transcribeAudio: protectedProcedure
    .input(z.object({
      audio: z.string(),
      mimeType: z.string().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      console.log("transcribeAudio mutation called");
      try {
        if (!input.audio) {
          throw new Error("No audio data provided");
        }

        // Convert base64 to buffer
        const base64Data = input.audio.split(',')[1];
        if (!base64Data) {
          throw new Error("Invalid audio data format");
        }
        const buffer = Buffer.from(base64Data, 'base64');

        // Convert buffer to File object
        const file = await toFile(buffer, 'audio.mp3');

        // Perform transcription
        const transcription = await openai.audio.transcriptions.create({
          file: file,
          model: "whisper-1",
          language: 'en',
          response_format: 'json',
          temperature: 0.1,
        });

        console.log("Transcription successful");
        console.log("Transcribed data:", transcription.text); // New console log
        return { text: transcription.text };
      } catch (error) {
        console.error("Error in transcribeAudio:", error);
        throw error;
      }
    }),
  
  // ... other procedures ...
});
