import { WebClient } from '@slack/web-api';

export interface ApprovalMessageOptions {
  requestId: string;
  endpoint: string;
  method: string;
  params: unknown;
  reason: string;
  expiresInMinutes: number;
  channelId: string;
}

export interface ApprovalResult {
  ts: string;
  channelId: string;
}

export class SlackNotifier {
  private client: WebClient;

  constructor(botToken: string) {
    this.client = new WebClient(botToken);
  }

  async sendApprovalRequest(opts: ApprovalMessageOptions): Promise<ApprovalResult> {
    const paramsPreview = JSON.stringify(opts.params, null, 2).slice(0, 500);

    const result = await this.client.chat.postMessage({
      channel: opts.channelId,
      text: `Write approval requested: ${opts.method} ${opts.endpoint}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Write Approval Requested' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Operation:*\n\`${opts.method} ${opts.endpoint}\`` },
            { type: 'mrkdwn', text: `*Expires:*\n${opts.expiresInMinutes} minutes` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Reason:*\n${opts.reason}` },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Params (PII masked):*\n\`\`\`${paramsPreview}\`\`\``,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Approve' },
              style: 'primary',
              action_id: `pii_proxy_approve_${opts.requestId}`,
              value: opts.requestId,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Deny' },
              style: 'danger',
              action_id: `pii_proxy_deny_${opts.requestId}`,
              value: opts.requestId,
            },
          ],
        },
      ],
    });

    if (!result.ok || !result.ts) {
      throw new Error(`Slack postMessage failed: ${result.error}`);
    }

    return { ts: result.ts, channelId: opts.channelId };
  }

  async postThreadReply(channelId: string, threadTs: string, text: string): Promise<void> {
    await this.client.chat.postMessage({ channel: channelId, thread_ts: threadTs, text });
  }

  async updateApprovalMessage(
    channelId: string,
    ts: string,
    status: 'approved' | 'denied' | 'expired',
    detail?: string,
  ): Promise<void> {
    const label = status === 'approved' ? 'Approved' : status === 'denied' ? 'Denied' : 'Expired';
    await this.client.chat.update({
      channel: channelId,
      ts,
      text: `${label}${detail ? `: ${detail}` : ''}`,
      blocks: [{
        type: 'section',
        text: { type: 'mrkdwn', text: `*${label}*${detail ? `\n${detail}` : ''}` },
      }],
    });
  }
}
