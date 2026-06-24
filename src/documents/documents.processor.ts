import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('documents')
export class DocumentsProcessor extends WorkerHost {
    private readonly logger = new Logger(DocumentsProcessor.name);

    async process(job: Job): Promise<void> {
        this.logger.log(`Processing job ${job.id} of type ${job.name}`);
        this.logger.log(`Payload: ${JSON.stringify(job.data)}`);

        // WRK-01: descarga imágenes desde R2/B2 e ingesta en Paperless
        // WRK-02: combina múltiples imágenes en PDF
        // WRK-03: callback a Oracle con paperlessDocumentId
    }
}