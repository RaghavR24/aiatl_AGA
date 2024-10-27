import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { OpenAI } from "openai";
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import { createReadStream } from 'fs';
import { SpeechClient } from '@google-cloud/speech';
import { Readable } from 'stream';

const execPromise = util.promisify(exec);

const speech = require('@google-cloud/speech');
const speechClient = new SpeechClient(

);

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
        console.log("filetoTranscript: ", fileToTranscribe)

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

        const audioContent = fs.readFileSync(fileToTranscribe).toString('base64');
        const request = {
          config: {
            encoding: currentExtension, // adjust encoding if necessary
            // sampleRateHertz: 48000, // sample rate of your audio file
            languageCode: 'en-US', // specify language
          },
          audio: { content: audioContent },
        };

        // Transcription request to Google Speech-to-Text
        try {
          const [response] = await speechClient.recognize(request);
          const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join('\n');

          console.log("Transcription successful", transcription);
          console.log("HELLO HELLO HELLO")
          return { text: transcription };
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
