import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RekognitionClient,
  CreateFaceLivenessSessionCommand,
  GetFaceLivenessSessionResultsCommand,
  SearchFacesByImageCommand,
} from '@aws-sdk/client-rekognition';

@Injectable()
export class RekognitionService {
  private readonly logger = new Logger(RekognitionService.name);

  // Client for standard Rekognition features (e.g. ap-southeast-1)
  private rekognitionClient: RekognitionClient;

  // Client specifically for Face Liveness (e.g. ap-northeast-1)
  private livenessClient: RekognitionClient;

  private collectionId: string;
  private readonly livenessConfidenceThreshold: number;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION', 'ap-southeast-1');
    const livenessRegion = this.configService.get<string>('AWS_LIVENESS_REGION', 'ap-northeast-1');
    this.livenessConfidenceThreshold = Number(this.configService.get<number>('AWS_LIVENESS_CONFIDENCE_THRESHOLD', 70));
    this.collectionId = this.configService.get<string>('AWS_REKOGNITION_COLLECTION_ID', 'lecturer');
    
    this.rekognitionClient = new RekognitionClient({ region });
    this.livenessClient = new RekognitionClient({ region: livenessRegion });
  }

  async createLivenessSession(): Promise<string> {
    try {
      const command = new CreateFaceLivenessSessionCommand({
        Settings: {
          ChallengePreferences: [
            {
              Type: "FaceMovementAndLightChallenge"
            }
          ]
        }
      });
      const response = await this.livenessClient.send(command);
      if (!response.SessionId) throw new Error('SessionId is undefined');
      return response.SessionId;
    } catch (error) {
      this.logger.error('Error creating Liveness Session', error);
      throw error;
    }
  }

  async getLivenessSessionResults(sessionId: string) {
    try {
      const command = new GetFaceLivenessSessionResultsCommand({
        SessionId: sessionId,
      });
      const response = await this.livenessClient.send(command);
      return response;
    } catch (error) {
      this.logger.error('Error getting Liveness Session Results', error);
      throw error;
    }
  }

  async searchFacesByImage(imageBytes: Uint8Array) {
    try {
      const command = new SearchFacesByImageCommand({
        CollectionId: this.collectionId,
        Image: {
          Bytes: imageBytes,
        },
        MaxFaces: 1,
        FaceMatchThreshold: this.livenessConfidenceThreshold, // Minimum match confidence
      });

      const response = await this.rekognitionClient.send(command);
      return response.FaceMatches;
    } catch (error) {
      this.logger.error('Error searching faces by image', error);
      throw error;
    }
  }
}
