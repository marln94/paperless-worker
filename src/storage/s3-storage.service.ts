import { Injectable, Logger } from '@nestjs/common';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

@Injectable()
export class S3StorageService {
    private readonly logger = new Logger(S3StorageService.name);
    private readonly client: S3Client;
    private readonly bucket: string;
    private readonly publicUrl: string;

    constructor() {
        const endpoint = process.env.B2_ENDPOINT;
        const region = process.env.B2_REGION;
        const accessKeyId = process.env.B2_ACCESS_KEY_ID;
        const secretAccessKey = process.env.B2_SECRET_ACCESS_KEY;
        const bucket = process.env.B2_BUCKET;
        const publicUrl = process.env.B2_PUBLIC_URL;

        if (
            !endpoint ||
            !region ||
            !accessKeyId ||
            !secretAccessKey ||
            !bucket ||
            !publicUrl
        ) {
            throw new Error('Missing B2 environment variables');
        }

        this.client = new S3Client({
            endpoint,
            region,
            credentials: { accessKeyId, secretAccessKey },
            forcePathStyle: true,
        });
        this.bucket = bucket;
        this.publicUrl = publicUrl;
    }

    async downloadFile(file: string) {
        const command = new GetObjectCommand({
            Bucket: process.env.B2_BUCKET,
            Key: file
        });

        try {
            const fileName = file.split('/').pop();
            const response = await this.client.send(command);

            const s3Stream = response.Body as Readable;
            const writeStream = createWriteStream(fileName);

            await pipeline(s3Stream, writeStream);

            return fileName;
        } catch (err) {
            this.logger.error("Error downloading file:", err);
        }
    }
}
