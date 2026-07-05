import nodemailer from 'nodemailer';
import type { SentMessageInfo, Transporter } from 'nodemailer';

// ============================================================
// Nodemailer Transporter Configuration
// ============================================================
// ============================================================

const MAX_EMAIL_RETRIES = 2;
let transporter: Transporter | null = null;
let emailEnabled = false;

function getTransporter(): Transporter | null {
  if (transporter) {
    return transporter;
  }

  const emailHost = process.env.EMAIL_HOST;
  const emailPort = process.env.EMAIL_PORT;
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailHost || !emailPort || !emailUser || !emailPass) {
    console.warn(
      'Email configuration incomplete. Email sending will be disabled. ' +
      'Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS environment variables.'
    );
    emailEnabled = false;
    return null;
  }

  emailEnabled = true;
  transporter = nodemailer.createTransport({
    host: emailHost,
    port: parseInt(emailPort, 10),
    secure: emailPort === '465',
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  return transporter;
}

function isEmailConfigured(): boolean {
  return Boolean(getTransporter() && emailEnabled);
}

// ============================================================
// Core Email Sending Function
// ============================================================

/**
 * Send a generic email
 * - Uses async/await internally
 * - Uses retries for transient failures
 * - Does not throw, does not break workflow on failure
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.log(`[EMAIL] Skipping email to ${to} - email not configured`);
    return false;
  }

  const mailer = getTransporter();
  if (!mailer) {
    console.error(`[EMAIL] Transporter not available for ${to}`);
    return false;
  }

  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@example.com';

  for (let attempt = 1; attempt <= MAX_EMAIL_RETRIES; attempt += 1) {
    try {
      const info = await new Promise<SentMessageInfo>((resolve, reject) => {
        mailer.sendMail({ from, to, subject, html }, (error: Error | null, info: SentMessageInfo | undefined) => {
          if (error) {
            reject(error);
          } else if (!info) {
            reject(new Error('No message info returned'));
          } else {
            resolve(info);
          }
        });
      });

      console.log(`Email sent to ${to} (${info.messageId})`);
      return true;
    } catch (error) {
      console.error(`Email failed to ${to} (attempt ${attempt}): ${error instanceof Error ? error.message : String(error)}`);

      if (attempt < MAX_EMAIL_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  console.error(`Email failed: all ${MAX_EMAIL_RETRIES} attempts exhausted for ${to}`);
  return false;
}

// ============================================================
// Email Template Functions
// ============================================================

/**
 * Email template: Memo Assigned to Manager
 * Notifies manager that a new memo is waiting for approval
 */
function getMemoAssignedTemplate(memoTitle: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
          }
          .container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            border-bottom: 3px solid #007bff;
            padding-bottom: 20px;
            margin-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            color: #007bff;
            font-size: 24px;
          }
          .content {
            margin: 20px 0;
          }
          .memo-title {
            background-color: #f8f9fa;
            padding: 15px;
            border-left: 4px solid #007bff;
            margin: 20px 0;
            font-weight: bold;
            font-size: 16px;
          }
          .action-text {
            color: #666;
            margin: 15px 0;
            font-size: 14px;
          }
          .footer {
            border-top: 1px solid #ddd;
            padding-top: 20px;
            margin-top: 30px;
            font-size: 12px;
            color: #999;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📋 New Memo Awaiting Approval</h1>
          </div>
          
          <div class="content">
            <p>Hello,</p>
            
            <p>You have a new memo waiting for your approval.</p>
            
            <div class="memo-title">
              ${escapeHtml(memoTitle)}
            </div>
            
            <p class="action-text">
              Please review the memo and take appropriate action (approve, query for clarification, or decline).
            </p>
            
            <p>Thank you,<br/>
            Flowstate Workflow System</p>
          </div>
          
          <div class="footer">
            <p>This is an automated email. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Email template: Memo Queried
 * Notifies creator that a manager has queried their memo
 */
function getMemoQueriedTemplate(memoTitle: string, managerComment: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
          }
          .container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            border-bottom: 3px solid #ffc107;
            padding-bottom: 20px;
            margin-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            color: #ffc107;
            font-size: 24px;
          }
          .content {
            margin: 20px 0;
          }
          .memo-title {
            background-color: #f8f9fa;
            padding: 15px;
            border-left: 4px solid #ffc107;
            margin: 20px 0;
            font-weight: bold;
            font-size: 16px;
          }
          .comment-box {
            background-color: #fffbf0;
            padding: 15px;
            border-left: 4px solid #ffc107;
            margin: 20px 0;
            font-size: 14px;
            line-height: 1.5;
          }
          .action-text {
            color: #666;
            margin: 15px 0;
            font-size: 14px;
          }
          .footer {
            border-top: 1px solid #ddd;
            padding-top: 20px;
            margin-top: 30px;
            font-size: 12px;
            color: #999;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Your Memo Was Queried</h1>
          </div>
          
          <div class="content">
            <p>Hello,</p>
            
            <p>A manager has queried your memo for clarification.</p>
            
            <div class="memo-title">
              ${escapeHtml(memoTitle)}
            </div>
            
            <p style="font-weight: bold; color: #666;">Manager's Comment:</p>
            <div class="comment-box">
              ${escapeHtml(managerComment)}
            </div>
            
            <p class="action-text">
              Please review the feedback and revise your memo if needed. You can resubmit it for approval.
            </p>
            
            <p>Thank you,<br/>
            Flowstate Workflow System</p>
          </div>
          
          <div class="footer">
            <p>This is an automated email. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Email template: Memo Approved
 * Notifies creator that their memo was approved
 */
function getMemoApprovedTemplate(memoTitle: string, approverName: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
          }
          .container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            border-bottom: 3px solid #28a745;
            padding-bottom: 20px;
            margin-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            color: #28a745;
            font-size: 24px;
          }
          .content {
            margin: 20px 0;
          }
          .memo-title {
            background-color: #f8f9fa;
            padding: 15px;
            border-left: 4px solid #28a745;
            margin: 20px 0;
            font-weight: bold;
            font-size: 16px;
          }
          .success-text {
            color: #28a745;
            margin: 15px 0;
            font-size: 14px;
            font-weight: bold;
          }
          .footer {
            border-top: 1px solid #ddd;
            padding-top: 20px;
            margin-top: 30px;
            font-size: 12px;
            color: #999;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Your Memo Was Approved</h1>
          </div>
          
          <div class="content">
            <p>Hello,</p>
            
            <p class="success-text">Great news! Your memo has been approved.</p>
            
            <div class="memo-title">
              ${escapeHtml(memoTitle)}
            </div>
            
            <p>Approved by: <strong>${escapeHtml(approverName)}</strong></p>
            
            <p>Thank you,<br/>
            Flowstate Workflow System</p>
          </div>
          
          <div class="footer">
            <p>This is an automated email. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Email template: Memo Declined
 * Notifies creator that their memo was declined
 */
function getMemoDeclinedTemplate(memoTitle: string, declinerName: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
          }
          .container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            border-bottom: 3px solid #dc3545;
            padding-bottom: 20px;
            margin-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            color: #dc3545;
            font-size: 24px;
          }
          .content {
            margin: 20px 0;
          }
          .memo-title {
            background-color: #f8f9fa;
            padding: 15px;
            border-left: 4px solid #dc3545;
            margin: 20px 0;
            font-weight: bold;
            font-size: 16px;
          }
          .footer {
            border-top: 1px solid #ddd;
            padding-top: 20px;
            margin-top: 30px;
            font-size: 12px;
            color: #999;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>❌ Your Memo Was Declined</h1>
          </div>
          
          <div class="content">
            <p>Hello,</p>
            
            <p>Your memo has been declined and will not proceed further.</p>
            
            <div class="memo-title">
              ${escapeHtml(memoTitle)}
            </div>
            
            <p>Declined by: <strong>${escapeHtml(declinerName)}</strong></p>
            
            <p>You can contact your manager for more information.</p>
            
            <p>Thank you,<br/>
            Flowstate Workflow System</p>
          </div>
          
          <div class="footer">
            <p>This is an automated email. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// ============================================================
// Specific Email Sending Functions
// ============================================================

/**
 * Send email when a memo is assigned to a manager
 * Called after memo creation in submitMemo()
 */
export async function sendMemoAssignedEmail(
  managerEmail: string,
  memoTitle: string
): Promise<void> {
  try {
    const html = getMemoAssignedTemplate(memoTitle);
    await sendEmail(managerEmail, 'New Memo Awaiting Approval', html);
  } catch (error) {
    console.error(
      `Failed to send memo assigned email: ${error instanceof Error ? error.message : String(error)}`
    );
    // Do not throw - email failure should not break workflow
  }
}

/**
 * Send email when a memo is queried by a manager
 * Called after queryMemo() updates the memo
 */
export async function sendMemoQueriedEmail(
  creatorEmail: string,
  memoTitle: string,
  managerComment: string
): Promise<void> {
  try {
    const html = getMemoQueriedTemplate(memoTitle, managerComment);
    await sendEmail(creatorEmail, 'Your Memo Was Queried', html);
  } catch (error) {
    console.error(
      `Failed to send memo queried email: ${error instanceof Error ? error.message : String(error)}`
    );
    // Do not throw - email failure should not break workflow
  }
}

/**
 * Send email when a memo is approved by a manager
 * Called after approveMemo() if status becomes APPROVED
 */
export async function sendMemoApprovedEmail(
  creatorEmail: string,
  memoTitle: string,
  approverName: string
): Promise<void> {
  try {
    const html = getMemoApprovedTemplate(memoTitle, approverName);
    await sendEmail(creatorEmail, 'Your Memo Was Approved', html);
  } catch (error) {
    console.error(
      `Failed to send memo approved email: ${error instanceof Error ? error.message : String(error)}`
    );
    // Do not throw - email failure should not break workflow
  }
}

/**
 * Send email when a memo is declined by a manager
 * Called after declineMemo()
 */
export async function sendMemoDeclinedEmail(
  creatorEmail: string,
  memoTitle: string,
  declinerName: string
): Promise<void> {
  try {
    const html = getMemoDeclinedTemplate(memoTitle, declinerName);
    await sendEmail(creatorEmail, 'Your Memo Was Declined', html);
  } catch (error) {
    console.error(
      `Failed to send memo declined email: ${error instanceof Error ? error.message : String(error)}`
    );
    // Do not throw - email failure should not break workflow
  }
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Escape HTML special characters to prevent injection
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Queue placeholder for future scaling
 * Currently emails are sent synchronously (fire and forget)
 * In future, could queue emails for batch processing
 */
export interface EmailJob {
  to: string;
  subject: string;
  html: string;
  retries: number;
  createdAt: Date;
}

const emailQueue: EmailJob[] = [];

export function addToEmailQueue(job: EmailJob): void {
  emailQueue.push(job);
  // Future: Process queue with background job worker
}

export function getEmailQueueSize(): number {
  return emailQueue.length;
}
