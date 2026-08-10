import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RekognitionClient,
  CreateFaceLivenessSessionCommand,
  GetFaceLivenessSessionResultsCommand,
} from '@aws-sdk/client-rekognition';

@Injectable()
export class RekognitionService {
  private readonly logger = new Logger(RekognitionService.name);

  // Client specifically for Face Liveness (e.g. ap-northeast-1)
  private livenessClient: RekognitionClient;

  private readonly livenessConfidenceThreshold: number;

  constructor(private readonly configService: ConfigService) {
    const livenessRegion = this.configService.get<string>('AWS_LIVENESS_REGION', 'ap-northeast-1');
    this.livenessConfidenceThreshold = Number(this.configService.get<number>('AWS_LIVENESS_CONFIDENCE_THRESHOLD', 70));
    
    this.livenessClient = new RekognitionClient({ region: livenessRegion });
  }

  async createLivenessSession(): Promise<string> {
    try {
      const command = new CreateFaceLivenessSessionCommand({
        Settings: {
          ChallengePreferences: [
            {
              Type: "FaceMovementChallenge"
            },
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
      this.logger.log('response: ', JSON.stringify(response.Challenge));
      return response;
    } catch (error) {
      this.logger.error('Error getting Liveness Session Results', error);
      throw error;
    }
  }
}
