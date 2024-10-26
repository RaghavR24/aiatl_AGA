import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { OpenAI } from "openai";
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import { createReadStream } from 'fs';
import { Readable } from 'stream';

const execPromise = util.promisify(exec);

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
        console.log("Received input type:", typeof input);
        console.log("Audio data length:", input.audio.length);
        console.log("MIME type:", input.mimeType);

        // New logging for more detailed input information
        const audioPrefix = input.audio.substring(0, 100); // Get the first 100 characters
        console.log("Audio data prefix:", audioPrefix);

        if (!input.audio) {
          throw new Error("No audio data provided");
        }

        // Attempt to parse the data URL
        const parts = input.audio.split(',');
        if (parts.length === 2) {
          const [header, ] = parts;
          console.log("Data URL header:", header);
        } else {
          console.log("Input is not in data URL format");
        }

        // Remove the data URL prefix
        const base64Data = parts[1];

        // Determine file extension based on MIME type
        let fileExtension = '.webm';
        if (input.mimeType?.includes('audio/mp4')) {
          fileExtension = '.m4a';
        } else if (input.mimeType?.includes('audio/mpeg')) {
          fileExtension = '.mp3';
        } else if (input.mimeType?.includes('audio/wav')) {
          fileExtension = '.wav';
        }

        // Create a temporary file using os.tmpdir()
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `audio_${Date.now()}${fileExtension}`);
        const buffer = Buffer.from(base64Data!, 'base64');
        
        await fs.promises.writeFile(tempFilePath, buffer);

        let fileToTranscribe = tempFilePath;

        // Attempt to convert to WAV if the format is not directly supported
        if (!['wav', 'mp3', 'm4a'].includes(fileExtension.slice(1))) {
          try {
            const wavFilePath = tempFilePath.replace(fileExtension, '.wav');
            await execPromise(`ffmpeg -i ${tempFilePath} ${wavFilePath}`);
            fileToTranscribe = wavFilePath;
          } catch (conversionError) {
            console.warn("FFmpeg conversion failed, proceeding with original file:", conversionError);
            // Continue with the original file if conversion fails
          }
        }

        console.log("MIME type:", input.mimeType);
        console.log("File extension:", fileExtension);
        console.log("Temp file path:", tempFilePath);
        console.log("File to transcribe:", fileToTranscribe);

        // Log file information
        const fileStats = await fs.promises.stat(fileToTranscribe);
        console.log("File size:", fileStats.size, "bytes");

        // Check file type using file command
        try {
          const { stdout } = await execPromise(`file -b --mime-type ${fileToTranscribe}`);
          console.log("Detected file type:", stdout.trim());
        } catch (error) {
          console.error("Error detecting file type:", error);
        }

        // Create and check the file stream
        const fileStream = createReadStream(fileToTranscribe);
        console.log("File stream created");

        if (fileStream instanceof Readable) {
          console.log("File stream is readable");
        } else {
          console.log("File stream is not readable");
        }

        try {
          const transcription = await openai.audio.transcriptions.create({
            file: fileStream,
            model: "whisper-1",
          });

          console.log("Transcription successful");
          return { text: transcription.text };
        } catch (error) {
          console.error("Error during transcription:", error);
          throw error;
        } finally {
          // Clean up the temporary files
          await fs.promises.unlink(tempFilePath);
          if (fileToTranscribe !== tempFilePath) {
            try {
              await fs.promises.unlink(fileToTranscribe);
            } catch (unlinkError) {
              console.warn("Error deleting converted file:", unlinkError);
            }
          }
        }
      } catch (error) {
        console.error("Error in transcribeAudio:", error);
        throw error;
      }
    }),
  
  // ... other procedures ...
});
