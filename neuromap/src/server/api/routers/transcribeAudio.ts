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

        // Check if the file extension is directly supported by Whisper
        const supportedExtensions = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
        const currentExtension = path.extname(fileToTranscribe).slice(1);

        console.log("Current file extension:", currentExtension);

        if (!supportedExtensions.includes(currentExtension)) {
          console.log("File format not directly supported. Attempting conversion to WAV...");
          try {
            const wavFilePath = tempFilePath.replace(path.extname(tempFilePath), '.wav');
            await execPromise(`ffmpeg -i ${tempFilePath} ${wavFilePath}`);
            fileToTranscribe = wavFilePath;
            console.log("Conversion successful. New file path:", fileToTranscribe);
          } catch (conversionError) {
            console.error("FFmpeg conversion failed:", conversionError);
            throw new Error("Unable to convert file to a supported format");
          }
        }

        // Create and check the file stream
        const fileStream = createReadStream(fileToTranscribe);
        console.log("File stream created for:", fileToTranscribe);

        // Log file information
        const fileStats = await fs.promises.stat(fileToTranscribe);
        console.log("File size:", fileStats.size, "bytes");

        // Check file type using file command
        try {
          const { stdout } = await execPromise(`file -b --mime-type ${fileToTranscribe}`);
          console.log("Detected MIME type:", stdout.trim());
        } catch (error) {
          console.error("Error detecting file type:", error);
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
          console.error("Error details:", JSON.stringify(error, null, 2));
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
