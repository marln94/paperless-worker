import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
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

        // WRK-01: descarga imágenes desde R2/B2 e ingesta en Paperless
        const fileNames = []
        for (const file of job.data.files) {
            const savedFile = await this.storageService.downloadFile(job.data.files[0])
            fileNames.push(savedFile)
        }

        // WRK-02: combina múltiples imágenes en PDF


        // WRK-03: callback a Oracle con paperlessDocumentId
    }
}