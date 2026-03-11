export interface WriteRequest {
  id: string;
  endpoint: string;
  method: string;
  params: unknown;        // PII already masked
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'executed';
  createdAt: number;
  expiresAt: number;
  slackMessageTs?: string;
  slackChannelId?: string;
}

export interface PiiMapping {
  masked: string;
  real: string;
  fieldType: string;
  createdAt: number;
}
