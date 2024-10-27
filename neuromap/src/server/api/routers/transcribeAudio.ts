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
import { protos } from '@google-cloud/speech';
import { TRPCError } from "@trpc/server";

const execPromise = util.promisify(exec);

// Add this new function to get GCP credentials
export const getGCPCredentials = () => {
  // for Vercel, use environment variables
  return process.env.GCP_PRIVATE_KEY
    ? {
        credentials: {
          client_email: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
          private_key: process.env.GCP_PRIVATE_KEY,
        },
        projectId: process.env.GCP_PROJECT_ID,
      }
    // for local development, use gcloud CLI
    : {};
};

// Update the SpeechClient initialization
const speechClient = new SpeechClient(getGCPCredentials());

const getAudioEncoding = (extension: string): protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding => {
  switch (extension) {
    case 'wav': return protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16;
    case 'mp3': return protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.MP3;
    case 'ogg': return protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.OGG_OPUS;
    case 'flac': return protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.FLAC;
    default: return protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED;
  }
};

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
            encoding: getAudioEncoding(currentExtension),
            languageCode: 'en-US',
          },
          audio: { content: audioContent },
        };

        // Transcription request to Google Speech-to-Text
        try {
          if (!process.env.GCP_PRIVATE_KEY) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Google Cloud credentials are not configured',
            });
          }

          const [response] = await speechClient.recognize(request);
          const transcription = response.results
            ?.map((result: protos.google.cloud.speech.v1.ISpeechRecognitionResult) => result.alternatives?.[0]?.transcript)
            .join('\n') ?? '';

          console.log("Transcription successful", transcription);
          return { text: transcription };
        } catch (error) {
          console.error("Error during transcription:", error);
          if (error instanceof Error) {
            console.error("Error details:", error.message);
          }
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to transcribe audio',
            cause: error,
          });
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
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
          cause: error,
        });
      }
    }),
  
  // ... other procedures ...
});
