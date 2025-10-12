// templates/emailTemplates.ts
interface EmailTemplateData {
  verificationLink?: string;
  resetLink?: string;
}

class EmailTemplates {
  private baseTemplate(html: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          ${html}
        </div>
      </body>
      </html>
    `;
  }

  verification(data: EmailTemplateData): string {
    return this.baseTemplate(`
      <h1>Welcome to Our E-Commerce Store! 🎉</h1>
      <p>We're excited to have you on board. To get started, please verify your email address by clicking the button below:</p>
      <p style="text-align: center;">
        <a href="${data.verificationLink}" class="button">Verify Your Account</a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p><code>${data.verificationLink}</code></p>
      <div class="footer">
        <p>If you didn't create an account, please ignore this email.</p>
        <p>This link will expire in 24 hours.</p>
      </div>
    `);
  }

  passwordReset(data: EmailTemplateData): string {
    return this.baseTemplate(`
      <h1>Reset Your Password</h1>
      <p>We received a request to reset your password. Click the button below to create a new password:</p>
      <p style="text-align: center;">
        <a href="${data.resetLink}" class="button">Reset Password</a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p><code>${data.resetLink}</code></p>
      <div class="footer">
        <p>If you didn't request a password reset, please ignore this email.</p>
        <p>This link will expire in 1 hour.</p>
      </div>
    `);
  }
}

export const emailTemplates = new EmailTemplates();
