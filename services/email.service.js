const axios = require('axios');
const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../config/logger');

class EmailService {
  constructor() {
    this.resendKey = env.RESEND_API_KEY;
    this.transporter = null;

    if (env.GMAIL_USER && env.GMAIL_PASS) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: env.GMAIL_USER,
          pass: env.GMAIL_PASS
        }
      });
    }
  }

  generate6DigitPin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendWithdrawalPin(toEmail, pin, amount, asset) {
    const subject = `[Fichain Pro] Security Verification: Withdrawal PIN ${pin}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 30px; border-radius: 12px; border: 1px solid #334155;">
        <h2 style="color: #38bdf8; margin-top: 0;">Institutional Security Verification</h2>
        <p style="color: #94a3b8; font-size: 15px;">A withdrawal request of <strong>${amount} ${asset}</strong> was initiated on your Fichain Pro Institutional account.</p>
        <div style="background: #1e293b; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0; border: 1px dashed #38bdf8;">
          <span style="font-size: 13px; color: #94a3b8; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">One-Time Security PIN</span>
          <span style="font-size: 32px; font-weight: bold; color: #38bdf8; letter-spacing: 6px;">${pin}</span>
        </div>
        <p style="color: #64748b; font-size: 13px;">This security PIN expires in 15 minutes. If you did not initiate this transaction, freeze your account immediately via the Security Console.</p>
      </div>
    `;

    return await this.sendEmail(toEmail, subject, html, pin);
  }

  async sendTicketCreatedEmail(toEmail, userName, ticketNumber, subject, message, isDispute = false) {
    const badge = isDispute ? 'DISPUTE ESCALATION' : 'SUPPORT TICKET';
    const emailSubject = `[Fichain Pro ${badge}] ${ticketNumber}: ${subject}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #002625; color: #f8fafc; padding: 30px; border-radius: 16px; border: 1px solid #0BB4D2;">
        <h2 style="color: #0BB4D2; margin-top: 0;">Fichain Pro Institutional Support</h2>
        <p style="color: #cbd5e1; font-size: 14px;">Dear ${userName},</p>
        <p style="color: #94a3b8; font-size: 14px;">Your ${isDispute ? 'trade dispute' : 'support ticket'} has been officially logged with reference number <strong>${ticketNumber}</strong>.</p>
        <div style="background: #001c1c; padding: 20px; border-radius: 10px; margin: 20px 0; border: 1px solid rgba(255,255,255,0.1);">
          <span style="font-size: 11px; color: ${isDispute ? '#f87171' : '#38bdf8'}; font-weight: bold; text-transform: uppercase;">${badge} DETAILS</span>
          <h3 style="color: #fff; margin: 6px 0 12px 0;">${subject}</h3>
          <p style="color: #e2e8f0; font-size: 13px; line-height: 1.6; margin: 0;">${message}</p>
        </div>
        <p style="color: #64748b; font-size: 12px;">A senior portfolio supervisor will review your request. You can reply directly through your investor portal or response to this email thread.</p>
      </div>
    `;
    return await this.sendEmail(toEmail, emailSubject, html);
  }

  async sendNewMessageEmail(toEmail, recipientName, senderName, ticketNumber, subject, messageContent) {
    const emailSubject = `[Fichain Pro Response] Re: ${ticketNumber} - ${subject}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #002625; color: #f8fafc; padding: 30px; border-radius: 16px; border: 1px solid #0BB4D2;">
        <h2 style="color: #0BB4D2; margin-top: 0;">New Message on Ticket ${ticketNumber}</h2>
        <p style="color: #cbd5e1; font-size: 14px;">Hello ${recipientName},</p>
        <p style="color: #94a3b8; font-size: 14px;"><strong>${senderName}</strong> has sent you a new message:</p>
        <div style="background: #001c1c; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #0BB4D2;">
          <p style="color: #f1f5f9; font-size: 14px; line-height: 1.6; margin: 0;">${messageContent}</p>
        </div>
        <p style="color: #64748b; font-size: 12px;">Log in to your Fichain Pro portal to continue the discussion or manage your account.</p>
      </div>
    `;
    return await this.sendEmail(toEmail, emailSubject, html);
  }

  async sendAdminDisputeAlert(adminEmail, user, disputeData) {
    const emailSubject = `[URGENT DISPUTE ALERT] ${disputeData.ticket_number} from ${user.full_name}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #1c0e14; color: #f8fafc; padding: 30px; border-radius: 16px; border: 1px solid #f43f5e;">
        <h2 style="color: #f43f5e; margin-top: 0;">⚠️ Urgent Client Dispute Raised</h2>
        <p style="color: #fda4af; font-size: 14px;">An investor has submitted a formal dispute requiring supervisor intervention:</p>
        <div style="background: #2a111a; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <p style="margin: 0 0 6px 0; font-size: 13px;"><strong>Client:</strong> ${user.full_name} (${user.email} - Account: ${user.account_id})</p>
          <p style="margin: 0 0 6px 0; font-size: 13px;"><strong>Ticket Number:</strong> ${disputeData.ticket_number}</p>
          <p style="margin: 0 0 6px 0; font-size: 13px;"><strong>Subject:</strong> ${disputeData.subject}</p>
          <p style="margin: 0 0 6px 0; font-size: 13px;"><strong>Priority:</strong> URGENT</p>
          ${disputeData.ai_summary ? `<p style="margin: 0 0 6px 0; font-size: 13px; color: #38bdf8;"><strong>AI Summary:</strong> ${disputeData.ai_summary}</p>` : ''}
          <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
            <p style="color: #fff; font-size: 13px; margin: 0;"><strong>Message:</strong></p>
            <p style="color: #cbd5e1; font-size: 13px; margin-top: 4px;">${disputeData.message}</p>
          </div>
        </div>
        <p style="color: #94a3b8; font-size: 12px;">Access the Admin Command Center &gt; Support &amp; Disputes to review and reply.</p>
      </div>
    `;
    return await this.sendEmail(adminEmail || 'admin@mail.com', emailSubject, html);
  }

  async sendEmail(to, subject, html, rawCode = null) {
    logger.info(`[Email Service] Dispatching to ${to}: ${subject} (Code: ${rawCode || 'N/A'})`);

    // Try Resend API as primary delivery engine
    if (this.resendKey && this.resendKey.startsWith('re_')) {
      try {
        const resp = await axios.post(
          'https://api.resend.com/emails',
          {
            from: env.RESEND_FROM_EMAIL || 'Fichain Pro Security <onboarding@resend.dev>',
            to: [to],
            subject,
            html
          },
          {
            headers: {
              Authorization: `Bearer ${this.resendKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        logger.info(`[Email Service] Resend API successful (id: ${resp.data.id})`);
        return { success: true, provider: 'resend', id: resp.data.id, pin: rawCode };
      } catch (err) {
        logger.warn(`[Email Service] Resend API failed (${err.message}). Falling back...`);
      }
    }

    // Try Nodemailer if configured
    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: `"Fichain Pro" <${env.GMAIL_USER}>`,
          to,
          subject,
          html
        });
        logger.info(`[Email Service] Nodemailer sent (id: ${info.messageId})`);
        return { success: true, provider: 'nodemailer', id: info.messageId, pin: rawCode };
      } catch (err) {
        logger.warn(`[Email Service] Nodemailer failed (${err.message}). Falling back to simulation...`);
      }
    }

    // Simulated Delivery for presentation / demo purposes
    logger.info(`[Email Service Simulation] Mock delivery confirmed to ${to}. Security Code: ${rawCode}`);
    return { success: true, provider: 'simulated', pin: rawCode };
  }
}

module.exports = new EmailService();
