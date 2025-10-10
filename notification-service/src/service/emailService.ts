import { sendMail } from "../config/mailer";

class EmailService {
  async sendVerificationEmail(to: string, verificationToken: string) {
    // 💡 In a real app, use a templating engine (like Handlebars) here
    const verificationLink = `${process.env.FRONTEND_URL}/verify?token=${verificationToken}`;

    const mailOptions = {
      from: `"E-Commerce App" <no-reply@ecommerce.com>`,
      to: to,
      subject: "Verify Your E-Commerce Account",
      html: `
              <h1>Welcome!</h1>
              <p>Please click the link below to verify your account:</p>
              <a href="${verificationLink}">Verify Account</a>
              <p>If you did not request this, please ignore this email.</p>
          `,
    };

    return sendMail(mailOptions);
  }

  async sendPasswordResetEmail(to: string, resetToken: string) {
    // 💡 In a real app, use a templating engine (like Handlebars) here
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"E-Commerce App" <no-reply@ecommerce.com>`,
      to: to,
      subject: "Reset Your E-Commerce Password",
      html: `
            <h1>Password Reset Request</h1>
            <p>Please click the link below to reset your password:</p>
            <a href="${resetLink}">Reset Password</a>
            <p>If you did not request this, please ignore this email.</p>
        `,
    };

    return sendMail(mailOptions);
  }
}

export const emailService = new EmailService();
