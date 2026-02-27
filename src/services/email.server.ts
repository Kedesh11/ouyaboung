// ============================================
// Email Service - SMTP Server Implementation
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import 'server-only';

import { randomUUID } from 'node:crypto';
import tls from 'node:tls';
import {
  approvalHtml,
  buildAdminValidationUrl,
  newMerchantAdminHtml,
  rejectionHtml,
} from './email.shared';

type SmtpResult = { success: boolean; error?: string };

type SmtpResponse = {
  code: number;
  message: string;
};

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_SECURE = (process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false';
const SMTP_SENDER_EMAIL = process.env.SMTP_SENDER_EMAIL || SMTP_USER;
const SMTP_SENDER_NAME = process.env.SMTP_SENDER_NAME || 'Ouyaboung';

const getMissingSmtpConfig = (): string[] => {
  const missing: string[] = [];
  if (!SMTP_HOST) missing.push('SMTP_HOST');
  if (!SMTP_PORT || Number.isNaN(SMTP_PORT)) missing.push('SMTP_PORT');
  if (!SMTP_USER) missing.push('SMTP_USER');
  if (!SMTP_PASS) missing.push('SMTP_PASS');
  if (!SMTP_SENDER_EMAIL) missing.push('SMTP_SENDER_EMAIL');
  return missing;
};

const extractSmtpResponse = (buffer: string): { response: SmtpResponse; rest: string } | null => {
  let cursor = 0;
  const lines: string[] = [];

  while (true) {
    const newlineIndex = buffer.indexOf('\n', cursor);
    if (newlineIndex === -1) {
      return null;
    }

    const rawLine = buffer.slice(cursor, newlineIndex + 1);
    const line = rawLine.replace(/\r?\n$/, '');
    lines.push(line);
    cursor = newlineIndex + 1;

    if (/^\d{3} /.test(line)) {
      return {
        response: {
          code: Number(line.slice(0, 3)),
          message: lines.join('\n'),
        },
        rest: buffer.slice(cursor),
      };
    }
  }
};

const createSmtpReader = (socket: tls.TLSSocket) => {
  let buffer = '';
  let socketError: Error | null = null;
  const queuedResponses: SmtpResponse[] = [];
  const pendingResolvers: Array<{
    resolve: (value: SmtpResponse) => void;
    reject: (reason?: unknown) => void;
  }> = [];

  const flushQueue = () => {
    while (queuedResponses.length > 0 && pendingResolvers.length > 0) {
      const resolver = pendingResolvers.shift();
      const response = queuedResponses.shift();
      if (resolver && response) {
        resolver.resolve(response);
      }
    }
  };

  const rejectPending = (error: Error) => {
    while (pendingResolvers.length > 0) {
      const pending = pendingResolvers.shift();
      pending?.reject(error);
    }
  };

  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');

    while (true) {
      const parsed = extractSmtpResponse(buffer);
      if (!parsed) {
        break;
      }

      queuedResponses.push(parsed.response);
      buffer = parsed.rest;
    }

    flushQueue();
  });

  socket.on('error', (error) => {
    socketError = error instanceof Error ? error : new Error('SMTP socket error');
    rejectPending(socketError);
  });

  socket.on('close', () => {
    if (!socketError) {
      socketError = new Error('SMTP connection closed unexpectedly');
      rejectPending(socketError);
    }
  });

  return {
    readResponse: (): Promise<SmtpResponse> =>
      new Promise<SmtpResponse>((resolve, reject) => {
        if (queuedResponses.length > 0) {
          const response = queuedResponses.shift() as SmtpResponse;
          resolve(response);
          return;
        }

        if (socketError) {
          reject(socketError);
          return;
        }

        pendingResolvers.push({ resolve, reject });
      }),
  };
};

const writeLine = (socket: tls.TLSSocket, line: string): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    socket.write(`${line}\r\n`, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

const runCommand = async (
  socket: tls.TLSSocket,
  reader: ReturnType<typeof createSmtpReader>,
  command: string,
  expectedCodes: number[],
  commandName?: string
): Promise<SmtpResponse> => {
  await writeLine(socket, command);
  const response = await reader.readResponse();
  if (!expectedCodes.includes(response.code)) {
    throw new Error(
      `SMTP command ${commandName || command} failed with ${response.code}: ${response.message}`
    );
  }
  return response;
};

const sanitizeForSmtpData = (content: string): string =>
  content
    .replace(/\r?\n/g, '\r\n')
    .replace(/^\./gm, '..');

const encodeBase64Lines = (content: string): string =>
  (Buffer.from(content, 'utf8').toString('base64').match(/.{1,76}/g) || []).join('\r\n');

const formatFromHeader = (): string => `${SMTP_SENDER_NAME} <${SMTP_SENDER_EMAIL}>`;

const buildRawEmail = (to: string, subject: string, html: string): string => {
  const senderDomain = SMTP_SENDER_EMAIL.includes('@')
    ? SMTP_SENDER_EMAIL.split('@')[1]
    : 'localhost';

  const headers = [
    `From: ${formatFromHeader()}`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${senderDomain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBase64Lines(html),
  ];

  return sanitizeForSmtpData(headers.join('\r\n'));
};

const connectSmtpSocket = async (): Promise<tls.TLSSocket> => {
  if (!SMTP_SECURE) {
    throw new Error('SMTP_SECURE=false is not supported in this SMTP implementation.');
  }

  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const socket = tls.connect({
      host: SMTP_HOST,
      port: SMTP_PORT,
      servername: SMTP_HOST,
      rejectUnauthorized: true,
    });

    socket.setTimeout(20000);

    socket.once('secureConnect', () => {
      socket.setTimeout(0);
      resolve(socket);
    });

    socket.once('error', (error) => {
      reject(error);
    });

    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('SMTP connection timeout'));
    });
  });
};

const sendWithSmtp = async (
  to: string,
  subject: string,
  html: string
): Promise<SmtpResult> => {
  const missing = getMissingSmtpConfig();
  if (missing.length > 0) {
    return {
      success: false,
      error: `SMTP configuration missing: ${missing.join(', ')}`,
    };
  }

  let socket: tls.TLSSocket | null = null;

  try {
    socket = await connectSmtpSocket();
    const reader = createSmtpReader(socket);

    const greeting = await reader.readResponse();
    if (greeting.code !== 220) {
      throw new Error(`SMTP greeting failed with ${greeting.code}: ${greeting.message}`);
    }

    await runCommand(socket, reader, 'EHLO ouyaboung.local', [250], 'EHLO');
    await runCommand(socket, reader, 'AUTH LOGIN', [334], 'AUTH LOGIN');
    await runCommand(
      socket,
      reader,
      Buffer.from(SMTP_USER, 'utf8').toString('base64'),
      [334],
      'AUTH USER'
    );
    await runCommand(
      socket,
      reader,
      Buffer.from(SMTP_PASS, 'utf8').toString('base64'),
      [235],
      'AUTH PASS'
    );
    await runCommand(socket, reader, `MAIL FROM:<${SMTP_SENDER_EMAIL}>`, [250], 'MAIL FROM');
    await runCommand(socket, reader, `RCPT TO:<${to}>`, [250, 251], 'RCPT TO');
    await runCommand(socket, reader, 'DATA', [354], 'DATA');

    const rawEmail = buildRawEmail(to, subject, html);
    await writeLine(socket, `${rawEmail}\r\n.`);

    const dataResponse = await reader.readResponse();
    if (dataResponse.code !== 250) {
      throw new Error(`SMTP DATA failed with ${dataResponse.code}: ${dataResponse.message}`);
    }

    await runCommand(socket, reader, 'QUIT', [221], 'QUIT');
    socket.end();

    return { success: true };
  } catch (error: any) {
    if (socket && !socket.destroyed) {
      socket.destroy();
    }
    return { success: false, error: error?.message || 'SMTP send failed' };
  }
};

export const sendMerchantApprovalEmail = async (
  email: string,
  businessName: string
): Promise<SmtpResult> => {
  const subject = `${businessName} - Votre commerce a ete approuve!`;
  return sendWithSmtp(email, subject, approvalHtml(email, businessName));
};

export const sendMerchantRejectionEmail = async (
  email: string,
  businessName: string,
  reason?: string
): Promise<SmtpResult> => {
  const subject = `${businessName} - Mise a jour de votre demande`;
  return sendWithSmtp(email, subject, rejectionHtml(businessName, reason));
};

export const sendAdminNewMerchantEmail = async (params: {
  adminEmail: string;
  adminName?: string;
  merchantName: string;
  merchantEmail: string;
  businessType: string;
  city: string;
  createdAt: string;
}): Promise<SmtpResult> => {
  const subject = `Nouvelle boutique a valider - ${params.merchantName}`;
  const html = newMerchantAdminHtml({
    adminName: params.adminName,
    merchantName: params.merchantName,
    merchantEmail: params.merchantEmail,
    businessType: params.businessType,
    city: params.city,
    createdAt: params.createdAt,
    adminUrl: buildAdminValidationUrl(),
  });
  return sendWithSmtp(params.adminEmail, subject, html);
};
