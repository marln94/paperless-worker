import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

import { S3StorageService } from '../storage/s3-storage.service';

@Processor('documents')
export class DocumentsProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentsProcessor.name);

  constructor(private readonly storageService: S3StorageService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);
    this.logger.log(`Payload: ${JSON.stringify(job.data)}`);

    // Download files from storage
    const fileNames = [];
    for (const file of job.data.files) {
      const savedFile = await this.storageService.downloadFile(file);
      fileNames.push(savedFile);
    }

    // Combine images into a single PDF
    const bytes = await this.joinImagesToPdf(fileNames);
    await this.uploadToPaperless(
      bytes,
      job.data.transactionId,
      job.data.metadata,
    );

    // TODO: update attachment status on DB
  }

  /**
   * Combines an array of local image paths into a single PDF file.
   * @param imagePaths Array of absolute or relative paths to the images.
   */
  private async joinImagesToPdf(imagePaths: string[]) {
    // Create a blank PDF Document
    const pdfDoc = await PDFDocument.create();

    for (const imgPath of imagePaths) {
      const ext = path.extname(imgPath).toLowerCase();
      const imageBytes = fs.readFileSync(imgPath);

      let embeddedImage;

      // Embed the appropriate image type based on file extension
      if (ext === '.jpg' || ext === '.jpeg') {
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
      } else if (ext === '.png') {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
      } else {
        this.logger.warn(`Unsupported file format skipped: ${ext}`);
        continue;
      }

      // Get original dimensions of the image
      const { width, height } = embeddedImage.scale(1);

      // Add a new page matching the exact dimensions of the image
      const page = pdfDoc.addPage([width, height]);

      // Draw the image to fill the entire page
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: width,
        height: height,
      });
    }

    // Serialize the PDFDocument to bytes
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
  }

  private async uploadToPaperless(
    pdfBuffer: Uint8Array,
    transactionId: number,
    metadata?: {
      title: string;
      date: string;
      correspondent: string;
      tags: string[];
    },
  ) {
    try {
      const form = new FormData();

      const fileBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
      form.append('document', fileBlob, `transaction-${transactionId}.pdf`);

      form.append('document_type', 1); // Factura

      if (metadata?.title) {
        form.append('title', metadata.title);
      }

      if (metadata?.date) {
        form.append('created', metadata.date);
      }

      if (metadata?.correspondent) {
        const correspondentId = await this.findOrCreateCorrespondent(
          metadata.correspondent,
        );
        form.append('correspondent', correspondentId.toString());
      }

      if (metadata?.tags) {
        const tagIds = await this.findOrCreateTags(metadata.tags);
        tagIds.forEach((id) => form.append('tags', id.toString()));
      }

      const response = await fetch(
        `${process.env.PAPERLESS_API_URL}/api/documents/post_document/`,
        {
          method: 'POST',
          body: form,
          headers: {
            Authorization: `Basic ${Buffer.from(process.env.PAPERLESS_API_TOKEN).toString('base64')}`,
          },
        },
      );
      this.logger.log(
        'Paperless request finished with status',
        response.status,
      );
    } catch (err) {
      this.logger.error(err);
    }
  }

  private async findOrCreateCorrespondent(name: string): Promise<number> {
    this.logger.log('name', name);
    const searchResponse = await fetch(
      `${process.env.PAPERLESS_API_URL}/api/correspondents/?name__icontains=${encodeURIComponent(name)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(process.env.PAPERLESS_API_TOKEN).toString('base64')}`,
        },
      },
    );

    const searchData = (await searchResponse.json()) as {
      results: { id: number }[];
    };

    if (searchData.results.length > 0) {
      return searchData['results'][0]['id'];
    }

    this.logger.log(`Creating correspondent: ${name}`);
    const createResponse = await fetch(
      `${process.env.PAPERLESS_API_URL}/api/correspondents/`,
      {
        method: 'POST',
        body: JSON.stringify({ name }),
        headers: {
          Authorization: `Basic ${Buffer.from(process.env.PAPERLESS_API_TOKEN).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const createdData = await createResponse.json();

    return createdData['id'];
  }

  private async findOrCreateTags(names: string[]): Promise<number[]> {
    return Promise.all(
      names.map(async (name) => {
        const searchResponse = await fetch(
          `${process.env.PAPERLESS_API_URL}/api/tags/?name__icontains=${encodeURIComponent(name)}`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(process.env.PAPERLESS_API_TOKEN).toString('base64')}`,
            },
          },
        );

        const searchData = (await searchResponse.json()) as {
          results: { id: number }[];
        };

        if (searchData.results.length > 0) {
          return searchData.results[0].id;
        }

        this.logger.log(`Creating tag: ${name}`);
        const createResponse = await fetch(
          `${process.env.PAPERLESS_API_URL}/api/tags/`,
          {
            method: 'POST',
            body: JSON.stringify({ name }),
            headers: {
              Authorization: `Basic ${Buffer.from(process.env.PAPERLESS_API_TOKEN).toString('base64')}`,
              'Content-Type': 'application/json',
            },
          },
        );
        const createdData = await createResponse.json();

        return createdData['id'];
      }),
    );
  }
}
